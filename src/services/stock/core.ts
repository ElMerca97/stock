import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertReads, products, stockMovements } from "@/db/schema";
import type { MovementType } from "@/types";
import { ValidationError } from "@/utils/validation";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface MovementInput {
  productoId: number;
  tipo: MovementType;
  /** For entrada/salida: positive quantity. For ajuste: the new absolute stock value. */
  cantidad: number;
  usuarioId: string | null;
  motivo: string;
  envioId?: number | null;
  /**
   * Permite aplicar el movimiento a un producto con borrado lógico.
   * Solo debe usarse para reingresos (entrada) de envíos cancelados/vueltos a
   * pendiente, de modo que un producto eliminado no bloquee la restauración
   * de stock que ya fue descontado. Nunca habilita salidas de productos
   * eliminados.
   */
  allowDeleted?: boolean;
}

/**
 * The ONLY function that changes product stock. Locks the product row,
 * computes the new stock, writes the movement record and updates the product.
 * Must be executed inside a transaction.
 */
export async function applyStockMovement(tx: Tx, input: MovementInput) {
  const locked = await tx.execute<{ id: number; stock: number; nombre: string; deleted_at: string | null }>(
    sql`select id, stock, nombre, deleted_at from products where id = ${input.productoId} for update`,
  );
  const p = locked.rows[0];
  if (!p) throw new ValidationError("El producto no existe.");
  if (p.deleted_at && !input.allowDeleted)
    throw new ValidationError(`El producto "${p.nombre}" fue eliminado y no puede recibir movimientos de stock.`);
  if (p.deleted_at && input.tipo !== "entrada")
    throw new ValidationError(`El producto "${p.nombre}" fue eliminado: solo se permiten reingresos (entradas).`);
  const anterior = Number(p.stock);
  let nuevo: number;
  let cantidad: number;

  if (input.tipo === "entrada") {
    if (input.cantidad <= 0) throw new ValidationError("La cantidad debe ser mayor a 0.");
    cantidad = input.cantidad;
    nuevo = anterior + cantidad;
  } else if (input.tipo === "salida") {
    if (input.cantidad <= 0) throw new ValidationError("La cantidad debe ser mayor a 0.");
    cantidad = input.cantidad;
    nuevo = anterior - cantidad;
    if (nuevo < 0)
      throw new ValidationError(`Stock insuficiente para "${p.nombre}": disponible ${anterior}, solicitado ${cantidad}.`);
  } else {
    if (input.cantidad < 0) throw new ValidationError("El stock ajustado no puede ser negativo.");
    nuevo = input.cantidad;
    cantidad = Math.abs(nuevo - anterior);
    if (nuevo === anterior) throw new ValidationError("El ajuste no modifica el stock actual.");
  }

  await tx.update(products).set({ stock: nuevo, updatedAt: new Date() }).where(eq(products.id, input.productoId));
  const [mov] = await tx
    .insert(stockMovements)
    .values({
      productoId: input.productoId,
      tipo: input.tipo,
      cantidad,
      stockAnterior: anterior,
      stockNuevo: nuevo,
      usuarioId: input.usuarioId,
      motivo: input.motivo,
      envioId: input.envioId ?? null,
    })
    .returning();

  // Alert "seen" state is reset when the stock level changes category, so a new alert is shown again.
  if (nuevo > anterior) {
    await tx.delete(alertReads).where(eq(alertReads.productoId, input.productoId));
  } else if (nuevo === 0) {
    await tx.delete(alertReads).where(and(eq(alertReads.productoId, input.productoId), eq(alertReads.tipo, "bajo")));
  }
  return mov;
}
