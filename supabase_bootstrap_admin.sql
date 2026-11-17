-- One-time link for the first Ferreteria administrator.
-- Before running this script:
--   1. Create the user's email/password in Supabase Authentication > Users.
--   2. Apply supabase_migration_ferreteria_complete.sql.
-- Replace the address below with the exact Auth email.

insert into public.profiles (
  id, auth_user_id, nombre, apellido, email, password_hash,
  rol, puede_movimientos, activo
)
select
  u.id,
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)),
  '',
  u.email,
  'supabase-auth-only',
  'admin',
  true,
  true
from auth.users u
where lower(u.email) = lower('admin@admin.com')
on conflict (email) do update set
  auth_user_id = excluded.auth_user_id,
  rol = 'admin',
  puede_movimientos = true,
  activo = true;

-- Check the link and admin role:
select id, auth_user_id, email, rol, activo
from public.profiles
where lower(email) = lower('admin@admin.com');
