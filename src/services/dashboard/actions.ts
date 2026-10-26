"use server";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { ActionResult } from "@/types";
import { errorMessage } from "@/utils/validation";
import { requireUser } from "@/services/auth/session";

export interface DashboardData {
  stats: {
    totalProductos: number;
    stockBajo: number;
    sinStock: number;
    unidades: number;
    categorias: number;
    enviosPendientes: number;
    enviosRealizados: number;
    valorInventario: number;
  };
  charts: {
    porCategoria: { nombre: string; productos: number; unidades: number }[];
    stockActual: { nombre: string; stock: number; minimo: number }[];
    masMovimiento: { nombre: string; movido: number }[];
    evolucion: { fecha: string; unidades: number }[];
    enviosPorEstado: { estado: string; cantidad: number }[];
  } | null;
}

export async function getDashboard(): Promise<ActionResult<DashboardData>> {
  try {
    const me = await requireUser();
    const statsRes = await db.execute<Record<string, number>>(sql`
      select
        (select count(*)::int from products where deleted_at is null) as total_productos,
        (select count(*)::int from products where deleted_at is null and activo and stock > 0 and stock <= stock_minimo) as stock_bajo,
        (select count(*)::int from products where deleted_at is null and activo and stock <= 0) as sin_stock,
        (select coalesce(sum(stock),0)::int from products where deleted_at is null) as unidades,
        (select coalesce(sum(stock * precio_compra),0)::float from products where deleted_at is null) as valor,
        (select count(*)::int from categories) as categorias,
        (select count(*)::int from shipments where estado in ('pendiente','preparando','listo')) as envios_pendientes,
        (select count(*)::int from shipments where estado in ('enviado','entregado')) as envios_realizados`);
    const s = statsRes.rows[0];
    const stats = {
      totalProductos: Number(s.total_productos),
      stockBajo: Number(s.stock_bajo),
      sinStock: Number(s.sin_stock),
      unidades: Number(s.unidades),
      categorias: Number(s.categorias),
      enviosPendientes: Number(s.envios_pendientes),
      enviosRealizados: Number(s.envios_realizados),
      valorInventario: me.rol === "admin" ? Number(s.valor) : 0,
    };
    if (me.rol !== "admin") return { ok: true, data: { stats, charts: null } };

    const [cat, top, mov, evo, env] = await Promise.all([
      db.execute<{ nombre: string; productos: number; unidades: number }>(sql`
        select c.nombre, count(p.id)::int as productos, coalesce(sum(p.stock),0)::int as unidades
        from categories c left join products p on p.categoria_id = c.id and p.deleted_at is null
        group by c.id order by c.nombre`),
      db.execute<{ nombre: string; stock: number; minimo: number }>(sql`
        select nombre, stock, stock_minimo as minimo from products where deleted_at is null and activo
        order by stock desc limit 10`),
      db.execute<{ nombre: string; movido: number }>(sql`
        select p.nombre, sum(m.cantidad)::int as movido from stock_movements m join products p on p.id = m.producto_id
        where m.created_at > now() - interval '30 days' and m.tipo = 'salida'
        group by p.id order by movido desc limit 8`),
      db.execute<{ fecha: string; neto: number }>(sql`
        select to_char(d::date, 'YYYY-MM-DD') as fecha,
          coalesce((select sum(case when m.tipo='entrada' then m.cantidad when m.tipo='salida' then -m.cantidad else m.stock_nuevo - m.stock_anterior end)
                    from stock_movements m where m.created_at::date = d::date), 0)::int as neto
        from generate_series(current_date - interval '29 days', current_date, interval '1 day') d order by d`),
      db.execute<{ estado: string; cantidad: number }>(sql`select estado, count(*)::int as cantidad from shipments group by estado`),
    ]);
    // Reconstruct daily total units backwards from the current total using net daily movement.
    const evoRows = evo.rows;
    const evolucion: { fecha: string; unidades: number }[] = new Array(evoRows.length);
    let running = stats.unidades;
    for (let i = evoRows.length - 1; i >= 0; i--) {
      evolucion[i] = { fecha: evoRows[i].fecha.slice(5).split("-").reverse().join("/"), unidades: running };
      running -= Number(evoRows[i].neto);
    }
    return {
      ok: true,
      data: {
        stats,
        charts: {
          porCategoria: cat.rows.map((r) => ({ ...r, productos: Number(r.productos), unidades: Number(r.unidades) })),
          stockActual: top.rows.map((r) => ({ ...r, stock: Number(r.stock), minimo: Number(r.minimo) })),
          masMovimiento: mov.rows.map((r) => ({ ...r, movido: Number(r.movido) })),
          evolucion,
          enviosPorEstado: env.rows.map((r) => ({ ...r, cantidad: Number(r.cantidad) })),
        },
      },
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
