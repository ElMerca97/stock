import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método no permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "Sesión requerida" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply({ error: "Falta configurar la función" }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return reply({ error: "Sesión inválida" }, 401);

  const { data: caller } = await admin.from("profiles")
    .select("id,rol,activo,auth_user_id")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (!caller || caller.rol !== "admin" || !caller.activo)
    return reply({ error: "Solo un administrador activo puede crear empleados" }, 403);

  let body: { email?: string; password?: string; nombre?: string; apellido?: string };
  try { body = await req.json(); } catch { return reply({ error: "Solicitud inválida" }, 400); }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const nombre = String(body.nombre ?? "").trim();
  const apellido = String(body.apellido ?? "").trim();
  if (!email || !nombre || password.length < 10)
    return reply({ error: "Ingresá nombre, correo y una contraseña temporal de al menos 10 caracteres" }, 400);

  const { data: existingProfile, error: profileLookupError } = await admin.from("profiles")
    .select("id,rol,activo,auth_user_id")
    // Escape LIKE wildcards: "_" or "%" in an email must not match other addresses.
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .maybeSingle();
  if (profileLookupError) return reply({ error: profileLookupError.message }, 500);
  if (existingProfile?.auth_user_id)
    return reply({ error: "Ese correo ya está vinculado a una cuenta de acceso" }, 409);
  if (existingProfile?.rol === "admin")
    return reply({ error: "Ese correo pertenece a un administrador; no se puede agregar como empleado" }, 409);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `${nombre} ${apellido}`.trim() },
  });
  if (createError || !created.user) return reply({ error: createError?.message ?? "No se pudo crear la cuenta" }, 400);

  const result = existingProfile
    ? await admin.from("profiles").update({ auth_user_id: created.user.id, nombre, apellido, activo: true })
        .eq("id", existingProfile.id).is("auth_user_id", null).select("id")
    : await admin.from("profiles").insert({
        id: created.user.id,
        auth_user_id: created.user.id,
        nombre,
        apellido,
        email,
        // This profile is authenticated by Supabase Auth, not the legacy scrypt login.
        password_hash: "supabase-auth-only",
        rol: "empleado",
        puede_movimientos: false,
        activo: true,
      });

  // If the profile got linked by someone else in the meantime, the update touches 0 rows:
  // do not leave an orphan Auth account behind.
  const linkedNothing = existingProfile && !result.error && !(result.data as unknown[] | null)?.length;
  if (result.error || linkedNothing) {
    await admin.auth.admin.deleteUser(created.user.id);
    return result.error
      ? reply({ error: result.error.message }, 500)
      : reply({ error: "Ese correo ya fue vinculado a otra cuenta de acceso" }, 409);
  }
  return reply({ ok: true, employeeId: existingProfile?.id ?? created.user.id });
});

function reply(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
