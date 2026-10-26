-- =====================================================================
-- StockPro — Migración a schema de la app (auth propia con password_hash)
-- Ejecutar en Supabase SQL Editor. Idempotente: podés correrlo varias veces.
-- Alinea la DB con src/db/schema.ts (Drizzle).
--
-- ⚠️ NOTA DE ARQUITECTURA (ver supabase/README.md):
-- Este es el archivo APLICABLE para una DB de Supabase existente.
-- Es el complemento de supabase/schema.sql (histórico). El esquema
-- canónico de la app es src/db/schema.ts.
-- =====================================================================

-- 0) auth_attempts: contador persistente de intentos fallidos de login/reset
--    (rate limiting). La app también la crea automáticamente si falta
--    (CREATE TABLE IF NOT EXISTS), pero incluirla acá deja la DB lista.
create table if not exists public.auth_attempts (
  key text primary key,
  failures integer not null default 0,
  first_failure_at timestamptz not null default now(),
  locked_until timestamptz
);
alter table public.auth_attempts enable row level security;

-- 1) profiles: agregar columnas que usa la app y que faltan en Supabase
alter table public.profiles add column if not exists password_hash text;
alter table public.profiles add column if not exists puede_movimientos boolean not null default true;

-- 2) defaults de la app
alter table public.profiles alter column puede_movimientos set default true;

-- El id en la app es uuid generado por la app (defaultRandom), no FK a auth.users.
-- Quitar la FK de profiles.id -> auth.users(id) si existe (bloquea el seed de admin).
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'profiles'
      and con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

-- default gen_random_uuid para id (requiere pgcrypto; Supabase lo trae)
create extension if not exists pgcrypto;
do $$
begin
  begin
    alter table public.profiles alter column id set default gen_random_uuid();
  exception when others then null;
  end;
end $$;

