-- Ventas, tickets y borrado de empleados. Apply AFTER supabase_migration_fixes.sql.
-- Safe to run more than once.
begin;

-- ---------------------------------------------------------------------------
-- 1) Stock guard.
--    Control de Stock's trigger rejects every stock change made with the
--    "authenticated" role, including the ones made by register_stock_movement()
--    itself (the old app connected as postgres, so it never hit this). Error:
--    "El stock solo puede modificarse mediante register_stock_movement()".
--    Now the RPC raises a transaction-local flag and the trigger only allows changes
--    made while it is on. Clients cannot set that flag through the API.
-- ---------------------------------------------------------------------------
create or replace function public.guard_stock_update() returns trigger
language plpgsql as $$
begin
  if new.stock is distinct from old.stock
     and current_setting('role', true) = 'authenticated'
     and coalesce(current_setting('app.stock_rpc', true), '') <> 'on' then
    raise exception 'El stock solo puede modificarse mediante register_stock_movement()';
  end if;
  return new;
end $$;
drop trigger if exists products_guard_stock on public.products;
create trigger products_guard_stock before update on public.products
  for each row execute function public.guard_stock_update();

create or replace function public.register_stock_movement(
  p_producto_id bigint, p_tipo text, p_cantidad integer, p_motivo text, p_envio_id bigint default null
) returns public.stock_movements
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev integer; v_new integer; v_qty integer; v_mov public.stock_movements;
begin
  if not public.can_move_stock() then raise exception 'Sin permiso para registrar movimientos'; end if;
  if p_tipo = 'ajuste' and not public.is_admin() then raise exception 'Solo administradores pueden ajustar stock'; end if;
  if p_tipo not in ('entrada','salida','ajuste') then raise exception 'Tipo inválido'; end if;
  if p_cantidad is null or p_cantidad < 0 then raise exception 'La cantidad no puede ser negativa'; end if;
  select stock into v_prev from public.products where id = p_producto_id and deleted_at is null for update;
  if not found then raise exception 'Producto inexistente'; end if;
  if p_tipo = 'entrada' then v_qty := p_cantidad; v_new := v_prev + p_cantidad;
  elsif p_tipo = 'salida' then v_qty := p_cantidad; v_new := v_prev - p_cantidad;
  else v_new := p_cantidad; v_qty := abs(p_cantidad - v_prev); end if;
  if v_new < 0 then raise exception 'Stock insuficiente'; end if;
  perform set_config('app.stock_rpc', 'on', true);
  update public.products set stock = v_new, updated_at = now() where id = p_producto_id;
  perform set_config('app.stock_rpc', '', true);
  insert into public.stock_movements (producto_id,tipo,cantidad,stock_anterior,stock_nuevo,usuario_id,envio_id,motivo)
  values (p_producto_id,p_tipo,v_qty,v_prev,v_new,public.ferreteria_profile_id(),p_envio_id,coalesce(p_motivo,''))
  returning * into v_mov;
  return v_mov;
end;
$$;
revoke all on function public.register_stock_movement(bigint,text,integer,text,bigint) from public, anon;
grant execute on function public.register_stock_movement(bigint,text,integer,text,bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Business details printed on the ticket (edited in Preferencias).
-- ---------------------------------------------------------------------------
alter table public.ferreteria_settings
  add column if not exists business_name text not null default 'Ferretería',
  add column if not exists business_rut text not null default '',
  add column if not exists business_address text not null default '',
  add column if not exists business_phone text not null default '',
  add column if not exists ticket_footer text not null default '¡Gracias por su compra!';
alter table public.shipments add column if not exists receipt_business_snapshot jsonb;

-- ---------------------------------------------------------------------------
-- 3) Sales: check AVAILABLE stock (stock - stock_reservado; reserved units belong to
--    pending shipments) and save the business details at the time of the sale, so a
--    reprinted ticket always shows what was printed originally.
-- ---------------------------------------------------------------------------
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
  v_business jsonb;
