-- =====================================================================
-- StockPro — Supabase schema with Row Level Security and Storage
-- Run in the Supabase SQL editor. Mirrors src/db/schema.ts.
--
-- ⚠️ NOTA DE ARQUITECTURA (ver supabase/README.md):
-- La aplicación NO usa Supabase Auth: usa autenticación propia con
-- profiles.password_hash + tabla sessions. El esquema CANÓNICO es
-- src/db/schema.ts (Drizzle). Este archivo es histórico/de referencia.
-- Para una instalación nueva que ya tiene profiles con auth.users,
-- usar supabase/migrate-to-app-schema.sql.
-- Las políticas RLS de abajo usan auth.uid() y solo aplican si la DB
-- se consume con Supabase Auth; la app se conecta como dueño (postgres)
-- vía DATABASE_URL y opera por código, así que RLS no la afecta.
-- =====================================================================

-- ---------- PROFILES (auth propia de la app: password_hash scrypt) ----------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido text not null default '',
  email text not null unique,
  password_hash text not null,
  rol text not null default 'empleado' check (rol in ('admin','empleado')),
  puede_movimientos boolean not null default true,
  avatar text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Helper functions (security definer to avoid RLS recursion)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and rol = 'admin' and activo);
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and activo);
$$;

create or replace function public.can_move_stock() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and activo and (rol = 'admin' or puede_movimientos));
$$;

-- (Eliminado: trigger handle_new_user de Supabase Auth — la app usa autenticación
--  propia con password_hash y crea el usuario admin inicial con src/services/seed.ts.)

