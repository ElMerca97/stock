/**
 * Supabase configuration (public values only).
 *
 * The app currently runs on the platform's PostgreSQL via Drizzle (see src/db) with
 * server-side session auth and role checks in every service. To migrate to Supabase:
 *   1. Run `supabase/schema.sql` in the Supabase SQL editor (tables, RLS, storage buckets).
 *   2. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in `.env`.
 *   3. Point DATABASE_URL to the Supabase Postgres connection string (server only).
 *
 * NEVER put the service_role key in NEXT_PUBLIC_* variables or client code.
 */
export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "",
  buckets: {
    products: "products",
    categories: "categories",
    avatars: "avatars",
  },
} as const;

export const isSupabaseConfigured = Boolean(supabaseConfig.url && supabaseConfig.anonKey);