-- 2) Tablas de auth propia que faltan en Supabase (sessions, password_resets)
create table if not exists public.sessions (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.password_resets (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

-- 3) storage_files (la app guarda imágenes en Base64 en esta tabla, no en Storage buckets)
create table if not exists public.storage_files (
  path text primary key,
  bucket text not null,
  mime text not null,
  size integer not null,
  data text not null,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 4) RLS habilitada (deny-by-default para claves anon/authenticated).
-- La app se conecta con DATABASE_URL como postgres (owner de las tablas),
-- y el owner NO cumple RLS, así que la app opera con normalidad.
alter table public.sessions enable row level security;
alter table public.password_resets enable row level security;
alter table public.storage_files enable row level security;

-- =====================================================================
-- 5) Alinear tipos: la plantilla vieja creó columnas bigint (bigserial/bigint)
--    pero src/db/schema.ts declara serial/integer. node-postgres devuelve int8
--    como string y drizzle PgSerial no convierte → los Map<number,...> del
--    código (p.ej. buildItems de Envíos: merged.get(p.id)) reciben claves
--    string y devuelven undefined (cantidad=null, subtotal=NaN).
--    Convierte TODAS las columnas bigint de public a integer, conservando
--    defaults (sequences) y reconstruyendo PK/UNIQUE/FK.
--    Idempotente: si no quedan columnas bigint, no hace nada.
-- =====================================================================
do $$
declare
  pol  record;
  crec record;
  defs   text[] := '{}';
  polstm text[] := '{}';
  seq    text;
  dflt   text;
  i      integer;
  npol   integer := 0;
  ncon   integer := 0;
  ncol   integer := 0;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and data_type = 'bigint'
  ) then
    raise notice 'bigint->integer: no quedan columnas bigint en public; nada que hacer';
    return;
  end if;

  -- 1) Políticas RLS de tablas con columnas bigint: se guardan y se borran,
  --    porque Postgres no permite ALTER TYPE de una columna usada en una policy.
  for pol in
    select c.relname tbl,
           p.polname nm,
           p.polcmd  cmd,
           p.polpermissive perm,
           pg_get_expr(p.polqual,       p.polrelid) qual,
           pg_get_expr(p.polwithcheck,  p.polrelid) chk,
           (select string_agg(quote_ident(r.rolname), ', ' order by r.rolname)
              from pg_roles r where r.oid = any (p.polroles)) roles
    from pg_policy p
    join pg_class     c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = p.polrelid and a.attnum > 0 and not a.attisdropped
          and a.atttypid = 'int8'::regtype
      )
    order by c.relname, p.polname
  loop
    polstm := polstm || format(
      'create policy %I on public.%I as %s for %s to %s%s%s',
      pol.nm, pol.tbl,
      case when pol.perm then 'permissive' else 'restrictive' end,
      case pol.cmd when 'r' then 'select' when 'a' then 'insert'
                   when 'w' then 'update' when 'd' then 'delete' else 'all' end,
      coalesce(pol.roles, 'public'),
      case when pol.qual is not null then ' using (' || pol.qual || ')'    else '' end,
      case when pol.chk  is not null then ' with check (' || pol.chk || ')' else '' end
    );
    execute format('drop policy %I on public.%I', pol.nm, pol.tbl);
    npol := npol + 1;
  end loop;

  -- 2) guardar constraints (PK/UNIQUE/FK) que toquen columnas bigint y borrarlas.
  --    Orden alfabético de contype: 'f' (FK) antes que 'p'/'u', porque no se
  --    puede borrar un PK/UNIQUE mientras una FK lo referencia.
  for crec in
    select rel.relname::text tbl, con.conname nm, pg_get_constraintdef(con.oid) cdef
    from pg_constraint con
    join pg_class     rel on rel.oid = con.conrelid
    join pg_namespace n   on n.oid  = rel.relnamespace
    where n.nspname = 'public'
      and (
        (con.contype in ('p','u') and exists (
          select from pg_attribute a where a.attrelid = con.conrelid
            and a.attnum = any (con.conkey) and a.atttypid = 'int8'::regtype))
        or (con.contype = 'f' and (
          exists (select from pg_attribute a where a.attrelid = con.conrelid
                    and a.attnum = any (con.conkey) and a.atttypid = 'int8'::regtype)
          or exists (select from pg_attribute a where a.attrelid = con.confrelid
                       and a.attnum = any (con.confkey) and a.atttypid = 'int8'::regtype)))
      )
    order by con.contype
  loop
    defs := defs || format('alter table public.%I add constraint %I %s', crec.tbl, crec.nm, crec.cdef);
    execute format('alter table public.%I drop constraint %I', crec.tbl, crec.nm);
    ncon := ncon + 1;
  end loop;

  -- 3) convertir cada columna bigint → integer preservando default/sequence
  for crec in
    select table_name tbl, column_name cname
    from information_schema.columns
    where table_schema = 'public' and data_type = 'bigint'
    order by table_name, column_name
  loop
    seq  := pg_get_serial_sequence(format('public.%I', crec.tbl), crec.cname);
    dflt := null;
    if seq is not null then
      select pg_get_expr(d.adbin, d.adrelid) into dflt
      from pg_attrdef d
      where d.adrelid = format('public.%I', crec.tbl)::regclass
        and d.adnum = (select attnum from pg_attribute
                       where attrelid = format('public.%I', crec.tbl)::regclass and attname = crec.cname);
      execute format('alter table public.%I alter column %I drop default', crec.tbl, crec.cname);
    end if;
    execute format('alter table public.%I alter column %I type integer using %I::integer',
                   crec.tbl, crec.cname, crec.cname);
    if dflt is not null then
      execute format('alter table public.%I alter column %I set default %s', crec.tbl, crec.cname, dflt);
    end if;
    ncol := ncol + 1;
  end loop;

  -- 4) recrear constraints en orden inverso al drop (PK/UNIQUE antes que FK)
  if array_length(defs, 1) is not null then
    for i in reverse array_length(defs, 1) .. 1 loop
      execute defs[i];
    end loop;
  end if;

  -- 5) recrear las políticas RLS capturadas
  if array_length(polstm, 1) is not null then
    for i in 1 .. array_length(polstm, 1) loop
      execute polstm[i];
    end loop;
  end if;

  raise notice 'bigint->integer OK: % columnas convertidas, % constraints recreados, % políticas RLS recreadas',
    ncol, ncon, npol;
end $$;
