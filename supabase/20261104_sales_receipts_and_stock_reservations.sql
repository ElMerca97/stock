begin;

alter table public.products
  add column if not exists stock_reservado integer not null default 0;

alter table public.shipments
  add column if not exists stock_reservado boolean not null default false,
  add column if not exists cliente_nombre_snapshot text,
  add column if not exists receipt_business_snapshot jsonb;

alter table public.shipment_items
  add column if not exists producto_nombre text,
  add column if not exists producto_sku text;

update public.shipments s
set cliente_nombre_snapshot = coalesce(
  nullif(trim(c.nombre || ' ' || c.apellido), ''),
  'Consumidor final'
)
from public.customers c
where c.id = s.cliente_id
  and s.cliente_nombre_snapshot is null;

update public.shipments
set cliente_nombre_snapshot = 'Consumidor final'
where cliente_nombre_snapshot is null;

update public.shipment_items i
set producto_nombre = p.nombre,
    producto_sku = p.sku
from public.products p
where p.id = i.producto_id
  and (i.producto_nombre is null or i.producto_sku is null);

do $$
declare
  conflict record;
begin
  select p.nombre, p.stock, sum(i.cantidad)::integer as reservado
  into conflict
  from public.products p
  join public.shipment_items i on i.producto_id = p.id
  join public.shipments s on s.id = i.envio_id
  where s.estado = 'pendiente' and not s.stock_descontado
  group by p.id
  having sum(i.cantidad) > p.stock
  limit 1;

  if found then
    raise exception
      'No se pueden migrar reservas: el producto "%" tiene stock físico % y envíos pendientes por % unidades. Ajuste esos envíos antes de volver a ejecutar la migración.',
      conflict.nombre, conflict.stock, conflict.reservado;
  end if;
end $$;

update public.products p
set stock_reservado = coalesce((
  select sum(i.cantidad)::integer
  from public.shipment_items i
  join public.shipments s on s.id = i.envio_id
  where i.producto_id = p.id
    and s.estado = 'pendiente'
    and not s.stock_descontado
), 0);

update public.shipments
set stock_reservado = true
where estado = 'pendiente' and not stock_descontado;

alter table public.shipments
  alter column cliente_nombre_snapshot set default 'Consumidor final',
  alter column cliente_nombre_snapshot set not null;

alter table public.shipment_items
  alter column producto_nombre set not null,
  alter column producto_sku set default '',
  alter column producto_sku set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_stock_reservado_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_stock_reservado_check
      check (stock_reservado >= 0 and stock_reservado <= stock);
  end if;
end $$;

commit;
