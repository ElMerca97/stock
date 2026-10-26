"use server";

import { and, asc, desc, eq, ilike, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import type { ActionResult, Paginated, ProductDTO } from "@/types";
import { errorMessage, imageUrl, int, money, str, ValidationError } from "@/utils/validation";
import { requireAdmin, requireUser } from "@/services/auth/session";
import { deleteStoredFileIfOrphan, safeDeleteStoredFile } from "@/services/storage/files";
import { applyStockMovement } from "@/services/stock/core";

const select = {
  id: products.id,
  nombre: products.nombre,
  sku: products.sku,
  categoriaId: products.categoriaId,
  categoriaNombre: categories.nombre,
  tipo: products.tipo,
  descripcion: products.descripcion,
  precioCompra: products.precioCompra,
  precioVenta: products.precioVenta,
  stock: products.stock,
  stockMinimo: products.stockMinimo,
  imagen: products.imagen,
  activo: products.activo,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
};

type Row = Omit<ProductDTO, "precioCompra" | "precioVenta" | "createdAt" | "updatedAt"> & {
  precioCompra: string;
  precioVenta: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDTO(r: Row): ProductDTO {
  return {
    ...r,
    categoriaNombre: r.categoriaNombre ?? null,
    precioCompra: Number(r.precioCompra),
    precioVenta: Number(r.precioVenta),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export interface ProductFilters {
  q?: string;
  categoriaId?: number | null;
  tipo?: string;
  estado?: "" | "activo" | "inactivo";
  stock?: "" | "bajo" | "agotado" | "ok";
  page?: number;
  pageSize?: number;
  sort?: "nombre" | "stock" | "recientes";
}

export async function listProducts(f: ProductFilters = {}): Promise<ActionResult<Paginated<ProductDTO>>> {
  try {
    await requireUser();
    const page = Math.max(1, f.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 12));
    const conds: SQL[] = [isNull(products.deletedAt)];
    if (f.q?.trim()) {
      const q = `%${f.q.trim()}%`;
      conds.push(or(ilike(products.nombre, q), ilike(products.sku, q))!);
    }
    if (f.categoriaId) conds.push(eq(products.categoriaId, f.categoriaId));
    if (f.tipo) conds.push(eq(products.tipo, f.tipo));
    if (f.estado === "activo") conds.push(eq(products.activo, true));
    if (f.estado === "inactivo") conds.push(eq(products.activo, false));
    if (f.stock === "agotado") conds.push(lte(products.stock, 0));
    if (f.stock === "bajo") conds.push(sql`${products.stock} > 0 and ${products.stock} <= ${products.stockMinimo}`);
    if (f.stock === "ok") conds.push(sql`${products.stock} > ${products.stockMinimo}`);
    const where = and(...conds);
    const order =
      f.sort === "stock" ? [asc(products.stock)] : f.sort === "recientes" ? [desc(products.updatedAt)] : [asc(products.nombre)];
    const [rows, [{ total }]] = await Promise.all([
      db
        .select(select)
        .from(products)
        .leftJoin(categories, eq(products.categoriaId, categories.id))
        .where(where)
        .orderBy(...order)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ total: sql<number>`count(*)::int` }).from(products).where(where),
    ]);
    return { ok: true, data: { rows: rows.map(toDTO), total: Number(total), page, pageSize } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Lightweight list for selectors (shipments, movements). */
export async function listProductOptions(): Promise<
  ActionResult<{ id: number; nombre: string; sku: string; stock: number; precioVenta: number; activo: boolean }[]>
> {
  try {
    await requireUser();
    const rows = await db
      .select({ id: products.id, nombre: products.nombre, sku: products.sku, stock: products.stock, precioVenta: products.precioVenta, activo: products.activo })
      .from(products)
      .where(isNull(products.deletedAt))
      .orderBy(asc(products.nombre));
    return { ok: true, data: rows.map((r) => ({ ...r, precioVenta: Number(r.precioVenta) })) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function listProductTypes(): Promise<ActionResult<string[]>> {
  try {
    await requireUser();
    const rows = await db.selectDistinct({ tipo: products.tipo }).from(products).where(isNull(products.deletedAt));
    return { ok: true, data: rows.map((r) => r.tipo).sort() };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export interface ProductInput {
  nombre: string;
  sku: string;
  categoriaId: number | null;
  tipo: string;
  descripcion: string;
  precioCompra: number;
  precioVenta: number;
  stockMinimo: number;
  imagen: string | null;
  activo: boolean;
  /** Only used on creation: initial stock, registered as an "entrada" movement. */
  stockInicial?: number;
}

function parse(input: ProductInput) {
  const precioCompra = money(input.precioCompra, "Precio de compra");
  const precioVenta = money(input.precioVenta, "Precio de venta");
  return {
    nombre: str(input.nombre, "Nombre", { required: true, max: 120 }),
    sku: str(input.sku, "SKU", { required: true, max: 40 }).toUpperCase(),
    categoriaId: input.categoriaId ? int(input.categoriaId, "Categoría", { min: 1 }) : null,
    tipo: str(input.tipo, "Tipo", { required: true, max: 40 }),
    descripcion: str(input.descripcion, "Descripción", { max: 1000 }),
    precioCompra: String(precioCompra),
    precioVenta: String(precioVenta),
    stockMinimo: int(input.stockMinimo, "Stock mínimo", { min: 0, max: 1_000_000 }),
    imagen: imageUrl(input.imagen),
    activo: Boolean(input.activo),
  };
}

export async function createProduct(input: ProductInput): Promise<ActionResult<{ id: number }>> {
  try {
    const me = await requireAdmin();
    const data = parse(input);
    if (!data.categoriaId) throw new ValidationError("Seleccioná una categoría.");
    const inicial = int(input.stockInicial ?? 0, "Stock inicial", { min: 0, max: 1_000_000 });
    try {
      const id = await db.transaction(async (tx) => {
        const [p] = await tx.insert(products).values({ ...data, stock: 0 }).returning({ id: products.id });
        if (inicial > 0)
          await applyStockMovement(tx, { productoId: p.id, tipo: "entrada", cantidad: inicial, usuarioId: me.id, motivo: "Stock inicial al crear el producto" });
        return p.id;
      });
      return { ok: true, data: { id } };
    } catch (e) {
      // Compensación: si la creación falló, se limpia la imagen recién subida (si la hubo).
      await safeDeleteStoredFile(data.imagen, "createProduct");
      throw e;
    }
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function updateProduct(id: number, input: ProductInput): Promise<ActionResult> {
  try {
    await requireAdmin();
    const data = parse(input);
    if (!data.categoriaId) throw new ValidationError("Seleccioná una categoría.");
    const [old] = await db.select().from(products).where(and(eq(products.id, id), isNull(products.deletedAt))).limit(1);
    if (!old) throw new ValidationError("El producto no existe o fue eliminado.");
    // 1) Se guarda primero el registro. 2) Recién entonces se borra la imagen anterior.
    // Si el update falla (p. ej. SKU duplicado), la imagen anterior sigue intacta.
    try {
      await db.update(products).set({ ...data, updatedAt: new Date() }).where(and(eq(products.id, id), isNull(products.deletedAt)));
    } catch (e) {
      // Si el cliente subió una imagen nueva y el update falló, se limpia la nueva.
      if (data.imagen && data.imagen !== old.imagen) await safeDeleteStoredFile(data.imagen, "updateProduct");
      throw e;
    }
    if (old.imagen && old.imagen !== data.imagen) await deleteStoredFileIfOrphan(old.imagen, { productId: id }, "updateProduct");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setProductActive(id: number, activo: boolean): Promise<ActionResult> {
  try {
    await requireAdmin();
    const rows = await db
      .update(products)
      .set({ activo, updatedAt: new Date() })
      .where(and(eq(products.id, id), isNull(products.deletedAt)))
      .returning({ id: products.id });
    if (rows.length === 0) throw new ValidationError("El producto no existe o fue eliminado.");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Soft delete: keeps history (movements, shipments). SKU is freed by suffixing it. */
export async function deleteProduct(id: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    const [old] = await db.select({ imagen: products.imagen }).from(products).where(and(eq(products.id, id), isNull(products.deletedAt))).limit(1);
    const rows = await db
      .update(products)
      .set({ deletedAt: new Date(), activo: false, sku: sql`${products.sku} || '-DEL-' || ${products.id}`, updatedAt: new Date() })
      .where(and(eq(products.id, id), isNull(products.deletedAt)))
      .returning({ id: products.id });
    if (rows.length === 0) throw new ValidationError("El producto no existe o ya fue eliminado.");
    // El borrado lógico ya confirmó: se libera la imagen (si nada más la referencia).
    // Un fallo aquí no revierte el producto; queda registrado como pendiente de limpieza.
    if (old?.imagen) await deleteStoredFileIfOrphan(old.imagen, { productId: id }, "deleteProduct");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
