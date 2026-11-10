"use server";

import { createHash } from "crypto";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { alertReads, customers, products, saleRequests, shipmentItems, shipments } from "@/db/schema";
import {
  SHIPMENT_STATES,
  SHIPMENT_STATE_LABELS,
  STOCK_DEDUCTED_STATES,
  type ActionResult,
  type Paginated,
  type ReceiptBusinessInfo,
  type ShipmentDTO,
  type ShipmentState,
} from "@/types";
import { errorMessage, int, str, ValidationError } from "@/utils/validation";
import { PermissionError, requireUser } from "@/services/auth/session";
import { applyStockMovement } from "@/services/stock/core";
import type { Tx } from "@/services/stock/core";
import { shipmentCode } from "@/utils/format";
import { getReceiptBusinessInfo } from "@/services/receipts/config";

export interface ShipmentFilters {
  q?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  clienteId?: number;
  page?: number;
  pageSize?: number;
}

const base = {
  id: shipments.id,
  clienteId: shipments.clienteId,
  clienteNombreSnapshot: shipments.clienteNombreSnapshot,
  clienteEmpresa: sql<string>`coalesce(${customers.empresa}, '')`,
  estado: shipments.estado,
  total: shipments.total,
  subtotal: shipments.subtotal,
  descuentoPorcentaje: shipments.descuentoPorcentaje,
  descuentoImporte: shipments.descuentoImporte,
  telefono: shipments.telefono,
  direccion: shipments.direccion,
  ciudad: shipments.ciudad,
  observaciones: shipments.observaciones,
  stockDescontado: shipments.stockDescontado,
  stockReservado: shipments.stockReservado,
  createdAt: shipments.createdAt,
  fechaEnvio: shipments.fechaEnvio,
  fechaEntrega: shipments.fechaEntrega,
  itemCount: sql<number>`(select coalesce(sum(i.cantidad),0)::int from shipment_items i where i.envio_id = ${shipments.id})`,
};

type BaseRow = {
  id: number;
  clienteId: number | null;
  clienteNombreSnapshot: string;
  clienteEmpresa: string;
  estado: string;
  total: string;
  subtotal: string;
  descuentoPorcentaje: string;
  descuentoImporte: string;
  telefono: string;
  direccion: string;
  ciudad: string;
  observaciones: string;
  stockDescontado: boolean;
  stockReservado: boolean;
  createdAt: Date;
  fechaEnvio: Date | null;
  fechaEntrega: Date | null;
  itemCount: number;
};

function toDTO(r: BaseRow): ShipmentDTO {
  return {
    ...r,
    clienteNombre: r.clienteNombreSnapshot,
    estado: r.estado as ShipmentState,
    total: Number(r.total),
    subtotal: Number(r.subtotal),
    descuentoPorcentaje: Number(r.descuentoPorcentaje),
    descuentoImporte: Number(r.descuentoImporte),
    itemCount: Number(r.itemCount),
    createdAt: r.createdAt.toISOString(),
    fechaEnvio: r.fechaEnvio?.toISOString() ?? null,
    fechaEntrega: r.fechaEntrega?.toISOString() ?? null,
  };
}