-- ---------- CATEGORIES ----------
create table if not exists public.categories (
  id bigserial primary key,
  nombre text not null unique,
  descripcion text not null default '',
  imagen text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- PRODUCTS ----------
create table if not exists public.products (
  id bigserial primary key,
  nombre text not null,
  sku text not null unique,
  categoria_id bigint references public.categories(id) on delete restrict,
  tipo text not null default 'Unidad',
  descripcion text not null default '',
  precio_compra numeric(12,2) not null default 0 check (precio_compra >= 0),
  precio_venta numeric(12,2) not null default 0 check (precio_venta >= 0),
  stock integer not null default 0 check (stock >= 0),
  stock_minimo integer not null default 0 check (stock_minimo >= 0),
  imagen text,
  activo boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_categoria_idx on public.products(categoria_id);

-- ---------- CUSTOMERS ----------
create table if not exists public.customers (
  id bigserial primary key,
  nombre text not null,
  apellido text not null default '',
  empresa text not null default '',
  telefono text not null default '',
  email text not null default '',
  direccion text not null default '',
  ciudad text not null default '',
  departamento text not null default '',
  observaciones text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- SHIPMENTS ----------
create table if not exists public.shipments (
  id bigserial primary key,
  cliente_id bigint not null references public.customers(id) on delete restrict,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','preparando','listo','enviado','entregado','cancelado')),
  total numeric(14,2) not null default 0,
  telefono text not null default '',
  direccion text not null default '',
  ciudad text not null default '',
  observaciones text not null default '',
  stock_descontado boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  fecha_envio timestamptz,
  fecha_entrega timestamptz
);

create table if not exists public.shipment_items (
  id bigserial primary key,
  envio_id bigint not null references public.shipments(id) on delete cascade,
  producto_id bigint not null references public.products(id) on delete restrict,
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null,
  subtotal numeric(14,2) not null
);

-- ---------- STOCK MOVEMENTS ----------
create table if not exists public.stock_movements (
  id bigserial primary key,
  producto_id bigint not null references public.products(id) on delete restrict,
  tipo text not null check (tipo in ('entrada','salida','ajuste')),
  cantidad integer not null,
  stock_anterior integer not null,
  stock_nuevo integer not null,
  usuario_id uuid references public.profiles(id) on delete set null,
  envio_id bigint references public.shipments(id) on delete set null,
  motivo text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.alert_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  producto_id bigint not null references public.products(id) on delete cascade,
  tipo text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, producto_id)
);

-- ---------- APP AUTH: sesiones y resets de la app (no se usa Supabase Auth) ----------
create table if not exists public.sessions (
  id text primary key, -- sha256 del token
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.password_resets (
  id text primary key, -- sha256 del token
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

-- Imágenes de la app guardadas en Base64 (la app no usa Supabase Storage)
create table if not exists public.storage_files (
  path text primary key,
  bucket text not null,
  mime text not null,
  size integer not null,
  data text not null,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;
alter table public.password_resets enable row level security;
alter table public.storage_files enable row level security;

-- =====================================================================
-- STOCK RPC: the only way to change stock (atomic, always logs movement)
-- =====================================================================
create or replace function public.register_stock_movement(
  p_producto_id bigint, p_tipo text, p_cantidad integer, p_motivo text, p_envio_id bigint default null
) returns public.stock_movements
language plpgsql security definer set search_path = public as $$
declare
  v_prev integer; v_new integer; v_qty integer; v_mov stock_movements;
begin
  if not can_move_stock() then raise exception 'Sin permiso para registrar movimientos'; end if;
  if p_tipo = 'ajuste' and not is_admin() then raise exception 'Solo administradores pueden ajustar stock'; end if;
  select stock into v_prev from products where id = p_producto_id and deleted_at is null for update;
  if not found then raise exception 'Producto inexistente'; end if;
  if p_tipo = 'entrada' then v_qty := p_cantidad; v_new := v_prev + p_cantidad;
  elsif p_tipo = 'salida' then v_qty := p_cantidad; v_new := v_prev - p_cantidad;
  elsif p_tipo = 'ajuste' then v_new := p_cantidad; v_qty := abs(p_cantidad - v_prev);
  else raise exception 'Tipo inválido'; end if;
  if v_new < 0 then raise exception 'Stock insuficiente'; end if;
  update products set stock = v_new, updated_at = now() where id = p_producto_id;
  insert into stock_movements (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, usuario_id, envio_id, motivo)
  values (p_producto_id, p_tipo, v_qty, v_prev, v_new, auth.uid(), p_envio_id, coalesce(p_motivo, ''))
  returning * into v_mov;
  return v_mov;
end $$;

-- Prevent direct stock edits outside the RPC
create or replace function public.guard_stock_update() returns trigger
language plpgsql as $$
begin
  if new.stock is distinct from old.stock and current_setting('role', true) = 'authenticated'
     and pg_trigger_depth() = 1 then
    raise exception 'El stock solo puede modificarse mediante register_stock_movement()';
  end if;
  return new;
end $$;
drop trigger if exists products_guard_stock on public.products;
create trigger products_guard_stock before update on public.products
  for each row execute function public.guard_stock_update();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.alert_reads enable row level security;

-- profiles
create policy "profiles: read own or admin" on public.profiles for select using (id = auth.uid() or is_admin());
create policy "profiles: update own basic data" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and rol = (select rol from profiles where id = auth.uid())
              and puede_movimientos = (select puede_movimientos from profiles where id = auth.uid())
              and activo = (select activo from profiles where id = auth.uid()));
create policy "profiles: admin manages" on public.profiles for update using (is_admin()) with check (is_admin());
-- (no delete policy: employees can never delete users; admins deactivate instead)

-- categories: everyone active can read; only admins write
create policy "categories: read" on public.categories for select using (is_active_user());
create policy "categories: admin insert" on public.categories for insert with check (is_admin());
create policy "categories: admin update" on public.categories for update using (is_admin()) with check (is_admin());
create policy "categories: admin delete" on public.categories for delete using (is_admin());

-- products: read for active users; write only admins (stock via RPC)
create policy "products: read" on public.products for select using (is_active_user());
create policy "products: admin insert" on public.products for insert with check (is_admin());
create policy "products: admin update" on public.products for update using (is_admin()) with check (is_admin());
-- soft delete only: no delete policy

-- customers: employees and admins manage; only admins (soft) delete via update of deleted_at
create policy "customers: read" on public.customers for select using (is_active_user());
create policy "customers: insert" on public.customers for insert with check (is_active_user());
create policy "customers: update" on public.customers for update using (is_active_user())
  with check (is_active_user() and (deleted_at is null or is_admin()));

-- shipments & items
create policy "shipments: read" on public.shipments for select using (is_active_user());
create policy "shipments: insert" on public.shipments for insert with check (is_active_user() and created_by = auth.uid());
create policy "shipments: update" on public.shipments for update using (is_active_user()) with check (is_active_user());
create policy "shipment_items: read" on public.shipment_items for select using (is_active_user());
create policy "shipment_items: write pending" on public.shipment_items for all
  using (is_active_user() and exists (select 1 from shipments s where s.id = envio_id and s.estado = 'pendiente'))
  with check (is_active_user() and exists (select 1 from shipments s where s.id = envio_id and s.estado = 'pendiente'));

-- stock movements: admins read all, employees their own; inserts only via RPC (security definer)
create policy "movements: read" on public.stock_movements for select using (is_admin() or usuario_id = auth.uid());

-- alert reads: each user manages their own
create policy "alert_reads: own" on public.alert_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- STORAGE: buckets /products /categories /avatars
-- =====================================================================
insert into storage.buckets (id, name, public) values
  ('products', 'products', true), ('categories', 'categories', true), ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "storage: public read" on storage.objects for select
  using (bucket_id in ('products','categories','avatars'));
create policy "storage: admin writes catalog images" on storage.objects for insert
  with check (bucket_id in ('products','categories') and public.is_admin());
create policy "storage: admin updates catalog images" on storage.objects for update
  using (bucket_id in ('products','categories') and public.is_admin());
create policy "storage: admin deletes catalog images" on storage.objects for delete
  using (bucket_id in ('products','categories') and public.is_admin());
-- avatars: each user writes inside a folder named with their uid (avatars/<uid>/file.png)
create policy "storage: own avatar insert" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "storage: own avatar update" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "storage: own avatar delete" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
