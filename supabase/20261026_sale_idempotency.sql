-- Additive migration for safe retries of POS sales. Apply manually after review.
alter table public.shipments alter column cliente_id drop not null;

create table if not exists public.sale_requests (
  idempotency_key uuid primary key,
  request_hash text not null,
  shipment_id bigint not null unique references public.shipments(id) on delete cascade,
  created_at timestamptz not null default now()
);
