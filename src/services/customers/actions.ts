"use server";

import { and, asc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, shipments } from "@/db/schema";
import type { ActionResult, CustomerDTO, Paginated } from "@/types";
import { email, errorMessage, str, ValidationError } from "@/utils/validation";
import { requireAdmin, requireUser } from "@/services/auth/session";

export async function listCustomers(f: { q?: string; ciudad?: string; page?: number; pageSize?: number } = {}): Promise<
  ActionResult<Paginated<CustomerDTO>>
> {
  try {
    await requireUser();
    const page = Math.max(1, f.page ?? 1);
    const pageSize = Math.min(500, Math.max(1, f.pageSize ?? 15));
    const conds: SQL[] = [isNull(customers.deletedAt)];
    if (f.q?.trim()) {
      const q = `%${f.q.trim()}%`;
      conds.push(
        or(
          ilike(customers.nombre, q),
          ilike(customers.apellido, q),
          ilike(customers.empresa, q),
          ilike(customers.email, q),
          ilike(customers.telefono, q),
        )!,
      );
    }
    if (f.ciudad?.trim()) conds.push(ilike(customers.ciudad, `%${f.ciudad.trim()}%`));
    const where = and(...conds);
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: customers.id,
          nombre: customers.nombre,
          apellido: customers.apellido,
          empresa: customers.empresa,
          telefono: customers.telefono,
          email: customers.email,
          direccion: customers.direccion,
          ciudad: customers.ciudad,
          departamento: customers.departamento,
          observaciones: customers.observaciones,
          createdAt: customers.createdAt,
          shipmentCount: sql<number>`(select count(*)::int from shipments s where s.cliente_id = ${customers.id})`,
        })
        .from(customers)
        .where(where)
        .orderBy(asc(customers.nombre), asc(customers.apellido))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ total: sql<number>`count(*)::int` }).from(customers).where(where),
    ]);
    return {
      ok: true,
      data: {
        rows: rows.map((r) => ({ ...r, shipmentCount: Number(r.shipmentCount), createdAt: r.createdAt.toISOString() })),
        total: Number(total),
        page,
        pageSize,
      },
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export type CustomerInput = Omit<CustomerDTO, "id" | "createdAt" | "shipmentCount">;

function parse(i: CustomerInput) {
  return {
    nombre: str(i.nombre, "Nombre", { required: true, max: 80 }),
    apellido: str(i.apellido, "Apellido", { max: 80 }),
    empresa: str(i.empresa, "Empresa", { max: 120 }),
    telefono: str(i.telefono, "Teléfono", { required: true, max: 40 }),
    email: email(i.email, "Email", false),
    direccion: str(i.direccion, "Dirección", { required: true, max: 200 }),
    ciudad: str(i.ciudad, "Ciudad", { required: true, max: 80 }),
    departamento: str(i.departamento, "Departamento", { max: 80 }),
    observaciones: str(i.observaciones, "Observaciones", { max: 1000 }),
  };
}

export async function createCustomer(input: CustomerInput): Promise<ActionResult<{ id: number }>> {
  try {
    await requireUser();
    const [c] = await db.insert(customers).values(parse(input)).returning({ id: customers.id });
    return { ok: true, data: { id: c.id } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function updateCustomer(id: number, input: CustomerInput): Promise<ActionResult> {
  try {
    await requireUser();
    const rows = await db
      .update(customers)
      .set(parse(input))
      .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
      .returning({ id: customers.id });
    if (rows.length === 0) throw new ValidationError("El cliente no existe o fue eliminado.");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Admin only. Soft delete; customers with active shipments cannot be removed. */
export async function deleteCustomer(id: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(shipments)
      .where(and(eq(shipments.clienteId, id), sql`${shipments.estado} not in ('entregado','cancelado')`));
    if (Number(c) > 0) throw new ValidationError("El cliente tiene envíos en curso; no se puede eliminar.");
    await db.update(customers).set({ deletedAt: new Date() }).where(eq(customers.id, id));
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
