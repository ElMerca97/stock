-- Ferretería app integration for the existing Control de Stock database.
-- Apply after supabase_migration_control_stock.sql.
-- Uses Supabase Auth for browser sessions and links those identities to the
-- existing custom-auth profiles without replacing their primary keys/passwords.
begin;

alter table public.profiles
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists telefono text not null default '';

create table if not exists public.ferreteria_settings (
  id smallint primary key default 1 check (id = 1),
  help_email text not null default '',
  help_phone text not null default '',
  help_message text not null default 'Contactá al administrador de la ferretería para recibir ayuda.',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.ferreteria_settings(id) values (1) on conflict (id) do nothing;
alter table public.ferreteria_settings enable row level security;
drop policy if exists "Ferreteria settings read" on public.ferreteria_settings;
create policy "Ferreteria settings read" on public.ferreteria_settings
  for select to authenticated using (public.is_active_user());
drop policy if exists "Ferreteria settings admin write" on public.ferreteria_settings;
create policy "Ferreteria settings admin write" on public.ferreteria_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, update on public.ferreteria_settings to authenticated;

create or replace function public.ferreteria_profile_id()
returns uuid language sql stable security definer
set search_path = public, auth, pg_temp as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid() or p.id = auth.uid()
  order by (p.auth_user_id = auth.uid()) desc nulls last
  limit 1
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public, auth, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where (p.auth_user_id = auth.uid() or p.id = auth.uid())
      and p.rol = 'admin' and p.activo
  )
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer
set search_path = public, auth, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where (p.auth_user_id = auth.uid() or p.id = auth.uid()) and p.activo
  )
$$;

create or replace function public.can_move_stock()
returns boolean language sql stable security definer
set search_path = public, auth, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where (p.auth_user_id = auth.uid() or p.id = auth.uid())
      and p.activo and (p.rol = 'admin' or p.puede_movimientos)
  )
$$;

drop policy if exists "profiles: read own or admin" on public.profiles;
create policy "profiles: read own or admin" on public.profiles
  for select using (auth_user_id = auth.uid() or id = auth.uid() or public.is_admin());

drop policy if exists "profiles: update own basic data" on public.profiles;
create policy "profiles: update own basic data" on public.profiles
  for update using (auth_user_id = auth.uid() or id = auth.uid())
  with check (
    (auth_user_id = auth.uid() or id = auth.uid())
    and rol = (select p.rol from public.profiles p where p.id = public.ferreteria_profile_id())
    and activo = (select p.activo from public.profiles p where p.id = public.ferreteria_profile_id())
    and puede_movimientos = (select p.puede_movimientos from public.profiles p where p.id = public.ferreteria_profile_id())
  );

-- Keep the last active administrator from accidentally locking everyone out.
create or replace function public.ferreteria_guard_last_admin()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if old.rol = 'admin' and old.activo then
      perform pg_advisory_xact_lock(hashtext('ferreteria_last_active_admin'));
      if (select count(*) from public.profiles p where p.rol = 'admin' and p.activo) <= 1 then
        raise exception 'Debe quedar al menos un administrador activo';
      end if;
    end if;
    return old;
  end if;
  if old.rol = 'admin' and old.activo and (new.rol <> 'admin' or not new.activo) then
    perform pg_advisory_xact_lock(hashtext('ferreteria_last_active_admin'));
    if (select count(*) from public.profiles p where p.rol = 'admin' and p.activo) <= 1 then
      raise exception 'Debe quedar al menos un administrador activo';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists ferreteria_guard_last_admin on public.profiles;
create trigger ferreteria_guard_last_admin
  before update of rol, activo on public.profiles
  for each row execute function public.ferreteria_guard_last_admin();
drop trigger if exists ferreteria_guard_last_admin_delete on public.profiles;
create trigger ferreteria_guard_last_admin_delete
  before delete on public.profiles
  for each row execute function public.ferreteria_guard_last_admin();

-- Adapt the existing stock RPC to associate movements with the linked profile id.
create or replace function public.register_stock_movement(
  p_producto_id bigint, p_tipo text, p_cantidad integer, p_motivo text, p_envio_id bigint default null
) returns public.stock_movements
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev integer; v_new integer; v_qty integer; v_mov public.stock_movements;
begin
  if not public.can_move_stock() then raise exception 'Sin permiso para registrar movimientos'; end if;
  if p_tipo = 'ajuste' and not public.is_admin() then raise exception 'Solo administradores pueden ajustar stock'; end if;
  if p_tipo not in ('entrada','salida','ajuste') then raise exception 'Tipo inválido'; end if;
  if p_cantidad < 0 then raise exception 'La cantidad no puede ser negativa'; end if;
  select stock into v_prev from public.products where id = p_producto_id and deleted_at is null for update;
  if not found then raise exception 'Producto inexistente'; end if;
  if p_tipo = 'entrada' then v_qty := p_cantidad; v_new := v_prev + p_cantidad;
  elsif p_tipo = 'salida' then v_qty := p_cantidad; v_new := v_prev - p_cantidad;
  else v_new := p_cantidad; v_qty := abs(p_cantidad - v_prev); end if;
  if v_new < 0 then raise exception 'Stock insuficiente'; end if;
  update public.products set stock = v_new, updated_at = now() where id = p_producto_id;
  insert into public.stock_movements (producto_id,tipo,cantidad,stock_anterior,stock_nuevo,usuario_id,envio_id,motivo)
  values (p_producto_id,p_tipo,v_qty,v_prev,v_new,public.ferreteria_profile_id(),p_envio_id,coalesce(p_motivo,''))
  returning * into v_mov;
  return v_mov;
