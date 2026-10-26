import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, profiles, products, storageFiles } from "@/db/schema";

export const BUCKETS = ["products", "categories", "avatars"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export async function storeFile(bucket: Bucket, file: File, ownerId: string): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error("Formato no permitido. Usá PNG, JPG, WEBP o GIF.");
  if (file.size > MAX_FILE_BYTES) throw new Error("La imagen supera el máximo de 2 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const path = `${bucket}/${randomUUID()}.${EXT[file.type]}`;
  await db.insert(storageFiles).values({ path, bucket, mime: file.type, size: file.size, data: buf.toString("base64"), ownerId });
  return `/api/storage/${path}`;
}

/** Deletes a stored file given its public URL. Ignores external URLs. */
export async function deleteStoredFile(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith("/api/storage/")) return;
  const path = url.replace("/api/storage/", "");
  await db.delete(storageFiles).where(eq(storageFiles.path, path));
}

/** Best-effort delete para estrategias de compensación: registra el fallo sin lanzar. */
export async function safeDeleteStoredFile(url: string | null | undefined, context: string): Promise<void> {
  if (!url || !url.startsWith("/api/storage/")) return;
  try {
    await deleteStoredFile(url);
  } catch (e) {
    // No se registra el contenido del archivo, solo la ruta (uuid) y el contexto.
    console.error(`[storage] Limpieza pendiente (${context}):`, url, e instanceof Error ? e.message : e);
  }
}

/**
 * Indica si alguna otra fila sigue referenciando la misma URL de imagen
 * (productos, categorías o avatares). Se usa antes de borrar un archivo para
 * no dejar imágenes rotas en registros compartidos.
 */
export async function storedFileReferenced(
  url: string | null | undefined,
  ignore: { productId?: number; categoryId?: number; userId?: string } = {},
): Promise<boolean> {
  if (!url || !url.startsWith("/api/storage/")) return false;
  const [p] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.imagen, url), ignore.productId !== undefined ? sql`${products.id} != ${ignore.productId}` : undefined));
  if (Number(p?.c ?? 0) > 0) return true;
  const [c] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(categories)
    .where(and(eq(categories.imagen, url), ignore.categoryId !== undefined ? sql`${categories.id} != ${ignore.categoryId}` : undefined));
  if (Number(c?.c ?? 0) > 0) return true;
  const [u] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(profiles)
    .where(and(eq(profiles.avatar, url), ignore.userId !== undefined ? sql`${profiles.id} != ${ignore.userId}` : undefined));
  return Number(u?.c ?? 0) > 0;
}

/** Borra un archivo solo si ninguna otra fila lo referencia. Best-effort. */
export async function deleteStoredFileIfOrphan(
  url: string | null | undefined,
  ignore: { productId?: number; categoryId?: number; userId?: string },
  context: string,
): Promise<void> {
  if (!url) return;
  try {
    if (await storedFileReferenced(url, ignore)) return;
    await safeDeleteStoredFile(url, context);
  } catch (e) {
    console.error(`[storage] No se pudo verificar/borrar imagen (${context}):`, e instanceof Error ? e.message : e);
  }
}

export async function readStoredFile(path: string) {
  const [f] = await db.select().from(storageFiles).where(eq(storageFiles.path, path)).limit(1);
  return f ?? null;
}
