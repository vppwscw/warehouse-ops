// Edge Function: admin-users
// Lets an ADMIN create accounts and reset passwords from admin.html without
// ever exposing the service_role key to the browser.
//
// Deploy: Supabase dashboard -> Edge Functions -> function "admin-users"
// -> paste this file -> Deploy. Settings -> Verify JWT = OFF (this function
// runs its own admin check and the CORS preflight must get through).
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected.
//
// Editing role / department / employee_code / active is done straight from
// admin.js with the ADMIN's own JWT (RLS + the profiles trigger allow
// is_admin()). This function covers the two ops that need service_role:
//   { action: "create",       email, password, full_name, role, department }
//   { action: "set-password", user_id, password }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Only the production site may use this from a browser. Other origins get an
// ACAO they don't match, so the browser blocks the response. (Non-browser
// callers ignore CORS but still have to pass the active-ADMIN check below.)
const ALLOWED_ORIGINS = ["https://vppwscw.github.io"];

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const ROLES = ["ADMIN", "ASSISTANT", "SUPERVISOR", "USER"];
const DEPTS = ["INB", "OUT", "INV"];

Deno.serve(async (req) => {
  const CORS = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // identify the caller from their bearer token
  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await asCaller.auth.getUser();
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  // caller must be an active ADMIN
  const { data: me, error: meErr } = await asCaller
    .from("profiles").select("role, active").eq("id", user.id).single();
  if (meErr || !me || me.role !== "ADMIN" || me.active === false) {
    return json({ error: "forbidden: active admin only" }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  // service_role only touches auth.users (GoTrue admin API)
  const admin = createClient(url, serviceKey);

  if (body.action === "set-password") {
    const userId = String(body.user_id ?? "");
    const password = String(body.password ?? "");
    if (!userId) return json({ error: "user_id required" }, 400);
    if (password.length < 8) return json({ error: "password must be >= 8 chars" }, 400);

    // Don't let one ADMIN reset another ADMIN's password here — a compromised
    // admin account could otherwise lock every other admin out. Resetting
    // another admin is still possible from the Supabase dashboard.
    if (userId !== user.id) {
      const { data: target } = await admin.from("profiles").select("role").eq("id", userId).single();
      if (target?.role === "ADMIN") {
        return json({ error: "reset another admin's password from the Supabase dashboard only" }, 403);
      }
    }

    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return json({ error: "reset failed: " + error.message }, 400);
    return json({ ok: true });
  }

  if (body.action === "create") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.full_name ?? "").trim();
    const role = String(body.role ?? "");
    const department = DEPTS.includes(String(body.department))
      ? String(body.department) : null;

    if (!email || !password || !fullName || !role) {
      return json({ error: "missing fields" }, 400);
    }
    if (!ROLES.includes(role)) return json({ error: "bad role" }, 400);
    if (password.length < 8) return json({ error: "password must be >= 8 chars" }, 400);
    if ((role === "SUPERVISOR" || role === "USER") && !department) {
      return json({ error: "SUPERVISOR / USER needs a department" }, 400);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createErr || !created?.user) {
      return json({ error: "create failed: " + (createErr?.message ?? "unknown") }, 400);
    }

    // profiles row written with the caller's ADMIN JWT (authenticated has
    // INSERT; RLS check is is_admin()) — this project never granted DML to
    // service_role. Roll the auth user back if the insert fails.
    const { error: profErr } = await asCaller.from("profiles").insert({
      id: created.user.id,
      full_name: fullName,
      role,
      department: role === "ADMIN" || role === "ASSISTANT" ? null : department,
      active: true,
    });
    if (profErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "profile insert failed: " + profErr.message }, 400);
    }

    return json({ ok: true, id: created.user.id, email });
  }

  return json({ error: "unknown action" }, 400);
});
