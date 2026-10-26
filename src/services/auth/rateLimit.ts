import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { authAttempts } from "@/db/schema";

/**
 * Limitación de intentos de autenticación persistente en la base de datos
 * (sobrevive a reinicios del servidor, a diferencia de un Map en memoria).
 * Si la tabla aún no existe en la DB, se crea de forma aditiva e idempotente
 * (CREATE TABLE IF NOT EXISTS); si eso falla, se degrada a un contador en
 * memoria para no bloquear el login por un problema de infraestructura.
 */

export class RateLimitError extends Error {
  name = "RateLimitError";
}

interface Policy {
  /** Fallos máximos dentro de la ventana antes de bloquear. */
  maxFailures: number;
  /** Ventana móvil en ms. */
  windowMs: number;
  /** Bloqueo temporal en ms una vez superado el máximo (nunca permanente). */
  lockMs: number;
}

export const LOGIN_POLICY: Policy = { maxFailures: 8, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
export const LOGIN_IP_POLICY: Policy = { maxFailures: 30, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
export const RESET_POLICY: Policy = { maxFailures: 5, windowMs: 60 * 60_000, lockMs: 60 * 60_000 };

const memory = new Map<string, { failures: number; firstFailureAt: number; lockedUntil: number | null }>();
let tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = db
      .execute(sql`
        create table if not exists auth_attempts (
          key text primary key,
          failures integer not null default 0,
          first_failure_at timestamptz not null default now(),
          locked_until timestamptz
        )`)
      .then(() => undefined)
      .catch((e) => {
        console.error("auth_attempts table unavailable, falling back to memory:", e instanceof Error ? e.message : e);
        tableReady = null;
        throw e;
      });
  }
  return tableReady;
}

async function readDb(key: string): Promise<{ failures: number; firstFailureAt: Date; lockedUntil: Date | null } | null> {
  await ensureTable();
  const [row] = await db
    .select({
      failures: authAttempts.failures,
      firstFailureAt: authAttempts.firstFailureAt,
      lockedUntil: authAttempts.lockedUntil,
    })
    .from(authAttempts)
    .where(eq(authAttempts.key, key))
    .limit(1);
  return row ?? null;
}

async function writeDb(key: string, failures: number, firstFailureAt: Date, lockedUntil: Date | null) {
  await ensureTable();
  await db
    .insert(authAttempts)
    .values({ key, failures, firstFailureAt, lockedUntil })
    .onConflictDoUpdate({
      target: authAttempts.key,
      set: { failures, firstFailureAt, lockedUntil },
    });
}

async function deleteDb(key: string) {
  await ensureTable();
  await db.delete(authAttempts).where(eq(authAttempts.key, key));
}

/** Devuelve los ms restantes de bloqueo (0 si no está bloqueado). */
async function lockedForMs(key: string, now: number, policy: Policy): Promise<number> {
  let failures = 0;
  let firstFailureAt = now;
  let lockedUntil: number | null = null;
  try {
    const row = await readDb(key);
    if (row) {
      failures = row.failures;
      firstFailureAt = row.firstFailureAt.getTime();
      lockedUntil = row.lockedUntil?.getTime() ?? null;
    }
  } catch {
    const m = memory.get(key);
    if (m) ({ failures, firstFailureAt, lockedUntil } = m);
  }
  // Ventana expirada: resetear contador (el bloqueo, si existía, ya venció).
  if (now - firstFailureAt > policy.windowMs) {
    failures = 0;
    lockedUntil = null;
  }
  return lockedUntil && lockedUntil > now ? lockedUntil - now : 0;
}

/** Lanza RateLimitError si la clave está bloqueada. */
export async function assertNotLocked(key: string, policy: Policy): Promise<void> {
  const wait = await lockedForMs(key, Date.now(), policy);
  if (wait > 0) {
    const mins = Math.ceil(wait / 60_000);
    throw new RateLimitError(`Demasiados intentos fallidos. Intentá de nuevo en ${mins} minuto${mins === 1 ? "" : "s"}.`);
  }
}

/** Registra un fallo; bloquea la clave cuando supera el máximo de la política. */
export async function registerFailure(key: string, policy: Policy): Promise<void> {
  const now = Date.now();
  let failures = 1;
  let firstFailureAt = now;
  let lockedUntil: number | null = null;
  try {
    const row = await readDb(key);
    if (row && now - row.firstFailureAt.getTime() <= policy.windowMs) {
      failures = row.failures + 1;
      firstFailureAt = row.firstFailureAt.getTime();
    }
    if (failures >= policy.maxFailures) lockedUntil = now + policy.lockMs;
    await writeDb(key, failures, new Date(firstFailureAt), lockedUntil ? new Date(lockedUntil) : null);
  } catch {
    const row = memory.get(key);
    if (row && now - row.firstFailureAt <= policy.windowMs) {
      failures = row.failures + 1;
      firstFailureAt = row.firstFailureAt;
    }
    if (failures >= policy.maxFailures) lockedUntil = now + policy.lockMs;
    memory.set(key, { failures, firstFailureAt, lockedUntil });
  }
}

/** Limpia los fallos tras un éxito (p. ej. login correcto). */
export async function clearFailures(key: string): Promise<void> {
  memory.delete(key);
  try {
    await deleteDb(key);
  } catch {
    /* el contador en memoria ya se limpió */
  }
}

/** IP del cliente detrás del proxy (solo el primer hop de X-Forwarded-For). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}
