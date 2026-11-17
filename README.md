# StockPro · Ferretería

Aplicación web para administrar productos, ventas, compras, clientes, proveedores y empleados en el proyecto existente de Control de Stock.

## Preparación

1. En SQL Editor aplicá `supabase_migration_ferreteria_complete.sql` , después `supabase_migration_fixes.sql` y por último `supabase_migration_ventas.sql` (caja, tickets y borrado de empleados). La migración anterior `supabase_migration_control_stock.sql` ya fue aplicada; si vas a usar otra base, aplicá primero esa.
2. Creá el primer usuario en **Authentication → Users** con correo y contraseña. Cambiá el correo de `supabase_bootstrap_admin.sql` por el mismo correo y ejecutá ese archivo para vincularlo como administrador.
3. Desplegá la función segura para crear empleados:

   ```sh
   npx supabase login
   npx supabase link --project-ref TU_PROJECT_REF
   npx supabase functions deploy admin-create-employee
   ```

   La función usa `SUPABASE_SERVICE_ROLE_KEY` en el entorno seguro de Supabase; nunca la agregues a `.env.local` ni al frontend.
4. Copiá `.env.example` como `.env.local` y configurá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores del mismo proyecto.
5. Instalá e iniciá la app:

   ```sh
   npm install
   npm run dev
   ```

## Supabase y seguridad

La app usa Supabase Auth y solo expone la clave publicable/anon en el navegador. Los perfiles existentes de Control de Stock se vinculan sin cambiar sus IDs ni sus contraseñas antiguas. Nunca pongas la `service_role` key ni secretos privados en una variable `VITE_*`. Las operaciones de venta y recepción de compras se realizan mediante funciones SQL atómicas y verificadas.

## DGI

La emisión fiscal DGI queda pendiente: requiere proveedor/API y credenciales de backend. No se realizan llamadas ficticias.
