"use server";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { ActionResult, AlertDTO } from "@/types";
import { errorMessage } from "@/utils/validation";
import { requireUser } from "@/services/auth/session";

/** Active products whose stock is at or below the configured minimum. */
export async function listAlerts(): Promise<ActionResult<AlertDTO[]>> {
  try {
    const me = await requireUser();
    const res = await db.execute<{
      id: number;
      nombre: string;
      sku: string;
      categoria: string | null;
      stock: number;
      stock_minimo: number;
      imagen: string | null;
      read_tipo: string | null;
    }>(sql`
      select p.id, p.nombre, p.sku, c.nombre as categoria, p.stock, p.stock_minimo, p.imagen, ar.tipo as read_tipo
      from products p
      left join categories c on c.id = p.categoria_id
      left join alert_reads ar on ar.producto_id = p.id and ar.user_id = ${me.id}
      where p.deleted_at is null and p.activo = true and (p.stock <= 0 or p.stock <= p.stock_minimo)
      order by p.stock asc, p.nombre asc`);
    return {
      ok: true,
      data: res.rows.map((r) => {
        const tipo = Number(r.stock) <= 0 ? "agotado" : "bajo";
        return {
          productoId: r.id,
          nombre: r.nombre,
          sku: r.sku,
          categoriaNombre: r.categoria,
          stock: Number(r.stock),
          stockMinimo: Number(r.stock_minimo),
          imagen: r.imagen,
          tipo,
          visto: r.read_tipo === tipo,
        };
      }),
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Marks the current alerts as seen for the logged user, so they are not notified again as "new". */
export async function markAlertsSeen(productIds?: number[]): Promise<ActionResult> {
  try {
    const me = await requireUser();
    const filter = productIds && productIds.length ? sql`and p.id in (${sql.join(productIds.map((i) => sql`${i}`), sql`, `)})` : sql``;
    await db.execute(sql`
      insert into alert_reads (user_id, producto_id, tipo, read_at)
      select ${me.id}, p.id, case when p.stock <= 0 then 'agotado' else 'bajo' end, now()
      from products p
      where p.deleted_at is null and p.activo = true and (p.stock <= 0 or p.stock <= p.stock_minimo) ${filter}
      on conflict (user_id, producto_id) do update set tipo = excluded.tipo, read_at = now()`);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