export async function listShipments(f: ShipmentFilters = {}): Promise<ActionResult<Paginated<ShipmentDTO>>> {
  try {
    await requireUser();
    const page = Math.max(1, f.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, f.pageSize ?? 15));
    const conds: SQL[] = [];
    if (f.q?.trim()) {
      const raw = f.q.trim();
      const num = Number(raw.replace(/^ENV-?/i, ""));
      const q = `%${raw}%`;
      const textCond = or(ilike(customers.nombre, q), ilike(customers.apellido, q), ilike(customers.empresa, q))!;
      conds.push(Number.isInteger(num) && num > 0 ? or(eq(shipments.id, num), textCond)! : textCond);
    }
    if (f.estado && SHIPMENT_STATES.includes(f.estado as ShipmentState)) conds.push(eq(shipments.estado, f.estado));
    if (f.clienteId) conds.push(eq(shipments.clienteId, f.clienteId));
    if (f.desde) conds.push(gte(shipments.createdAt, new Date(`${f.desde}T00:00:00Z`)));
    if (f.hasta) {
      const h = new Date(`${f.hasta}T00:00:00Z`);
      h.setUTCDate(h.getUTCDate() + 1);
      conds.push(lt(shipments.createdAt, h));
    }
    const where = conds.length ? and(...conds) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      db
        .select(base)
        .from(shipments)
        .leftJoin(customers, eq(shipments.clienteId, customers.id))
        .where(where)
        .orderBy(desc(shipments.createdAt), desc(shipments.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(shipments)
        .leftJoin(customers, eq(shipments.clienteId, customers.id))
        .where(where),
    ]);
    return { ok: true, data: { rows: rows.map(toDTO) as ShipmentDTO[], total: Number(total), page, pageSize } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function getShipment(id: number): Promise<ActionResult<ShipmentDTO>> {
  try {
    await requireUser();
    const [row] = await db
      .select(base)
      .from(shipments)
      .leftJoin(customers, eq(shipments.clienteId, customers.id))
      .where(eq(shipments.id, id))
      .limit(1);
    if (!row) throw new ValidationError("El envío no existe.");
    const items = await db
      .select({
        id: shipmentItems.id,
        productoId: shipmentItems.productoId,
        productoNombre: shipmentItems.productoNombre,
        productoSku: shipmentItems.productoSku,
        cantidad: shipmentItems.cantidad,
        precioUnitario: shipmentItems.precioUnitario,
        subtotal: shipmentItems.subtotal,
      })
      .from(shipmentItems)
      .where(eq(shipmentItems.envioId, id));
    return {
      ok: true,
      data: {
        ...toDTO(row as BaseRow),
        items: items.map((i) => ({ ...i, precioUnitario: Number(i.precioUnitario), subtotal: Number(i.subtotal) })),
      },
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export interface ShipmentInput {
  clienteId: number;
  telefono?: string;
  direccion: string;
  ciudad: string;
  observaciones: string;
  fechaEnvio: string | null; // planned date yyyy-mm-dd
  items: { productoId: number; cantidad: number }[];
}

/**
 * Transiciones de estado permitidas. Política:
 * - "cancelado" y "entregado" son estados terminales (no se puede salir de ellos).
 * - Se puede volver a "pendiente" desde cualquier estado intermedio (restaura stock).
 * - "entregado" solo alcanzable desde "enviado" (no se salta a entregado sin enviar).
 */
const ALLOWED_TRANSITIONS: Record<ShipmentState, ShipmentState[]> = {
  pendiente: ["preparando", "listo", "enviado", "cancelado"],
  preparando: ["pendiente", "listo", "enviado", "cancelado"],
  listo: ["pendiente", "preparando", "enviado", "cancelado"],
  enviado: ["pendiente", "preparando", "listo", "entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

async function buildItems(
  tx: Tx,
  items: ShipmentInput["items"],
  previousPrices?: Map<number, number>,
  previousReservations: Map<number, number> = new Map(),
) {
  if (!items?.length) throw new ValidationError("Agregá al menos un producto al envío.");
  const merged = new Map<number, number>();
  for (const it of items) {
    const pid = int(it.productoId, "Producto", { min: 1 });
    const q = int(it.cantidad, "Cantidad", { min: 1, max: 100000 });
    const quantity = (merged.get(pid) ?? 0) + q;
    if (quantity > 100_000) throw new ValidationError("La cantidad por producto no puede superar 100.000 unidades.");
    merged.set(pid, quantity);
  }
  // En edición (previousPrices) se traen también productos inactivos/eliminados que
  // ya formaban parte del envío, para validar o preservar sus líneas históricas.
  const productIds = [...new Set([...merged.keys(), ...previousReservations.keys()])].sort((a, b) => a - b);
  const prods = await tx
    .select({
      id: products.id,
      nombre: products.nombre,
      sku: products.sku,
      precioVenta: products.precioVenta,
      activo: products.activo,
      deletedAt: products.deletedAt,
      stock: products.stock,
      stockReservado: products.stockReservado,
    })
    .from(products)
    .where(inArray(products.id, productIds))
    .orderBy(asc(products.id))
    .for("update");
  const productsById = new Map(prods.map((product) => [product.id, product]));
  if ([...merged.keys()].some((id) => !productsById.has(id)))
    throw new ValidationError("Algún producto seleccionado ya no existe.");
  const rows: { productoId: number; productoNombre: string; productoSku: string; cantidad: number; precioUnitario: string; subtotal: string }[] = [];
  for (const [productoId, cantidad] of merged) {
    const p = productsById.get(productoId)!;
    if (p.deletedAt) {
      // Producto eliminado: nunca se puede agregar ni conservar en un envío editable.
      throw new ValidationError(`El producto "${p.nombre}" fue eliminado. Quitá la línea del envío para poder guardarlo.`);
    }
    // Línea existente => conservar el precio histórico. Línea nueva => precio actual.
    const prevPrice = previousPrices?.get(p.id);
    const pu = prevPrice !== undefined ? prevPrice : Number(p.precioVenta);
    if (prevPrice === undefined && !p.activo)
      throw new ValidationError(`El producto "${p.nombre}" está inactivo. No se puede agregar a un envío nuevo.`);
    const disponible = Number(p.stock) - Number(p.stockReservado) + (previousReservations.get(p.id) ?? 0);
    if (cantidad > disponible)
      throw new ValidationError(`Stock disponible insuficiente para "${p.nombre}": disponible ${disponible}, solicitado ${cantidad}.`);
    rows.push({
      productoId: p.id,
      productoNombre: p.nombre,
      productoSku: p.sku,
      cantidad,
      precioUnitario: String(pu),
      subtotal: String(Math.round(pu * cantidad * 100) / 100),
    });
  }
  const total = rows.reduce((a, r) => a + Number(r.subtotal), 0);
  return { rows, total: String(Math.round(total * 100) / 100) };
}

async function changeReservation(tx: Tx, productoId: number, delta: number) {
  if (delta === 0) return;
  const [product] = await tx
    .select({ id: products.id, stockReservado: products.stockReservado })
    .from(products)
    .where(eq(products.id, productoId))
    .for("update")
    .limit(1);
  if (!product) throw new ValidationError("El producto no existe.");
  const currentReserved = Number(product.stockReservado);
  const nextReserved = currentReserved + delta;
  if (nextReserved < 0)
    throw new ValidationError(
      `No se pueden liberar más reservas de las existentes para el producto ${productoId}.`,
    );
  await tx
    .update(products)
    .set({ stockReservado: nextReserved })
    .where(eq(products.id, productoId));
  await tx.delete(alertReads).where(eq(alertReads.productoId, productoId));
}

function parseHeader(input: ShipmentInput) {
  let fechaEnvio: Date | null = null;
  if (input.fechaEnvio) {
    fechaEnvio = new Date(`${input.fechaEnvio}T12:00:00`);
    if (Number.isNaN(fechaEnvio.getTime())) throw new ValidationError("La fecha de envío no es válida.");
  }
  return {
    clienteId: int(input.clienteId, "Cliente", { min: 1 }),
    telefono: str(input.telefono, "Teléfono", { required: true, max: 40 }),
    direccion: str(input.direccion, "Dirección", { required: true, max: 200 }),
    ciudad: str(input.ciudad, "Ciudad", { required: true, max: 80 }),
    observaciones: str(input.observaciones, "Observaciones", { max: 1000 }),
    fechaEnvio,
  };
}

export async function createShipment(input: ShipmentInput): Promise<ActionResult<{ id: number }>> {
  try {
    const me = await requireUser();
    if (!me.puedeMovimientos) throw new PermissionError("No tenés permiso para registrar movimientos de stock.");
    const header = parseHeader(input);
    const id = await db.transaction(async (tx) => {
      const [cust] = await tx
        .select({ id: customers.id, nombre: customers.nombre, apellido: customers.apellido })
        .from(customers)
        .where(and(eq(customers.id, header.clienteId), isNull(customers.deletedAt)))
        .for("share")
        .limit(1);
      if (!cust) throw new ValidationError("El cliente no existe o fue eliminado.");
      const { rows, total } = await buildItems(tx, input.items);
      const [s] = await tx.insert(shipments).values({
        ...header,
        clienteNombreSnapshot: `${cust.nombre} ${cust.apellido}`.trim(),
        total,
        subtotal: total,
        descuentoPorcentaje: "0",
        descuentoImporte: "0",
        createdBy: me.id,
        estado: "pendiente",
        stockReservado: true,
      }).returning({ id: shipments.id });
      await tx.insert(shipmentItems).values(rows.map((r) => ({ ...r, envioId: s.id })));
      for (const row of rows) await changeReservation(tx, row.productoId, row.cantidad);
      return s.id;
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export interface SaleInput {
  clienteId?: number | null;
  descuentoPorcentaje?: number | null;
  idempotencyKey: string;
  items: { productoId: number; cantidad: number }[];
}

export interface SaleReceipt {
  id: number;
  createdAt: string;
  total: string;
  subtotal: string;
  descuentoPorcentaje: string;
  descuentoImporte: string;
  customerName: string;
  items: { nombre: string; sku: string; cantidad: number; precioUnitario: number; subtotal: number }[];
  business: ReceiptBusinessInfo;
  replayed: boolean;
  cfeStatus?: string | null;
  cfeId?: number | null;
}

export interface SaleHistoryRow {
  id: number;
  createdAt: string;
  total: number;
  subtotal: number;
  descuentoPorcentaje: number;
  descuentoImporte: number;
  customerName: string;
  itemCount: number;
}

export async function listSales(page = 1, pageSize = 20): Promise<ActionResult<Paginated<SaleHistoryRow>>> {
  try {
    await requireUser();
    const safePage = Math.max(1, Math.floor(page));
    const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: shipments.id,
          createdAt: shipments.createdAt,
          total: shipments.total,
          subtotal: shipments.subtotal,
          descuentoPorcentaje: shipments.descuentoPorcentaje,
          descuentoImporte: shipments.descuentoImporte,
          customerName: shipments.clienteNombreSnapshot,
          itemCount: sql<number>`(select coalesce(sum(i.cantidad), 0)::int from shipment_items i where i.envio_id = ${shipments.id})`,
        })
        .from(saleRequests)
        .innerJoin(shipments, eq(saleRequests.shipmentId, shipments.id))
        .orderBy(desc(shipments.createdAt), desc(shipments.id))
        .limit(safePageSize)
        .offset((safePage - 1) * safePageSize),
      db.select({ total: sql<number>`count(*)::int` }).from(saleRequests),
    ]);
    return {
      ok: true,
      data: {
        rows: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          total: Number(row.total),
          subtotal: Number(row.subtotal),
          descuentoPorcentaje: Number(row.descuentoPorcentaje),
          descuentoImporte: Number(row.descuentoImporte),
          itemCount: Number(row.itemCount),
        })),
        total: Number(total),
        page: safePage,
        pageSize: safePageSize,
      },
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function getSaleReceipt(id: number): Promise<ActionResult<SaleReceipt>> {
  try {
    await requireUser();
    const saleId = int(id, "Venta", { min: 1 });
    const [sale] = await db
      .select({
        id: shipments.id,
        createdAt: shipments.createdAt,
        total: shipments.total,
        subtotal: shipments.subtotal,
        descuentoPorcentaje: shipments.descuentoPorcentaje,
        descuentoImporte: shipments.descuentoImporte,
        customerName: shipments.clienteNombreSnapshot,
        business: shipments.receiptBusinessSnapshot,
      })
      .from(saleRequests)
      .innerJoin(shipments, eq(saleRequests.shipmentId, shipments.id))
      .where(eq(shipments.id, saleId))
      .limit(1);
    if (!sale) throw new ValidationError("La venta no existe.");
    const items = await db
      .select({
        nombre: shipmentItems.productoNombre,
        sku: shipmentItems.productoSku,
        cantidad: shipmentItems.cantidad,
        precioUnitario: shipmentItems.precioUnitario,
        subtotal: shipmentItems.subtotal,
      })
      .from(shipmentItems)
      .where(eq(shipmentItems.envioId, saleId));
    return {
      ok: true,
      data: {
        ...sale,
        createdAt: sale.createdAt.toISOString(),
        total: sale.total,
        subtotal: sale.subtotal,
        descuentoPorcentaje: sale.descuentoPorcentaje,
        descuentoImporte: sale.descuentoImporte,
        items: items.map((item) => ({
          ...item,
          precioUnitario: Number(item.precioUnitario),
          subtotal: Number(item.subtotal),
        })),
        business: sale.business ?? getReceiptBusinessInfo(),
        replayed: false,
      },
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const MAX_SALE_TOTAL_CENTS = 99_999_999_999_999;

function centsFromDatabase(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new ValidationError("El precio del producto no tiene un formato monetario válido.");
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents)) throw new ValidationError("El precio del producto supera el máximo permitido.");
  return cents;
}

function decimalFromCents(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/**
 * Registra una venta de mostrador como un envío en preparación, usando el
 * historial, los movimientos y la deducción de stock transaccionales existentes.
 */
export async function createSale(input: SaleInput): Promise<ActionResult<SaleReceipt>> {
  try {
    const me = await requireUser();
    if (!me.puedeMovimientos) throw new PermissionError("No tenés permiso para registrar movimientos de stock.");

    const clienteId = input.clienteId == null ? null : int(input.clienteId, "Cliente", { min: 1 });
    const requestedDiscount = input.descuentoPorcentaje == null ? null : Number(input.descuentoPorcentaje);
    if (requestedDiscount !== null && (!Number.isFinite(requestedDiscount) || requestedDiscount < 0 || requestedDiscount > 100))
      throw new ValidationError("El descuento debe estar entre 0% y 100%.");
    const descuentoSolicitado = requestedDiscount === null ? null : Math.round(requestedDiscount * 100) / 100;
    const idempotencyKey = str(input.idempotencyKey, "Clave de operación", { required: true, max: 36 }).toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(idempotencyKey))
      throw new ValidationError("La clave de operación no es válida. Volvé a intentar.");
    if (!input.items?.length) throw new ValidationError("Agregá al menos un producto.");

    const quantities = new Map<number, number>();
    for (const item of input.items) {
      const productoId = int(item.productoId, "Producto", { min: 1 });
      const cantidad = int(item.cantidad, "Cantidad", { min: 1, max: 100_000 });
      const merged = (quantities.get(productoId) ?? 0) + cantidad;
      if (merged > 100_000) throw new ValidationError("La cantidad por producto no puede superar 100.000 unidades.");
      quantities.set(productoId, merged);
    }

    const canonicalItems = [...quantities].sort(([a], [b]) => a - b);
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ userId: me.id, clienteId, descuentoPorcentaje: descuentoSolicitado, items: canonicalItems }))
      .digest("hex");
    const legacyRequestHash = createHash("sha256")
      .update(JSON.stringify({ userId: me.id, clienteId, items: canonicalItems }))
      .digest("hex");
    const business = getReceiptBusinessInfo();

    const receipt = await db.transaction(async (tx) => {
      // Serializa reintentos con la misma clave antes de consultar o crear la venta.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);
      const [previous] = await tx
        .select({ requestHash: saleRequests.requestHash, shipmentId: saleRequests.shipmentId })
        .from(saleRequests)
        .where(eq(saleRequests.idempotencyKey, idempotencyKey))
        .limit(1);

      if (previous) {
        if (previous.requestHash !== requestHash && !(descuentoSolicitado === null && previous.requestHash === legacyRequestHash))
          throw new ValidationError("Esta confirmación ya fue usada con otros datos. Revisá el historial antes de iniciar otra venta.");
        const [shipment] = await tx
          .select({
            id: shipments.id,
            createdAt: shipments.createdAt,
            total: shipments.total,
            subtotal: shipments.subtotal,
            descuentoPorcentaje: shipments.descuentoPorcentaje,
            descuentoImporte: shipments.descuentoImporte,
            customerName: shipments.clienteNombreSnapshot,
            business: shipments.receiptBusinessSnapshot,
          })
          .from(shipments)
          .where(eq(shipments.id, previous.shipmentId))
          .limit(1);
        if (!shipment) throw new ValidationError("No se encontró la venta asociada a esta confirmación.");
        const items = await tx
          .select({
            nombre: shipmentItems.productoNombre,
            sku: shipmentItems.productoSku,
            cantidad: shipmentItems.cantidad,
            precioUnitario: shipmentItems.precioUnitario,
            subtotal: shipmentItems.subtotal,
          })
          .from(shipmentItems)
          .where(eq(shipmentItems.envioId, shipment.id));
        return {
          id: shipment.id,
          createdAt: shipment.createdAt.toISOString(),
          total: shipment.total,
          subtotal: shipment.subtotal,
          descuentoPorcentaje: shipment.descuentoPorcentaje,
          descuentoImporte: shipment.descuentoImporte,
          customerName: shipment.customerName,
          items: items.map((item) => ({
            ...item,
            precioUnitario: Number(item.precioUnitario),
            subtotal: Number(item.subtotal),
          })),
          business: shipment.business ?? business,
          replayed: true,
        };
      }

      const [customer] = clienteId
        ? await tx
            .select({
              id: customers.id,
              nombre: customers.nombre,
              apellido: customers.apellido,
              telefono: customers.telefono,
              direccion: customers.direccion,
              ciudad: customers.ciudad,
              descuentoPorcentaje: customers.descuentoPorcentaje,
            })
            .from(customers)
            .where(and(eq(customers.id, clienteId), isNull(customers.deletedAt)))
            .for("share")
            .limit(1)
        : [];
      if (clienteId && !customer) throw new ValidationError("El cliente no existe o fue eliminado.");

      const productIds = canonicalItems.map(([id]) => id);
      const lockedProducts = await tx
        .select({
          id: products.id,
          nombre: products.nombre,
          sku: products.sku,
          precioVenta: products.precioVenta,
          stock: products.stock,
          stockReservado: products.stockReservado,
          activo: products.activo,
          deletedAt: products.deletedAt,
        })
        .from(products)
        .where(inArray(products.id, productIds))
        .orderBy(asc(products.id))
        .for("update");
      if (lockedProducts.length !== productIds.length)
        throw new ValidationError("Algún producto seleccionado ya no existe.");

      const productById = new Map(lockedProducts.map((product) => [product.id, product]));
      const rows: {
        productoId: number;
        productoNombre: string;
        productoSku: string;
        cantidad: number;
        precioUnitario: string;
        subtotal: string;
      }[] = [];
      let totalCents = 0;

      for (const [productoId, cantidad] of canonicalItems) {
        const product = productById.get(productoId)!;
        if (product.deletedAt) throw new ValidationError(`El producto "${product.nombre}" fue eliminado.`);
        if (!product.activo) throw new ValidationError(`El producto "${product.nombre}" está inactivo.`);
        const disponible = product.stock - product.stockReservado;
        if (cantidad > disponible)
          throw new ValidationError(`Stock disponible insuficiente para "${product.nombre}": disponible ${disponible}, solicitado ${cantidad}.`);
        const unitCents = centsFromDatabase(product.precioVenta);
        if (unitCents > Math.floor(MAX_SALE_TOTAL_CENTS / cantidad))
          throw new ValidationError(`El subtotal de "${product.nombre}" supera el máximo permitido.`);
        const subtotalCents = unitCents * cantidad;
        if (subtotalCents > MAX_SALE_TOTAL_CENTS)
          throw new ValidationError(`El subtotal de "${product.nombre}" supera el máximo permitido.`);
        if (totalCents > MAX_SALE_TOTAL_CENTS - subtotalCents)
          throw new ValidationError("El total de la venta supera el máximo permitido.");
        totalCents += subtotalCents;
        rows.push({
          productoId,
          productoNombre: product.nombre,
          productoSku: product.sku,
          cantidad,
          precioUnitario: decimalFromCents(unitCents),
          subtotal: decimalFromCents(subtotalCents),
        });
      }

      const descuentoPorcentaje = descuentoSolicitado ?? Number(customer?.descuentoPorcentaje ?? 0);
      const descuentoBasisPoints = Math.round(descuentoPorcentaje * 100);
      const descuentoCents = Math.floor(totalCents / 10_000) * descuentoBasisPoints
        + Math.round(((totalCents % 10_000) * descuentoBasisPoints) / 10_000);
      const total = decimalFromCents(totalCents - descuentoCents);
      const subtotal = decimalFromCents(totalCents);
      const descuentoImporte = decimalFromCents(descuentoCents);
      const [shipment] = await tx
        .insert(shipments)
        .values({
          clienteId: customer?.id ?? null,
          telefono: customer?.telefono ?? "",
          direccion: customer?.direccion ?? "",
          ciudad: customer?.ciudad ?? "",
          clienteNombreSnapshot: customer ? `${customer.nombre} ${customer.apellido}`.trim() : "Consumidor final",
          receiptBusinessSnapshot: business,
          subtotal,
          descuentoPorcentaje: String(descuentoPorcentaje),
          descuentoImporte,
          total,
          createdBy: me.id,
          estado: "preparando",
          stockDescontado: true,
        })
        .returning({ id: shipments.id, createdAt: shipments.createdAt });
      await tx.insert(shipmentItems).values(rows.map((row) => ({ ...row, envioId: shipment.id })));

      const code = shipmentCode(shipment.id);
      for (const row of rows) {
        await applyStockMovement(tx, {
          productoId: row.productoId,
          tipo: "salida",
          cantidad: row.cantidad,
          usuarioId: me.id,
          motivo: `Venta de mostrador ${code} confirmada`,
          envioId: shipment.id,
        });
      }

      await tx.insert(saleRequests).values({
        idempotencyKey,
        requestHash,
        shipmentId: shipment.id,
      });
      return {
        id: shipment.id,
        createdAt: shipment.createdAt.toISOString(),
        total,
        subtotal,
        descuentoPorcentaje: String(descuentoPorcentaje),
        descuentoImporte,
        customerName: customer ? `${customer.nombre} ${customer.apellido}`.trim() : "Consumidor final",
        items: rows.map((row) => ({
          nombre: row.productoNombre,
          sku: row.productoSku,
          cantidad: row.cantidad,
          precioUnitario: Number(row.precioUnitario),
          subtotal: Number(row.subtotal),
        })),
        business,
        replayed: false,
      };
    });

    const fiscalResult = await (async () => {
      try {
        const { issueCfeForSale } = await import("@/services/dgi-connection/actions");
        return await issueCfeForSale(receipt.id);
      } catch {
        return { ok: false as const, error: "No se pudo iniciar la emisión fiscal." };
      }
    })();
    const fiscalStatus = fiscalResult.ok ? fiscalResult.data.status : "failed";
    const fiscalCfeId = fiscalResult.ok ? fiscalResult.data.cfeId : null;

    return { ok: true, data: { ...receipt, cfeStatus: fiscalStatus, cfeId: fiscalCfeId } };
  } catch (e) {
    const hasMissingSaleRequestsTable = (error: unknown, depth = 0): boolean => {
      if (!(error instanceof Error) || depth > 2) return false;
      const pgError = error as Error & { code?: string; cause?: unknown };
      return (
        (pgError.code === "42P01" && error.message.includes("sale_requests")) ||
        (error.message.includes("sale_requests") && error.message.includes("does not exist")) ||
        hasMissingSaleRequestsTable(pgError.cause, depth + 1)
      );
    };
    if (hasMissingSaleRequestsTable(e)) {
      return {
        ok: false,
        error: "Falta aplicar la migración de ventas. Aplicá supabase/20261026_sale_idempotency.sql en la base de datos e intentá nuevamente.",
      };
    }
    return { ok: false, error: errorMessage(e) };
  }
}

/** Items can only be edited while the shipment is pending (stock not yet deducted). */
export async function updateShipment(id: number, input: ShipmentInput): Promise<ActionResult> {
  try {
    const me = await requireUser();
    if (!me.puedeMovimientos) throw new PermissionError("No tenés permiso para registrar movimientos de stock.");
    const header = parseHeader(input);
    await db.transaction(async (tx) => {
      const locked = await tx.execute<{
        id: number;
        estado: string;
        stock_descontado: boolean;
        stock_reservado: boolean;
      }>(
        sql`select id, estado, stock_descontado, stock_reservado from shipments where id = ${id} for update`,
      );
      const s = locked.rows[0];
      if (!s) throw new ValidationError("El envío no existe.");
      if (s.estado !== "pendiente" || s.stock_descontado)
        throw new ValidationError("Solo se pueden editar envíos en estado Pendiente.");
      const [cust] = await tx
        .select({ id: customers.id, nombre: customers.nombre, apellido: customers.apellido })
        .from(customers)
        .where(and(eq(customers.id, header.clienteId), isNull(customers.deletedAt)))
        .for("share")
        .limit(1);
      if (!cust) throw new ValidationError("El cliente no existe o fue eliminado.");
      const prevItems = await tx.select().from(shipmentItems).where(eq(shipmentItems.envioId, id));
      const previousPrices = new Map(prevItems.map((item) => [item.productoId, Number(item.precioUnitario)]));
      const previousReservations = new Map<number, number>();
      for (const item of prevItems) {
        previousReservations.set(
          item.productoId,
          (previousReservations.get(item.productoId) ?? 0) + (s.stock_reservado ? item.cantidad : 0),
        );
      }
      const { rows, total } = await buildItems(tx, input.items, previousPrices, previousReservations);
      const nextReservations = new Map(rows.map((item) => [item.productoId, item.cantidad]));
      for (const productoId of new Set([...previousReservations.keys(), ...nextReservations.keys()])) {
        await changeReservation(
          tx,
          productoId,
          (nextReservations.get(productoId) ?? 0) - (previousReservations.get(productoId) ?? 0),
        );
      }
      await tx.update(shipments).set({
        ...header,
        clienteNombreSnapshot: `${cust.nombre} ${cust.apellido}`.trim(),
        total,
        subtotal: total,
        descuentoPorcentaje: "0",
        descuentoImporte: "0",
        stockReservado: true,
      }).where(eq(shipments.id, id));
      await tx.delete(shipmentItems).where(eq(shipmentItems.envioId, id));
      await tx.insert(shipmentItems).values(rows.map((r) => ({ ...r, envioId: id })));
    });
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Changes status. When a shipment is confirmed (moves to Preparando or later) the stock is deducted
 * automatically, registering a "salida" movement per item. If it is cancelled or returned to Pendiente
 * after deduction, the stock is restored with "entrada" movements (even if a product was soft-deleted
 * in the meantime, so shipments never get stuck).
 * fechaEnvio is set once when the shipment is first sent; fechaEntrega once when first delivered.
 * Neither is overwritten on later transitions.
 */
export async function changeShipmentStatus(id: number, estado: ShipmentState): Promise<ActionResult> {
  try {
    const me = await requireUser();
    if (!me.puedeMovimientos) throw new PermissionError("No tenés permiso para registrar movimientos de stock.");
    if (!SHIPMENT_STATES.includes(estado)) throw new ValidationError("Estado inválido.");
    await db.transaction(async (tx) => {
      const locked = await tx.execute<{
        id: number;
        estado: string;
        stock_descontado: boolean;
        stock_reservado: boolean;
        fecha_envio: string | null;
        fecha_entrega: string | null;
      }>(
        sql`select id, estado, stock_descontado, stock_reservado, fecha_envio, fecha_entrega from shipments where id = ${id} for update`,
      );
      const s = locked.rows[0];
      if (!s) throw new ValidationError("El envío no existe.");
      if (s.estado === estado) return;
      const from = s.estado as ShipmentState;
      if (!ALLOWED_TRANSITIONS[from]?.includes(estado))
        throw new ValidationError(`No se puede pasar de "${SHIPMENT_STATE_LABELS[from] ?? from}" a "${SHIPMENT_STATE_LABELS[estado]}".`);
      const items = await tx.select().from(shipmentItems).where(eq(shipmentItems.envioId, id));
      const productIds = [...new Set(items.map((item) => item.productoId))].sort((a, b) => a - b);
      if (productIds.length) {
        const lockedProducts = await tx
          .select({ id: products.id })
          .from(products)
          .where(inArray(products.id, productIds))
          .orderBy(asc(products.id))
          .for("update");
        if (lockedProducts.length !== productIds.length)
          throw new ValidationError("Algún producto del envío ya no existe.");
      }
      const code = shipmentCode(id);
      const [saleRecord] = await tx
        .select({ id: saleRequests.idempotencyKey })
        .from(saleRequests)
        .where(eq(saleRequests.shipmentId, id))
        .limit(1);
      const movementOrigin = saleRecord ? "Venta de mostrador" : "Envío";
      let descontado = s.stock_descontado;
      let reservado = s.stock_reservado;
      if (STOCK_DEDUCTED_STATES.includes(estado) && !descontado) {
        if (reservado) {
          for (const it of items) await changeReservation(tx, it.productoId, -it.cantidad);
          reservado = false;
        }
        // Confirmar exige producto existente, no eliminado y activo (sin allowDeleted).
        const productosConfirm = await tx
          .select({ id: products.id, nombre: products.nombre, activo: products.activo, deletedAt: products.deletedAt })
          .from(products)
          .where(inArray(products.id, productIds));
        for (const it of items) {
          const p = productosConfirm.find((x) => x.id === it.productoId);
          if (!p) throw new ValidationError(`El producto del envío ya no existe.`);
          if (p.deletedAt) throw new ValidationError(`El producto "${p.nombre}" fue eliminado y no puede descontar stock.`);
          if (!p.activo) throw new ValidationError(`El producto "${p.nombre}" está inactivo. No se puede descontar stock.`);
        }
        for (const it of items)
          await applyStockMovement(tx, { productoId: it.productoId, tipo: "salida", cantidad: it.cantidad, usuarioId: me.id, motivo: `${movementOrigin} ${code} confirmado`, envioId: id });
        descontado = true;
      } else if (estado === "cancelado" || estado === "pendiente") {
        if (descontado) {
          // Restaurar permite productos eliminados: el stock que se descontó debe reingresar.
          for (const it of items)
            await applyStockMovement(tx, {
              productoId: it.productoId,
              tipo: "entrada",
              cantidad: it.cantidad,
              usuarioId: me.id,
              motivo: `Reingreso por ${movementOrigin.toLowerCase()} ${code} ${estado === "cancelado" ? "cancelado" : "vuelto a pendiente"}`,
              envioId: id,
              allowDeleted: true,
            });
          descontado = false;
        }
        if (estado === "pendiente" && !reservado) {
          for (const it of items) await changeReservation(tx, it.productoId, it.cantidad);
          reservado = true;
        } else if (estado === "cancelado" && reservado) {
          for (const it of items) await changeReservation(tx, it.productoId, -it.cantidad);
          reservado = false;
        }
      }
      // Fechas: se establecen solo la primera vez; nunca se pisan ni se derivan entre sí.
      const patch: { fechaEnvio?: Date; fechaEntrega?: Date } = {};
      if (estado === "enviado" && !s.fecha_envio) patch.fechaEnvio = new Date();
      if (estado === "entregado" && !s.fecha_entrega) patch.fechaEntrega = new Date();
      await tx
        .update(shipments)
        .set({ estado, stockDescontado: descontado, stockReservado: reservado, ...patch })
        .where(eq(shipments.id, id));
    });
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
