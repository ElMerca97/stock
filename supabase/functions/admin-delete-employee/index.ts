import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método no permitido" }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
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
    return reply({ error: "Solo un administrador activo puede borrar usuarios" }, 403);

  let body: { employeeId?: string };
  try { body = await req.json(); } catch { return reply({ error: "Solicitud inválida" }, 400); }
  const employeeId = String(body.employeeId ?? "").trim();
  if (!employeeId) return reply({ error: "Falta el usuario a borrar" }, 400);

  const { data: target, error: targetError } = await admin.from("profiles")
    .select("id,email,rol,activo,auth_user_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (targetError) return reply({ error: targetError.message }, 500);
  if (!target) return reply({ error: "El usuario ya no existe" }, 404);
  if (target.id === caller.id || target.auth_user_id === authData.user.id)
    return reply({ error: "No podés borrar tu propia cuenta" }, 400);

  if (target.rol === "admin" && target.activo) {
    const { count, error: countError } = await admin.from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("rol", "admin")
      .eq("activo", true);
    if (countError) return reply({ error: countError.message }, 500);
    if ((count ?? 0) <= 1) return reply({ error: "Debe quedar al menos un administrador activo" }, 409);
  }

  // Suspend first so a partial failure cannot leave the legacy login usable.
  const { error: suspendError } = await admin.from("profiles").update({ activo: false }).eq("id", target.id);
  if (suspendError) return reply({ error: suspendError.message }, 500);

  if (target.auth_user_id) {
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(target.auth_user_id);
    if (authDeleteError) return reply({ error: `El perfil quedó suspendido, pero no se pudo borrar la cuenta Auth: ${authDeleteError.message}` }, 500);
  }

  const { error: profileDeleteError } = await admin.from("profiles").delete().eq("id", target.id);
  if (profileDeleteError) return reply({ error: `La cuenta quedó suspendida, pero no se pudo borrar el perfil: ${profileDeleteError.message}` }, 500);
  return reply({ ok: true });
});

function reply(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
