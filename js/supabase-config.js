// Shared Supabase connection config — used by both mobile.js and admin.js

// GitHub Pages can't send X-Frame-Options / CSP frame-ancestors headers, so
// bust out of any frame to blunt clickjacking. Runs before anything renders.
// Exception: local phone-sim preview frame (localhost only, never on GitHub Pages).
const PHONE_SIM_DEV = location.hostname === 'localhost' && window.name === 'phone-sim';
if (window.top !== window.self && !PHONE_SIM_DEV) { try { window.top.location = window.self.location.href; } catch (e) { document.documentElement.innerHTML = ''; } }

const SUPABASE_URL = "https://dkudeyxccztrfngqfthj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hCU6bd7U6tl-EI082Z1n4Q_LDWJKUay";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Employee-code login (same rule as vpp-5s): trim + uppercase, 3-20 of [0-9A-Za-z-],
// auth email = lower(code) + '@staff.internal'. Returns '' when the format is bad.
const EMP_CODE_RE = /^[0-9A-Za-z-]{3,20}$/;
function normalizeEmpCode(raw){
  const c = String(raw == null ? '' : raw).trim().toUpperCase();
  return EMP_CODE_RE.test(c) ? c : '';
}
function empCodeToEmail(raw){
  const c = normalizeEmpCode(raw);
  return c ? c.toLowerCase() + '@staff.internal' : '';
}
