import { sql } from "drizzle-orm";
import { db, ensureDbReady, isEmbeddedDb } from "@/db";
import { profiles } from "@/db/schema";
import { scrypt as _scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scrypt = promisify(_scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;
async function hash(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(pw, salt, 64)).toString("hex")}`;
}

const g = globalThis as typeof globalThis & { __seedPromise?: Promise<void> };

/**
 * Crea el usuario administrador inicial solo si la tabla profiles está vacía (idempotente).
 * La contraseña NO es predecible: se genera aleatoria (32 bytes) y se imprime UNA sola vez
 * en la consola del servidor. Alternativamente se puede fijar por variable de entorno
 * SEED_ADMIN_INITIAL_PASSWORD (ver .env.example) para instalaciones automatizadas.
 */
export function ensureSeed(): Promise<void> {
  if (!g.__seedPromise) {
    g.__seedPromise = runSeed().catch((e) => {
      console.error("Seed failed", e instanceof Error ? e.message : e);
      g.__seedPromise = undefined;
    });
  }
  return g.__seedPromise;
}

function initialPasswordFromEnv(): string | null {
  const v = process.env.SEED_ADMIN_INITIAL_PASSWORD?.trim();
  return v && v.length >= 8 ? v : null;
}

async function runSeed() {
  // Si falla (DB caída o schema incompleto), propagate: ensureSeed registra el
  // error, limpia la promesa cacheada y el próximo request reintenta.
  await ensureDbReady();
  const existing = await db.execute<{ c: number }>(sql`select count(*)::int as c from profiles`);
  if (Number(existing.rows[0]?.c ?? 0) > 0) return;

  const envPassword = initialPasswordFromEnv();
  const password = envPassword ?? randomBytes(24).toString("base64url");

  await db.transaction(async (tx) => {
    if (!isEmbeddedDb) {
      try {
        await tx.execute(sql`select pg_advisory_xact_lock(424242)`);
      } catch {
        /* continuar sin lock */
      }
    }
    const again = await tx.execute<{ c: number }>(sql`select count(*)::int as c from profiles`);
    if (Number(again.rows[0]?.c ?? 0) > 0) return;
    await tx.insert(profiles).values([
      {
        nombre: "Administrador",
        apellido: "Inicial",
        email: "admin@sistema.local",
        passwordHash: await hash(password),
        rol: "admin",
      },
    ]);
  });

  // La credencial inicial se muestra solo en la consola del servidor, una vez.
  // Si usaste SEED_ADMIN_INITIAL_PASSWORD no se imprime ningún secreto.
  if (!envPassword) {
    console.warn(
      "\n[seed] Se creó el administrador inicial.\n" +
        "  Email:     admin@sistema.local\n" +
        `  Contraseña (mostrada solo una vez, anotala ahora): ${password}\n` +
        '  Después del primer ingreso, cambiala desde "Mi perfil".\n',
    );
  } else {
    console.warn("\n[seed] Se creó el administrador inicial (credencial provista por SEED_ADMIN_INITIAL_PASSWORD).\n");
  }
}
