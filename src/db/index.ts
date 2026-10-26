import { drizzle } from "drizzle-orm/node-postgres";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required (apunta a Supabase Postgres)");
}

/**
 * TLS del pool de Postgres (Supabase):
 * - Si DATABASE_SSL_MODE=verify-full y DATABASE_SSL_CA_FILE apunta a un PEM (p. ej.
 *   el certificado CA de Supabase), se valida la cadena completa del certificado.
 * - Si no, se mantiene el comportamiento histórico (rejectUnauthorized: false),
 *   necesario para el pooler de Supabase cuando no hay CA local disponible.
 *   Esto NO desactiva el cifrado: la conexión sigue siendo TLS, solo se omite
 *   la verificación del emisor. Reemplazá el fallback por verify-full en producción.
 */
function sslConfig(): { rejectUnauthorized: boolean; ca?: string } {
  const mode = process.env.DATABASE_SSL_MODE;
  const caFile = process.env.DATABASE_SSL_CA_FILE;
  if (mode === "verify-full" && caFile) {
    try {
      return { rejectUnauthorized: true, ca: readFileSync(caFile, "utf8") };
    } catch {
      throw new Error(`DATABASE_SSL_CA_FILE no se pudo leer: la verificación TLS completa no está disponible. Revisá la ruta del certificado.`);
    }
  }
  if (mode === "verify-full") {
    throw new Error("DATABASE_SSL_MODE=verify-full requiere DATABASE_SSL_CA_FILE apuntando al certificado CA (PEM).");
  }
  return { rejectUnauthorized: false };
}

const globalForDb = globalThis as typeof globalThis & { __pool?: Pool };

export const pool = globalForDb.__pool ?? new Pool({ connectionString: databaseUrl, ssl: sslConfig() });

if (process.env.NODE_ENV !== "production") globalForDb.__pool = pool;

/** Drizzle sobre Postgres (Supabase). Sin fallback embebido: multi-usuario requiere DB compartida. */
export const db = drizzle(pool, { schema });

export const isEmbeddedDb = false;

export async function ensureDbReady(): Promise<void> {
  // Compat: con Postgres real no hay bootstrap que esperar.
}


