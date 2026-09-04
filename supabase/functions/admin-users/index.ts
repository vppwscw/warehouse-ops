// Edge Function: admin-users
// Lets an ADMIN create new login accounts from admin.html without ever
// exposing the service_role key to the browser.
//
// Deploy: Supabase dashboard -> Edge Functions -> new function "admin-users"
// -> paste this file -> Deploy. SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are injected automatically; no secrets to set.
//
// Editing role / department / employee_code / active on an existing account
// is done straight from admin.js with the ADMIN's own JWT (the profiles
// RLS + prevent_profile_privilege_change trigger already allow is_admin()),
// so this function only handles account creation.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = ["ADMIN", "ASSISTANT", "SUPERVISOR", "USER"];
const DEPTS = ["INB", "OUT", "INV"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1. identify the caller from their bearer token
  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await asCaller.auth.getUser();
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  // 2. caller must be an active ADMIN
  const { data: me, error: meErr } = await asCaller
    .from("profiles").select("role, active").eq("id", user.id).single();
  if (meErr || !me || me.role !== "ADMIN" || me.active === false) {
    return json({ error: "forbidden: active admin only" }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  if (body.action !== "create") return json({ error: "unknown action" }, 400);

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const fullName = String(body.full_name ?? "").trim();
  const role = String(body.role ?? "");
  const department = DEPTS.includes(String(body.department))
    ? String(body.department) : null;

  if (!email || !password || !fullName || !role) {
    return json({ error: "ต้องกรอก อีเมล / รหัสผ่าน / ชื่อ / สิทธิ์ ให้ครบ" }, 400);
  }
  if (!ROLES.includes(role)) return json({ error: "สิทธิ์ไม่ถูกต้อง" }, 400);
  if (password.length < 8) return json({ error: "รหัสผ่านต้องอย่างน้อย 8 ตัว" }, 400);
  if ((role === "SUPERVISOR" || role === "USER") && !department) {
    return json({ error: "SUPERVISOR / USER ต้องระบุแผนก" }, 400);
  }

  const admin = createClient(url, serviceKey);

  // 3. create the auth user (already confirmed — temp password from the form)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr || !created?.user) {
    return json({ error: "สร้างบัญชีไม่สำเร็จ: " + (createErr?.message ?? "unknown") }, 400);
  }

  // 4. paired profiles row; roll the auth user back if this fails
  const { error: profErr } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: fullName,
    role,
    department: role === "ADMIN" || role === "ASSISTANT" ? null : department,
    active: true,
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "บันทึกโปรไฟล์ไม่สำเร็จ: " + profErr.message }, 400);
  }

  return json({ ok: true, id: created.user.id, email });
});