end;
$$;
revoke all on function public.register_stock_movement(bigint,text,integer,text,bigint) from public, anon;
grant execute on function public.register_stock_movement(bigint,text,integer,text,bigint) to authenticated;

create or replace function public.ferreteria_create_sale(
  p_customer_id bigint,
  p_items jsonb,
  p_discount_percent numeric default 0,
  p_idempotency_key uuid default gen_random_uuid()
) returns bigint
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  v_user_id uuid := public.ferreteria_profile_id();
  v_hash text;
  v_existing public.sale_requests;
  v_customer_name text := 'Consumidor final';
  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2);
  v_sale_id bigint;
  v_item record;
  v_seen integer := 0;
  v_expected integer;
begin
  if not public.can_move_stock() then raise exception 'No tenés permiso para registrar ventas'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Agregá al menos un producto'; end if;
  if p_discount_percent < 0 or p_discount_percent > 100 then raise exception 'Descuento inválido'; end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id=p_customer_id and deleted_at is null) then
    raise exception 'El cliente no existe o está archivado';
  end if;
  if p_customer_id is not null then
    select coalesce(nullif(trim(concat_ws(' ', nombre, apellido)), ''), nullif(empresa,''), 'Cliente')
      into v_customer_name from public.customers where id=p_customer_id;
  end if;
  v_hash := md5(coalesce(p_customer_id::text,'') || '|' || p_discount_percent::text || '|' || p_items::text);
  perform pg_advisory_xact_lock(hashtext(p_idempotency_key::text));
  select * into v_existing from public.sale_requests where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_hash <> v_hash then raise exception 'Clave de operación reutilizada con otros datos'; end if;
    return v_existing.shipment_id;
  end if;
  select count(*) into v_expected from jsonb_to_recordset(p_items) as x(product_id bigint, quantity integer);
  if v_expected <> jsonb_array_length(p_items) then raise exception 'Cada línea debe tener producto y cantidad'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id bigint, quantity integer)
    where product_id is null or quantity is null or quantity <= 0
  ) then raise exception 'Producto o cantidad inválida'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id bigint, quantity integer)
    group by product_id having count(*) > 1 or min(quantity) <= 0
  ) then raise exception 'Hay líneas repetidas o cantidades inválidas'; end if;
  for v_item in
    select p.id,p.nombre,p.sku,p.precio_venta,p.stock,x.quantity
    from jsonb_to_recordset(p_items) as x(product_id bigint, quantity integer)
    join public.products p on p.id=x.product_id
    where p.deleted_at is null and p.activo
    order by p.id for update of p
  loop
    v_seen := v_seen + 1;
    if v_item.quantity <= 0 then raise exception 'Cantidad inválida'; end if;
    if v_item.stock < v_item.quantity then raise exception 'Stock insuficiente para %', v_item.nombre; end if;
    v_subtotal := v_subtotal + round(v_item.precio_venta * v_item.quantity, 2);
  end loop;
  if v_seen <> v_expected then raise exception 'Uno o más productos no existen o están inactivos'; end if;
  v_discount := round(v_subtotal * p_discount_percent / 100, 2);
  insert into public.shipments (
    cliente_id,estado,total,subtotal,descuento_porcentaje,descuento_importe,cliente_nombre_snapshot,
    created_by,stock_descontado,stock_reservado,fecha_entrega,observaciones
  ) values (
    p_customer_id,'entregado',v_subtotal-v_discount,v_subtotal,p_discount_percent,v_discount,v_customer_name,
    v_user_id,true,false,now(),'Venta registrada desde StockPro Ferretería'
  ) returning id into v_sale_id;
  for v_item in
    select p.id,p.nombre,p.sku,p.precio_venta,x.quantity
    from jsonb_to_recordset(p_items) as x(product_id bigint, quantity integer)
    join public.products p on p.id=x.product_id order by p.id
  loop
    insert into public.shipment_items (envio_id,producto_id,producto_nombre,producto_sku,cantidad,precio_unitario,subtotal)
    values (v_sale_id,v_item.id,v_item.nombre,coalesce(v_item.sku,''),v_item.quantity,v_item.precio_venta,round(v_item.precio_venta*v_item.quantity,2));
    perform public.register_stock_movement(v_item.id,'salida',v_item.quantity,'Venta StockPro',v_sale_id);
  end loop;
  insert into public.sale_requests(idempotency_key,request_hash,shipment_id) values (p_idempotency_key,v_hash,v_sale_id);
  return v_sale_id;
