"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cfeDocuments, fiscalSettings } from "@/db/schema";
import { requireAdmin, requireUser } from "@/services/auth/session";
import { errorMessage } from "@/utils/validation";
import { getDgiConfig, isDgiConfigured } from "./config";
import { getProvider } from "./providers";
import { mapSaleReceiptToFiscalInput } from "./mapper";
import { toFiscalDocument } from "./adapter";
import { validateCfeType, validateFiscalSaleInput } from "./schemas";
import { toPublicError } from "./errors";
import { getSaleReceipt } from "@/services/shipments/actions";
import type {
  CfeRecord,
  CfeStatus,
  FiscalSettings as FiscalSettingsType,
  IssueCfeResult,
} from "./types";

function mapSettings(row: typeof fiscalSettings.$inferSelect | undefined): FiscalSettingsType {
  return {
    enabled: row?.enabled ?? false,
    provider: (row?.provider as FiscalSettingsType["provider"]) ?? "none",
    environment: (row?.environment as FiscalSettingsType["environment"]) ?? "homologacion",
    defaultCfeType: (row?.defaultCfeType as FiscalSettingsType["defaultCfeType"]) ?? "e-ticket",
    updatedAt: row?.updatedAt?.toISOString() ?? null,
    updatedBy: row?.updatedBy ?? null,
  };
}

