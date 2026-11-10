-- Optional customer defaults and per-sale discounts.
begin;

alter table public.customers
  add column if not exists descuento_porcentaje numeric(5,2);

alter table public.shipments
  add column if not exists subtotal numeric(14,2),
  add column if not exists descuento_porcentaje numeric(5,2),
  add column if not exists descuento_importe numeric(14,2);

update public.customers
set descuento_porcentaje = 0
where descuento_porcentaje is null;

update public.shipments
set subtotal = coalesce(subtotal, total),
    descuento_porcentaje = coalesce(descuento_porcentaje, 0),
    descuento_importe = coalesce(descuento_importe, 0)
where subtotal is null
   or descuento_porcentaje is null
   or descuento_importe is null;

alter table public.customers
  alter column descuento_porcentaje set default 0,
  alter column descuento_porcentaje set not null;

alter table public.shipments
  alter column subtotal set default 0,
  alter column subtotal set not null,
  alter column descuento_porcentaje set default 0,
  alter column descuento_porcentaje set not null,
  alter column descuento_importe set default 0,
  alter column descuento_importe set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_descuento_porcentaje_check') then
    alter table public.customers
      add constraint customers_descuento_porcentaje_check
      check (descuento_porcentaje >= 0 and descuento_porcentaje <= 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shipments_descuento_porcentaje_check') then
    alter table public.shipments
      add constraint shipments_descuento_porcentaje_check
      check (descuento_porcentaje >= 0 and descuento_porcentaje <= 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shipments_descuento_importe_check') then
    alter table public.shipments
      add constraint shipments_descuento_importe_check
      check (descuento_importe >= 0 and descuento_importe <= subtotal);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shipments_total_check') then
    alter table public.shipments
      add constraint shipments_total_check
      check (total = subtotal - descuento_importe);
  end if;
end $$;

update public.stock_movements sm
set motivo = regexp_replace(sm.motivo, '^Venta ', 'Venta de mostrador ')
from public.sale_requests sr
where sm.envio_id = sr.shipment_id
  and sm.motivo like 'Venta %'
  and sm.motivo not like 'Venta de mostrador %';

commit;
