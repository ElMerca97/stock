-- =====================================================================
-- Ferretería Lausana — Módulo DGI-Connection (facturación electrónica)
-- Crea las tablas necesarias para registrar comprobantes fiscales (CFE) y
-- la configuración de facturación electrónica. Idempotente.
-- No modifica tablas existentes de ventas/stock.
-- =====================================================================

create table if not exists fiscal_settings (
  id integer primary key default 1,
  enabled boolean not null default false,
  provider text not null default 'none',
  environment text not null default 'homologacion',
  default_cfe_type text not null default 'e-ticket',
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  constraint fiscal_settings_singleton check (id = 1)
);

insert into fiscal_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists cfe_documents (
  id serial primary key,
  sale_id integer not null unique references shipments(id) on delete cascade,
  cfe_type text not null,
  serie text,
  numero text,
  provider text not null default 'none',
  provider_document_id text,
  status text not null default 'pending',
  issued_at timestamptz,
  authorization_code text,
  document_url text,
  error_message text,
  provider_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cfe_documents_sale_idx on cfe_documents (sale_id);
create index if not exists cfe_documents_status_idx on cfe_documents (status);