begin
  if not public.can_move_stock() then raise exception 'No tenés permiso para registrar ventas'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Agregá al menos un producto'; end if;
  if p_discount_percent is null or p_discount_percent < 0 or p_discount_percent > 100 then raise exception 'Descuento inválido'; end if;
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
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id bigint, quantity integer)
    where product_id is null or quantity is null or quantity <= 0
  ) then raise exception 'Producto o cantidad inválida'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id bigint, quantity integer)
    group by product_id having count(*) > 1
  ) then raise exception 'Hay líneas repetidas'; end if;
  for v_item in
    select p.id,p.nombre,p.precio_venta,p.stock,coalesce(p.stock_reservado,0) as reservado,x.quantity
    from jsonb_to_recordset(p_items) as x(product_id bigint, quantity integer)
    join public.products p on p.id=x.product_id
    where p.deleted_at is null and p.activo
    order by p.id for update of p
  loop
    v_seen := v_seen + 1;
    if v_item.stock - v_item.reservado < v_item.quantity then
      raise exception 'Stock insuficiente para %: disponibles %', v_item.nombre, greatest(v_item.stock - v_item.reservado, 0);
    end if;
    v_subtotal := v_subtotal + round(v_item.precio_venta * v_item.quantity, 2);
  end loop;
  if v_seen <> v_expected then raise exception 'Uno o más productos no existen o están inactivos'; end if;
  v_discount := round(v_subtotal * p_discount_percent / 100, 2);
  select jsonb_build_object('name', business_name, 'rut', business_rut, 'address', business_address,
                            'phone', business_phone, 'footer', ticket_footer)
    into v_business from public.ferreteria_settings where id = 1;
  insert into public.shipments (
    cliente_id,estado,total,subtotal,descuento_porcentaje,descuento_importe,cliente_nombre_snapshot,
    created_by,stock_descontado,stock_reservado,fecha_entrega,observaciones,receipt_business_snapshot
  ) values (
    p_customer_id,'entregado',v_subtotal-v_discount,v_subtotal,p_discount_percent,v_discount,v_customer_name,
    v_user_id,true,false,now(),'Venta registrada desde StockPro Ferretería',v_business
  ) returning id into v_sale_id;
  for v_item in
    select p.id,p.nombre,p.sku,p.precio_venta,x.quantity
    from jsonb_to_recordset(p_items) as x(product_id bigint, quantity integer)
    join public.products p on p.id=x.product_id order by p.id
  loop
    insert into public.shipment_items (envio_id,producto_id,producto_nombre,producto_sku,cantidad,precio_unitario,subtotal)
    values (v_sale_id,v_item.id,v_item.nombre,coalesce(v_item.sku,''),v_item.quantity,v_item.precio_venta,round(v_item.precio_venta*v_item.quantity,2));
    perform public.register_stock_movement(v_item.id,'salida',v_item.quantity,'Venta #' || v_sale_id,v_sale_id);
  end loop;
  insert into public.sale_requests(idempotency_key,request_hash,shipment_id) values (p_idempotency_key,v_hash,v_sale_id);
  return v_sale_id;
end;
$$;
revoke all on function public.ferreteria_create_sale(bigint,jsonb,numeric,uuid) from public, anon;
grant execute on function public.ferreteria_create_sale(bigint,jsonb,numeric,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Delete an employee without the Edge Function. Removes the profile (history keeps
--    working: references to profiles are "on delete set null"/"cascade") and the access
--    account in Supabase Auth. The last-admin trigger still applies.
-- ---------------------------------------------------------------------------
create or replace function public.ferreteria_delete_employee(p_profile_id uuid)
returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_target public.profiles;
begin
  if not public.is_admin() then raise exception 'Solo un administrador activo puede borrar usuarios'; end if;
  select * into v_target from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'El usuario ya no existe'; end if;
  if v_target.id = public.ferreteria_profile_id() or v_target.auth_user_id = auth.uid() then
    raise exception 'No podés borrar tu propia cuenta';
  end if;
  delete from public.profiles where id = p_profile_id;
  if v_target.auth_user_id is not null then
    delete from auth.users where id = v_target.auth_user_id;
  end if;
end;
$$;
revoke all on function public.ferreteria_delete_employee(uuid) from public, anon;
grant execute on function public.ferreteria_delete_employee(uuid) to authenticated;

commit;
