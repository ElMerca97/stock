"use server";

import { and, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { passwordResets, profiles, sessions } from "@/db/schema";
import type { ActionResult } from "@/types";
import { email as vEmail, errorMessage, imageUrl, str, ValidationError } from "@/utils/validation";
import {
  createSession,
  destroySession,
  hashPassword,
  newToken,
  requireUser,
  SESSION_COOKIE,
  sha256,
  verifyPassword,
} from "./session";
import { cookies } from "next/headers";
import {
  assertNotLocked,
  clientIp,
  clearFailures,
  LOGIN_IP_POLICY,
  LOGIN_POLICY,
  registerFailure,
  RESET_POLICY,
} from "./rateLimit";
import { ensureSeed } from "@/services/seed";
import { deleteStoredFileIfOrphan, safeDeleteStoredFile } from "@/services/storage/files";

/** Enlaces de reset visibles en pantalla solo fuera de producción (o con RESET_LINK_ON_SCREEN=1). */
function resetLinkVisibleOnScreen(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.RESET_LINK_ON_SCREEN === "1";
}

export async function loginAction(input: { email: string; password: string }): Promise<ActionResult> {
  const ip = await clientIp();
  const emailKey = `login:email:${(input.email ?? "").trim().toLowerCase()}`;
  const ipKey = `login:ip:${ip}`;
  try {
    await ensureSeed();
    await assertNotLocked(emailKey, LOGIN_POLICY);
    await assertNotLocked(ipKey, LOGIN_IP_POLICY);
    const email = vEmail(input.email);
    const password = str(input.password, "Contraseña", { required: true });
    const [u] = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
    if (!u || !(await verifyPassword(password, u.passwordHash))) {
      // Contamos el fallo aunque el email no exista, para no revelar la existencia de la cuenta.
      await Promise.all([registerFailure(emailKey, LOGIN_POLICY), registerFailure(ipKey, LOGIN_IP_POLICY)]);
      return { ok: false, error: "Email o contraseña incorrectos." };
    }
    if (!u.activo) return { ok: false, error: "Tu usuario está desactivado. Contactá a un administrador." };
    await Promise.all([clearFailures(emailKey), clearFailures(ipKey)]);
    await createSession(u.id);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function registerAction(input: {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
}): Promise<ActionResult> {
  try {
    await ensureSeed();
    const nombre = str(input.nombre, "Nombre", { required: true, max: 80 });
    const apellido = str(input.apellido, "Apellido", { max: 80 });
    const email = vEmail(input.email);
    const password = str(input.password, "Contraseña", { required: true, min: 6, max: 128 });
    const [exists] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email)).limit(1);
    if (exists) return { ok: false, error: "Ya existe una cuenta con ese email." };
    // New registrations are employees; the very first user of an empty system becomes admin.
    const count = await db.execute<{ c: number }>(sql`select count(*)::int as c from profiles`);
    const rol = Number(count.rows[0]?.c ?? 0) === 0 ? "admin" : "empleado";
    const [u] = await db
      .insert(profiles)
      .values({ nombre, apellido, email, passwordHash: await hashPassword(password), rol, puedeMovimientos: false })
      .returning();
    await createSession(u.id);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function logoutAction(): Promise<ActionResult> {
  await destroySession();
  return { ok: true, data: null };
}

/**
 * Creates a one-time password reset token valid for 1 hour.
 * No email provider is configured, so the link is returned to be shown on screen
 * (replace with an email integration in production).
 */
export async function requestPasswordResetAction(input: { email: string }): Promise<ActionResult<{ link: string | null }>> {
  const ip = await clientIp();
  const emailRaw = (input.email ?? "").trim().toLowerCase();
  const emailKey = `reset:email:${emailRaw}`;
  const ipKey = `reset:ip:${ip}`;
  try {
    await assertNotLocked(emailKey, RESET_POLICY);
    await assertNotLocked(ipKey, RESET_POLICY);
    const email = vEmail(input.email);
    const [u] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email)).limit(1);
    // Contabilizar el intento de restablecimiento por IP (tanto si la cuenta existe como si no),
    // para aplicar RESET_POLICY sin permitir bloqueo dirigido a una cuenta mediante su correo.
    await registerFailure(ipKey, RESET_POLICY);
    if (!u) return { ok: true, data: { link: null } }; // don't reveal account existence
    const token = newToken();
    await db.insert(passwordResets).values({ id: sha256(token), userId: u.id, expiresAt: new Date(Date.now() + 3600_000) });
    // En producción el enlace no se muestra en pantalla: exige integración de email
    // (o RESET_LINK_ON_SCREEN=1 únicamente en entornos controlados/demo).
    return { ok: true, data: { link: resetLinkVisibleOnScreen() ? `/reset-password?token=${token}` : null } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function resetPasswordAction(input: { token: string; password: string }): Promise<ActionResult> {
  try {
    const password = str(input.password, "Contraseña", { required: true, min: 6, max: 128 });
    const token = str(input.token, "Token", { required: true });
    await db.transaction(async (tx) => {
      // Se reclama el token dentro de la transacción (used=false → true) para evitar
      // que dos usos simultáneos del mismo enlace procesen dos veces.
      const [r] = await tx
        .update(passwordResets)
        .set({ used: true })
        .where(and(eq(passwordResets.id, sha256(token)), eq(passwordResets.used, false), gt(passwordResets.expiresAt, new Date())))
        .returning();
      if (!r) throw new ValidationError("El enlace es inválido o expiró. Solicitá uno nuevo.");
      await tx.update(profiles).set({ passwordHash: await hashPassword(password) }).where(eq(profiles.id, r.userId));
      // Un reset invalida todas las sesiones del usuario.
      await tx.delete(sessions).where(eq(sessions.userId, r.userId));
    });
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function updateProfileAction(input: { nombre: string; apellido: string; avatar: string | null }): Promise<ActionResult> {
  try {
    const me = await requireUser();
    const nombre = str(input.nombre, "Nombre", { required: true, max: 80 });
    const apellido = str(input.apellido, "Apellido", { max: 80 });
    const avatar = imageUrl(input.avatar);
    // Guardar primero; el avatar anterior se libera solo si el update tuvo éxito.
    try {
      await db.update(profiles).set({ nombre, apellido, avatar }).where(eq(profiles.id, me.id));
    } catch (e) {
      if (avatar && avatar !== me.avatar) await safeDeleteStoredFile(avatar, "updateProfile");
      throw e;
    }
    if (me.avatar && me.avatar !== avatar) await deleteStoredFileIfOrphan(me.avatar, { userId: me.id }, "updateProfile");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function changePasswordAction(input: { actual: string; nueva: string }): Promise<ActionResult> {
  try {
    const me = await requireUser();
    const nueva = str(input.nueva, "Nueva contraseña", { required: true, min: 6, max: 128 });
    const [u] = await db.select().from(profiles).where(eq(profiles.id, me.id)).limit(1);
    if (!u || !(await verifyPassword(input.actual ?? "", u.passwordHash)))
      throw new ValidationError("La contraseña actual es incorrecta.");
    // Identifica la sesión actual para conservarla; se revocan todas las demás.
    const store = await cookies();
    const currentToken = store.get(SESSION_COOKIE)?.value;
    const currentId = currentToken ? sha256(currentToken) : null;
    await db.transaction(async (tx) => {
      await tx.update(profiles).set({ passwordHash: await hashPassword(nueva) }).where(eq(profiles.id, me.id));
      await tx
        .delete(sessions)
        .where(currentId ? and(eq(sessions.userId, me.id), ne(sessions.id, currentId)) : eq(sessions.userId, me.id));
    });
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
