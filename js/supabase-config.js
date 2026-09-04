// Shared Supabase connection config — used by both mobile.js and admin.js

// GitHub Pages can't send X-Frame-Options / CSP frame-ancestors headers, so
// bust out of any frame to blunt clickjacking. Runs before anything renders.
if (window.top !== window.self) { try { window.top.location = window.self.location.href; } catch (e) { document.documentElement.innerHTML = ''; } }

const SUPABASE_URL = "https://dkudeyxccztrfngqfthj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hCU6bd7U6tl-EI082Z1n4Q_LDWJKUay";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
