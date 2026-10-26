"use server";

import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles, sessions } from "@/db/schema";
import type { ActionResult, Role, UserDTO } from "@/types";
import { email as vEmail, errorMessage, str, ValidationError } from "@/utils/validation";
import { hashPassword, requireAdmin } from "@/services/auth/session";

export async function listUsers(): Promise<ActionResult<UserDTO[]>> {
  try {
    await requireAdmin();
    const rows = await db
      .select({
        id: profiles.id,
        nombre: profiles.nombre,
        apellido: profiles.apellido,
        email: profiles.email,
        rol: profiles.rol,
        puedeMovimientos: profiles.puedeMovimientos,
        avatar: profiles.avatar,
        activo: profiles.activo,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .orderBy(asc(profiles.nombre));
    return { ok: true, data: rows.map((r) => ({ ...r, rol: r.rol as Role, createdAt: r.createdAt.toISOString() })) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function createUser(input: {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
  rol: Role;
  puedeMovimientos: boolean;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    const rol: Role = input.rol === "admin" ? "admin" : "empleado";
    await db.insert(profiles).values({
      nombre: str(input.nombre, "Nombre", { required: true, max: 80 }),
      apellido: str(input.apellido, "Apellido", { max: 80 }),
      email: vEmail(input.email),
      passwordHash: await hashPassword(str(input.password, "Contraseña", { required: true, min: 6, max: 128 })),
      rol,
      puedeMovimientos: rol === "admin" ? true : Boolean(input.puedeMovimientos),
    });
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}


export async function updateUserAccess(
  id: string,
  input: { rol: Role; puedeMovimientos: boolean; activo: boolean },
): Promise<ActionResult> {
  try {
    const me = await requireAdmin();
    const rol: Role = input.rol === "admin" ? "admin" : "empleado";
    const [u] = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
    if (!u) throw new ValidationError("El usuario no existe.");
    if (id === me.id && (rol !== "admin" || !input.activo))
      throw new ValidationError("No podés quitarte el rol de administrador ni desactivarte a vos mismo.");
    // Política conservadora: un administrador no puede modificar el rol ni la activación
    // de OTRO administrador. Evita bloqueos entre admins y escaladas de privilegio.
    // (Documentado: requiere que exista un admin "por encima" o consenso entre pares.)
    if (u.id !== me.id && u.rol === "admin")
      throw new ValidationError("Un administrador no puede modificar el rol ni la activación de otro administrador.");
    await db.transaction(async (tx) => {
      const adminRows = await tx.execute<{ c: number }>(
        sql`select count(*)::int as c from profiles where rol = 'admin' and activo = true for update`
      );
      const adminCountTx = Number(adminRows.rows[0]?.c ?? 0);
      if (u.rol === "admin" && (rol !== "admin" || !input.activo) && adminCountTx <= 1)
        throw new ValidationError("Debe existir al menos un administrador activo.");
      await tx
        .update(profiles)
        .set({ rol, puedeMovimientos: rol === "admin" ? true : Boolean(input.puedeMovimientos), activo: Boolean(input.activo) })
        .where(eq(profiles.id, id));
      // Revocar sesiones al desactivar, de forma atómica con el cambio de permisos.
      if (!input.activo) await tx.delete(sessions).where(eq(sessions.userId, id));
    });
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
