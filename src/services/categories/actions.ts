"use server";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import type { ActionResult, CategoryDTO } from "@/types";
import { errorMessage, imageUrl, str, ValidationError } from "@/utils/validation";
import { requireAdmin, requireUser } from "@/services/auth/session";
import { deleteStoredFileIfOrphan, safeDeleteStoredFile } from "@/services/storage/files";

export async function listCategories(opts: { onlyActive?: boolean } = {}): Promise<ActionResult<CategoryDTO[]>> {
  try {
    await requireUser();
    const rows = await db
      .select({
        id: categories.id,
        nombre: categories.nombre,
        descripcion: categories.descripcion,
        imagen: categories.imagen,
        activo: categories.activo,
        createdAt: categories.createdAt,
        productCount: sql<number>`(select count(*)::int from products p where p.categoria_id = ${categories.id} and p.deleted_at is null)`,
      })
      .from(categories)
      .where(opts.onlyActive ? eq(categories.activo, true) : undefined)
      .orderBy(asc(categories.nombre));
    return {
      ok: true,
      data: rows.map((r) => ({ ...r, productCount: Number(r.productCount), createdAt: r.createdAt.toISOString() })),
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export interface CategoryInput {
  nombre: string;
  descripcion: string;
  imagen: string | null;
  activo: boolean;
}

function parse(input: CategoryInput) {
  return {
    nombre: str(input.nombre, "Nombre", { required: true, max: 60 }),
    descripcion: str(input.descripcion, "Descripción", { max: 300 }),
    imagen: imageUrl(input.imagen),
    activo: Boolean(input.activo),
  };
}

export async function createCategory(input: CategoryInput): Promise<ActionResult> {
  try {
    await requireAdmin();
    const data = parse(input);
    try {
      await db.insert(categories).values(data);
    } catch (e) {
      // Compensación: si la creación falla (p. ej. nombre duplicado), se limpia la imagen subida.
      await safeDeleteStoredFile(data.imagen, "createCategory");
      throw e;
    }
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function updateCategory(id: number, input: CategoryInput): Promise<ActionResult> {
  try {
    await requireAdmin();
    const data = parse(input);
    const [old] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!old) throw new ValidationError("La categoría no existe.");
    // Guardar el registro primero; borrar la imagen anterior solo tras confirmar el éxito.
    try {
      await db.update(categories).set(data).where(eq(categories.id, id));
    } catch (e) {
      if (data.imagen && data.imagen !== old.imagen) await safeDeleteStoredFile(data.imagen, "updateCategory");
      throw e;
    }
    if (old.imagen && old.imagen !== data.imagen) await deleteStoredFileIfOrphan(old.imagen, { categoryId: id }, "updateCategory");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function toggleCategory(id: number, activo: boolean): Promise<ActionResult> {
  try {
    await requireAdmin();
    await db.update(categories).set({ activo }).where(eq(categories.id, id));
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(products)
      .where(and(eq(products.categoriaId, id), isNull(products.deletedAt)));
    if (Number(c) > 0)
      throw new ValidationError(`No se puede eliminar: tiene ${c} producto(s) asociado(s). Podés desactivarla.`);
    const [any] = await db.select({ id: products.id }).from(products).where(eq(products.categoriaId, id)).limit(1);
    if (any) {
      // only soft-deleted products remain: detach them to preserve history
      await db.update(products).set({ categoriaId: null }).where(eq(products.categoriaId, id));
    }
    const [old] = await db.delete(categories).where(eq(categories.id, id)).returning();
    if (old?.imagen) await deleteStoredFileIfOrphan(old.imagen, { categoryId: id }, "deleteCategory");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
