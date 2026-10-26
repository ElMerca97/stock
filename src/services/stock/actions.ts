"use server";

import { and, asc, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, profiles, stockMovements } from "@/db/schema";
import { MOVEMENT_TYPES, type ActionResult, type MovementDTO, type MovementType, type Paginated } from "@/types";
import { errorMessage, int, str, ValidationError } from "@/utils/validation";
import { PermissionError, requireUser } from "@/services/auth/session";
import { applyStockMovement } from "./core";

export async function registerMovement(input: {
  productoId: number;
  tipo: MovementType;
  cantidad: number;
  motivo: string;
}): Promise<ActionResult<{ stockNuevo: number }>> {
  try {
    const me = await requireUser();
    if (!me.puedeMovimientos) throw new PermissionError("No tenés permiso para registrar movimientos de stock.");
    if (!MOVEMENT_TYPES.includes(input.tipo)) throw new ValidationError("Tipo de movimiento inválido.");
    if (input.tipo === "ajuste" && me.rol !== "admin") throw new PermissionError("Solo un administrador puede realizar ajustes de stock.");
    const productoId = int(input.productoId, "Producto", { min: 1 });
    const cantidad = int(input.cantidad, "Cantidad", { min: 0, max: 1_000_000 });
    const motivo = str(input.motivo, "Motivo", { required: true, max: 300 });
    const mov = await db.transaction((tx) => applyStockMovement(tx, { productoId, tipo: input.tipo, cantidad, usuarioId: me.id, motivo }));
    return { ok: true, data: { stockNuevo: mov.stockNuevo } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export interface MovementFilters {
  productoId?: number | null;
  categoriaId?: number | null;
  tipo?: string;
  usuarioId?: string;
  desde?: string; // yyyy-mm-dd
  hasta?: string;
  page?: number;
  pageSize?: number;
}

export async function listMovements(f: MovementFilters = {}): Promise<ActionResult<Paginated<MovementDTO>>> {
  try {
    const me = await requireUser();
    const page = Math.max(1, f.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, f.pageSize ?? 20));
    const conds: SQL[] = [];
    // Employees only see the movements they registered; admins see everything.
    if (me.rol !== "admin") conds.push(eq(stockMovements.usuarioId, me.id));
    else if (f.usuarioId) conds.push(eq(stockMovements.usuarioId, f.usuarioId));
    if (f.productoId) conds.push(eq(stockMovements.productoId, f.productoId));
    if (f.categoriaId) conds.push(eq(products.categoriaId, f.categoriaId));
    if (f.tipo && MOVEMENT_TYPES.includes(f.tipo as MovementType)) conds.push(eq(stockMovements.tipo, f.tipo));
    if (f.desde) conds.push(gte(stockMovements.createdAt, new Date(`${f.desde}T00:00:00`)));
    if (f.hasta) {
      const h = new Date(`${f.hasta}T00:00:00`);
      h.setDate(h.getDate() + 1);
      conds.push(lt(stockMovements.createdAt, h));
    }
    const where = conds.length ? and(...conds) : undefined;
    const base = db
      .select({
        id: stockMovements.id,
        productoId: stockMovements.productoId,
        productoNombre: products.nombre,
        productoSku: products.sku,
        categoriaNombre: categories.nombre,
        tipo: stockMovements.tipo,
        cantidad: stockMovements.cantidad,
        stockAnterior: stockMovements.stockAnterior,
        stockNuevo: stockMovements.stockNuevo,
        usuarioNombre: sql<string | null>`case when ${profiles.id} is null then null else ${profiles.nombre} || ' ' || ${profiles.apellido} end`,
        envioId: stockMovements.envioId,
        motivo: stockMovements.motivo,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productoId, products.id))
      .leftJoin(categories, eq(products.categoriaId, categories.id))
      .leftJoin(profiles, eq(stockMovements.usuarioId, profiles.id))
      .where(where);
    const [rows, [{ total }]] = await Promise.all([
      base.orderBy(desc(stockMovements.createdAt), desc(stockMovements.id)).limit(pageSize).offset((page - 1) * pageSize),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(stockMovements)
        .innerJoin(products, eq(stockMovements.productoId, products.id))
        .where(where),
    ]);
    return {
      ok: true,
      data: {
        rows: rows.map((r) => ({ ...r, tipo: r.tipo as MovementType, createdAt: r.createdAt.toISOString() })),
        total: Number(total),
        page,
        pageSize,
      },
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function listUserOptions(): Promise<ActionResult<{ id: string; nombre: string }[]>> {
  try {
    await requireUser();
    const rows = await db
      .select({ id: profiles.id, nombre: sql<string>`${profiles.nombre} || ' ' || ${profiles.apellido}` })
      .from(profiles)
      .orderBy(asc(profiles.nombre));
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
