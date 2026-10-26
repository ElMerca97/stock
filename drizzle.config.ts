import { defineConfig } from "drizzle-kit";
import "dotenv/config";

/**
 * Drizzle Kit usa DATABASE_URL (.env). Se valida antes de continuar para fallar
 * con un mensaje claro (sin imprimir la URL ni la contraseña).
 */
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "Falta la variable DATABASE_URL. Copiá .env.example a .env y completá la conexión a tu Postgres de Supabase.",
  );
}
if (!/^postgres(ql)?:\/\//.test(url)) {
  throw new Error("DATABASE_URL no parece una URL de PostgreSQL válida (debe empezar con postgresql:// o postgres://).");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url },
});