function mapCfe(row: typeof cfeDocuments.$inferSelect): CfeRecord {
  return {
    id: row.id,
    saleId: row.saleId,
    cfeType: row.cfeType as CfeRecord["cfeType"],
    serie: row.serie,
    numero: row.numero,
    provider: row.provider,
    providerDocumentId: row.providerDocumentId,
    status: row.status as CfeStatus,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    authorizationCode: row.authorizationCode,
    documentUrl: row.documentUrl,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getFiscalSettings(): Promise<{ ok: true; data: FiscalSettingsType } | { ok: false; error: string }> {
  try {
    await requireUser();
    const [row] = await db.select().from(fiscalSettings).where(eq(fiscalSettings.id, 1)).limit(1);
    return { ok: true, data: mapSettings(row) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
export async function saveFiscalSettings(input: {
  enabled: boolean;
  provider: string;
  environment: string;
  defaultCfeType: string;
}): Promise<{ ok: true; data: FiscalSettingsType } | { ok: false; error: string }> {
  try {
    const me = await requireAdmin();
    const cfeType = validateCfeType(input.defaultCfeType);
    const [row] = await db
      .insert(fiscalSettings)
      .values({
        id: 1,
        enabled: Boolean(input.enabled),
        provider: input.provider || "none",
        environment: input.environment || "homologacion",
        defaultCfeType: cfeType,
        updatedBy: me.id,
      })
      .onConflictDoUpdate({
        target: fiscalSettings.id,
        set: {
          enabled: Boolean(input.enabled),
          provider: input.provider || "none",
          environment: input.environment || "homologacion",
          defaultCfeType: cfeType,
          updatedBy: me.id,
          updatedAt: new Date(),
        },
      })
      .returning();
    return { ok: true, data: mapSettings(row) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function testFiscalConnection(): Promise<{ ok: true; data: { ok: boolean; message: string } } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const config = getDgiConfig();
    const settingsResult = await getFiscalSettings();
    if (!settingsResult.ok) return settingsResult;
    const settings = settingsResult.data;

    if (!settings.enabled) {
      return { ok: true, data: { ok: false, message: "La integración está desactivada." } };
    }
    if (!isDgiConfigured()) {
      return { ok: true, data: { ok: false, message: "Faltan credenciales o parámetros de conexión (variables DGI_*)." } };
    }

    const provider = getProvider(config);
    const health = await provider.testConnection(config);
    return { ok: true, data: { ok: health.ok, message: health.message } };
  } catch (e) {
    return { ok: false, error: toPublicError(e) };
  }
}


export async function listCfeDocuments(
  page = 1,
  pageSize = 20,
): Promise<{ ok: true; data: { rows: CfeRecord[]; total: number; page: number; pageSize: number } } | { ok: false; error: string }> {
  try {
    await requireUser();
    const safePage = Math.max(1, Math.floor(page));
    const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(cfeDocuments).orderBy(cfeDocuments.createdAt).limit(safePageSize).offset((safePage - 1) * safePageSize),
      db.select({ total: sql<number>`count(*)::int` }).from(cfeDocuments),
    ]);
    return {
      ok: true,
      data: {
        rows: rows.map(mapCfe),
        total: Number(total),
        page: safePage,
        pageSize: safePageSize,
      },
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function getCfeDocument(id: number): Promise<{ ok: true; data: CfeRecord } | { ok: false; error: string }> {
  try {
    await requireUser();
    const [row] = await db.select().from(cfeDocuments).where(eq(cfeDocuments.id, id)).limit(1);
    if (!row) return { ok: false, error: "El comprobante fiscal no existe." };
    return { ok: true, data: mapCfe(row) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
export async function issueCfeForSale(
  saleId: number,
  cfeType?: string,
  force = false,
): Promise<{ ok: true; data: { status: CfeStatus; cfeId: number | null; result: IssueCfeResult | null } } | { ok: false; error: string }> {
  try {
    const me = await requireUser();
    void me;
    const settingsResult = await getFiscalSettings();
    if (!settingsResult.ok) return settingsResult;
    const settings = settingsResult.data;

    if (!settings.enabled || !isDgiConfigured()) {
      return { ok: true, data: { status: "not_configured", cfeId: null, result: null } };
    }

    const type = cfeType ? validateCfeType(cfeType) : settings.defaultCfeType;

    const [existing] = await db.select().from(cfeDocuments).where(eq(cfeDocuments.saleId, saleId)).limit(1);
    if (existing && !force) {
      return {
        ok: true,
        data: {
          status: existing.status as CfeStatus,
          cfeId: existing.id,
          result: null,
        },
      };
    }

    let created: typeof cfeDocuments.$inferSelect;
    if (existing && force) {
      await db.update(cfeDocuments).set({ status: "processing", errorMessage: null, updatedAt: new Date() }).where(eq(cfeDocuments.id, existing.id));
      created = existing;
    } else {
      const [inserted] = await db
        .insert(cfeDocuments)
        .values({
          saleId,
          cfeType: type,
          provider: getDgiConfig().provider,
          status: "processing",
        })
        .returning();
      created = inserted;
    }
    const receiptResult = await getSaleReceipt(saleId);
    if (!receiptResult.ok) return { ok: false, error: receiptResult.error };
    const receipt = receiptResult.data;

    const fiscalInput = mapSaleReceiptToFiscalInput(receipt);
    validateFiscalSaleInput(fiscalInput);
    const document = toFiscalDocument(fiscalInput, type);

    const config = getDgiConfig();
    const provider = getProvider(config);


    let result: IssueCfeResult;
    try {
      result = await provider.issueCfe(config, document);
    } catch (e) {
      result = {
        ok: false,
        status: "failed",
        providerDocumentId: null,
        serie: null,
        numero: null,
        authorizationCode: null,
        documentUrl: null,
        issuedAt: null,
        rawResponse: null,
        error: toPublicError(e),
      };
    }

    await db
      .update(cfeDocuments)
      .set({
        status: result.status,
        providerDocumentId: result.providerDocumentId,
        serie: result.serie,
        numero: result.numero,
        authorizationCode: result.authorizationCode,
        documentUrl: result.documentUrl,
        issuedAt: result.issuedAt ? new Date(result.issuedAt) : null,
        errorMessage: result.error,
        providerResponse: result.rawResponse,
        updatedAt: new Date(),
      })
      .where(eq(cfeDocuments.id, created.id));

    return { ok: true, data: { status: result.status, cfeId: created.id, result } };
  } catch (e) {
    return { ok: false, error: toPublicError(e) };
  }
}

export async function retryCfeDocument(id: number): Promise<{ ok: true; data: { status: CfeStatus } } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const [doc] = await db.select().from(cfeDocuments).where(eq(cfeDocuments.id, id)).limit(1);
    if (!doc) return { ok: false, error: "El comprobante fiscal no existe." };
    if (doc.status === "issued") {
      return { ok: false, error: "El comprobante ya fue emitido; no se reintenta." };
    }

    await db.update(cfeDocuments).set({ status: "processing", errorMessage: null, updatedAt: new Date() }).where(eq(cfeDocuments.id, id));

    const result = await issueCfeForSale(doc.saleId, doc.cfeType, true);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, data: { status: result.data.status } };
  } catch (e) {
    return { ok: false, error: toPublicError(e) };
  }
}

