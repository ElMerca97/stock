-- Diagnostic only (changes nothing). Run in Supabase > SQL Editor after
-- supabase_migration_ventas.sql. Every *_ok column must be true.
select
  coalesce((select pg_get_functiondef('public.guard_stock_update()'::regprocedure) like '%app.stock_rpc%'), false) as candado_ok,
  coalesce((select bool_and(pg_get_functiondef(p.oid) like '%app.stock_rpc%')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'register_stock_movement'), false) as movimiento_ok,
  exists (select 1 from pg_proc where proname = 'ferreteria_delete_employee') as borrar_empleado_ok,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'ferreteria_settings' and column_name = 'business_rut') as datos_ticket_ok,
  (select string_agg(tgname || ' -> ' || tgfoid::regproc::text, ', ')
     from pg_trigger where tgrelid = 'public.products'::regclass and not tgisinternal) as triggers_products;
