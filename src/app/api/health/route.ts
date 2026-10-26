import { db, ensureDbReady, isEmbeddedDb } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureDbReady();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, embedded: isEmbeddedDb });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
