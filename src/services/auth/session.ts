import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { and, eq, gt } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { profiles, sessions } from "@/db/schema";
import type { SessionUser } from "@/types";
import { ensureSeed } from "@/services/seed";

const scrypt = promisify(_scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "dist_session";
const SESSION_DAYS = 30;

export class AuthError extends Error {
  name = "AuthError";
}
export class PermissionError extends Error {
  name = "PermissionError";
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const key = await scrypt(password, salt, 64);
  const hb = Buffer.from(hash, "hex");
  return hb.length === key.length && timingSafeEqual(hb, key);
}

export function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  store.delete(SESSION_COOKIE);
}

/** Returns the authenticated user (cached per request) or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  await ensureSeed();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
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
    })
    .from(sessions)
    .innerJoin(profiles, eq(sessions.userId, profiles.id))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const u = rows[0];
  if (!u || !u.activo) return null;
  return {
    id: u.id,
    nombre: u.nombre,
    apellido: u.apellido,
    email: u.email,
    rol: u.rol === "admin" ? "admin" : "empleado",
    puedeMovimientos: u.rol === "admin" ? true : u.puedeMovimientos,
    avatar: u.avatar,
  };
});

/** For server actions: throws if not authenticated. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new AuthError("Tu sesión expiró. Iniciá sesión nuevamente.");
  return u;
}

/** For server actions: throws if not admin. */
export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.rol !== "admin") throw new PermissionError("No tenés permisos para realizar esta acción.");
  return u;
}

/** For server components/pages: redirects when unauthenticated/unauthorized. */
export async function requirePageUser(adminOnly = false): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (adminOnly && u.rol !== "admin") redirect("/dashboard?denied=1");
  return u;
}
