-- Fixes for the Ferretería integration. Apply AFTER supabase_migration_ferreteria_complete.sql.
-- Safe to run more than once.
begin;

-- 1) ferreteria_create_sale() reads and writes public.sale_requests (idempotency of sales),
--    but no migration created it. PL/pgSQL only resolves tables at run time, so the
--    "complete" migration validated fine while every sale would fail with
--    'relation "public.sale_requests" does not exist'.
create table if not exists public.sale_requests (
  idempotency_key uuid primary key,
  request_hash text not null,
  shipment_id bigint not null references public.shipments(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Only the SECURITY DEFINER function touches it: RLS on and no policies = invisible to clients.
alter table public.sale_requests enable row level security;
revoke all on public.sale_requests from anon, authenticated;

-- 2) The "profiles: update own basic data" policy limits the ROWS a user can update, but not
--    the COLUMNS: any user could change their own email, password_hash, id or auth_user_id
--    from the browser. Restrict browser updates to the columns the app actually edits.
--    (The Edge Functions use the service_role and are not affected.)
--    If another app updates profiles with the "authenticated" role, review this before applying.
revoke update on public.profiles from authenticated;
grant update (nombre, apellido, telefono, rol, activo, puede_movimientos) on public.profiles to authenticated;

commit;