end;
$$;

create or replace function public.ferreteria_create_purchase(
  p_supplier_id bigint, p_notes text, p_items jsonb
) returns bigint
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_user_id uuid := public.ferreteria_profile_id(); v_purchase_id bigint; v_subtotal numeric(12,2):=0; v_item record; v_count integer:=0;
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede crear compras'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Agregá productos a la compra'; end if;
  if p_supplier_id is not null and not exists(select 1 from public.suppliers where id=p_supplier_id and is_active) then raise exception 'Proveedor no disponible'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id bigint,quantity integer,unit_cost numeric)
    where product_id is null or quantity is null or quantity <= 0 or unit_cost is null or unit_cost < 0
  ) then raise exception 'Producto, cantidad o costo inválido'; end if;
  for v_item in
    select p.id,p.nombre,p.sku,x.quantity,x.unit_cost
    from jsonb_to_recordset(p_items) as x(product_id bigint,quantity integer,unit_cost numeric)
    join public.products p on p.id=x.product_id where p.deleted_at is null and p.activo order by p.id
  loop
    if v_item.quantity <= 0 or v_item.unit_cost < 0 then raise exception 'Cantidad o costo inválido'; end if;
    v_count:=v_count+1; v_subtotal:=v_subtotal+round(v_item.quantity*v_item.unit_cost,2);
  end loop;
  if v_count <> jsonb_array_length(p_items) then raise exception 'Uno o más productos no existen o están inactivos'; end if;
  insert into public.purchase_orders(supplier_id,created_by,status,subtotal,notes)
    values(p_supplier_id,v_user_id,'draft',v_subtotal,nullif(trim(p_notes),'')) returning id into v_purchase_id;
  for v_item in
    select p.id,p.nombre,p.sku,x.quantity,x.unit_cost
    from jsonb_to_recordset(p_items) as x(product_id bigint,quantity integer,unit_cost numeric)
    join public.products p on p.id=x.product_id order by p.id
  loop
    insert into public.purchase_order_items(purchase_order_id,product_id,product_name,sku,quantity,unit_cost)
      values(v_purchase_id,v_item.id,v_item.nombre,coalesce(v_item.sku,''),v_item.quantity,v_item.unit_cost);
  end loop;
  return v_purchase_id;
end;
$$;

create or replace function public.ferreteria_receive_purchase(p_purchase_id bigint)
returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_order public.purchase_orders; v_item record;
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede recibir compras'; end if;
  select * into v_order from public.purchase_orders where id=p_purchase_id for update;
  if not found then raise exception 'Compra inexistente'; end if;
  if v_order.status <> 'draft' then raise exception 'Solo se pueden recibir compras en borrador'; end if;
  for v_item in select product_id,quantity from public.purchase_order_items where purchase_order_id=p_purchase_id order by product_id
  loop
    if v_item.product_id is null then raise exception 'Una línea de compra no tiene producto asociado'; end if;
    if v_item.quantity is null or v_item.quantity <= 0 or v_item.quantity <> trunc(v_item.quantity) then raise exception 'La compra contiene una cantidad inválida'; end if;
    perform public.register_stock_movement(v_item.product_id,'entrada',v_item.quantity::integer,'Recepción compra #'||v_order.purchase_number,null);
  end loop;
  update public.purchase_orders set status='received',received_at=now(),updated_at=now() where id=p_purchase_id;
end;
$$;

revoke all on function public.ferreteria_profile_id() from public, anon;
grant execute on function public.ferreteria_profile_id() to authenticated;
revoke all on function public.ferreteria_create_sale(bigint,jsonb,numeric,uuid) from public, anon;
grant execute on function public.ferreteria_create_sale(bigint,jsonb,numeric,uuid) to authenticated;
revoke all on function public.ferreteria_create_purchase(bigint,text,jsonb) from public, anon;
grant execute on function public.ferreteria_create_purchase(bigint,text,jsonb) to authenticated;
revoke all on function public.ferreteria_receive_purchase(bigint) from public, anon;
grant execute on function public.ferreteria_receive_purchase(bigint) to authenticated;

commit;

-- First administrator bootstrap (create user in Supabase Auth first):
-- update public.profiles p set auth_user_id=u.id
-- from auth.users u where lower(p.email)=lower('admin@tu-dominio.com')
--   and lower(u.email)=lower('admin@tu-dominio.com') and p.rol='admin' and p.activo;
