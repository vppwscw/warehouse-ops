// Shared Supabase connection config — used by both mobile.js and admin.js
const SUPABASE_URL = "https://dkudeyxccztrfngqfthj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hCU6bd7U6tl-EI082Z1n4Q_LDWJKUay";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
