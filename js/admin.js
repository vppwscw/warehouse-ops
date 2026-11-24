// ===================== SUPABASE INIT =====================

// Departments are per-warehouse data now (public.departments, PK
// (warehouse, code) since 2026-09-14) — คลังใครคลังมัน: the same code can
// exist in A and B as two unrelated rows (own name/color/active), and adding
// one to a warehouse never creates or touches a row in the other.
// DEPT_BY_WH[wh] = {keys:[active codes...], plain:{code:name}, color:{code:hex}}.
// These seed a fallback (both warehouses = INB/OUT/INV) until loadDepartments() runs.
// keep this palette in step with the SQL that seeds departments.color on production.
function seedDeptBucket(){ return { keys:['INB','OUT','INV'],
  plain:{ INB:'INBOUND', OUT:'OUTBOUND', INV:'INVENTORY' },
  color:{ INB:'#9E5F1E', OUT:'#276F4E', INV:'#5B4A97' } }; }
let DEPT_BY_WH = { A: seedDeptBucket(), B: seedDeptBucket() };
let DEPT_ROWS  = [];   // full rows incl. inactive, each with .warehouse — for the management view
async function loadDepartments(){
  try{
    const { data, error } = await sb.from('departments').select('*').order('warehouse').order('sort').order('code');
    if (error) throw error;
    if (data && data.length){
      DEPT_ROWS = data;
      const byWh = { A:{keys:[],plain:{},color:{}}, B:{keys:[],plain:{},color:{}} };
      data.forEach(d=>{
        const b = byWh[d.warehouse] || (byWh[d.warehouse] = {keys:[],plain:{},color:{}});
        b.plain[d.code] = d.name;
        b.color[d.code] = d.color || '#6B7280';
        if (d.active) b.keys.push(d.code);
      });
      DEPT_BY_WH = byWh;
    }
  }catch(e){ /* keep the fallback */ }
}
// active codes for one warehouse, or the union of both when wh is falsy/'ALL'
// (used for "ทุกคลัง" contexts — filter chips, side cards, scope line).
function deptKeysFor(wh){
  if (wh && wh !== 'ALL') return (DEPT_BY_WH[wh] && DEPT_BY_WH[wh].keys) || [];
  return [...new Set(WH_KEYS.flatMap(w => (DEPT_BY_WH[w] && DEPT_BY_WH[w].keys) || []))];
}
// resolve a department code's name/color for a specific warehouse; without a
// warehouse (older call sites), fall back to whichever warehouse has that code.
function deptLookup(code, wh){
  if (wh && DEPT_BY_WH[wh] && DEPT_BY_WH[wh].plain[code] !== undefined){
    return { name: DEPT_BY_WH[wh].plain[code], color: DEPT_BY_WH[wh].color[code] || '#6B7280' };
  }
  for (const w of WH_KEYS){
    if (DEPT_BY_WH[w] && DEPT_BY_WH[w].plain[code] !== undefined){
      return { name: DEPT_BY_WH[w].plain[code], color: DEPT_BY_WH[w].color[code] || '#6B7280' };
    }
  }
  return { name: code, color: '#6B7280' };
}
const deptColor = (c, wh) => deptLookup(c, wh).color;
const deptName  = (c, wh) => deptLookup(c, wh).name;
function deptBadge(c, wh){
  const { name, color } = deptLookup(c, wh);
  return `<span class="badge" style="color:${esc(color)};background:${esc(color)}1f"><span class="dot" style="background:${esc(color)}"></span>${esc(name)}</span>`;
}

// ---- WCAG contrast guard for ADMIN-picked department colours ----
// deptBadge() renders text in `color` on a background of `color` tinted to
// ~12% opacity (hex suffix "1f") over the page's white card. A colour that
// looks fine as a swatch can still fail 4.5:1 once tinted that light — so
// check against the *actual rendered* background, not the raw swatch.
function hexToRgb(hex){
  const h = hex.replace('#','');
  return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
}
function relLuminance([r,g,b]){
  const f = v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
  const [rl,gl,bl] = [f(r),f(g),f(b)];
  return 0.2126*rl + 0.7152*gl + 0.0722*bl;
}
function contrastRatio(hexA, hexB){
  const l1 = relLuminance(hexToRgb(hexA)), l2 = relLuminance(hexToRgb(hexB));
  const [hi,lo] = l1>l2 ? [l1,l2] : [l2,l1];
  return (hi+0.05)/(lo+0.05);
}
function tintOverWhite(hex, alpha){       // alpha 0..1, mimics CSS "<hex>1f" over #FFFFFF
  const [r,g,b] = hexToRgb(hex).map(v => Math.round(v*alpha + 255*(1-alpha)));
  return `#${[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')}`;
}
function deptColorRatio(hex){
  return contrastRatio(hex, tintOverWhite(hex, 0x1f/255));
}
function deptColorHint(hex){
  if (!/^#[0-9a-fA-F]{6}$/.test(hex||'')) return { ok:true, html:'' };
  const ratio = deptColorRatio(hex);
  const ok = ratio >= 4.5;
  const html = ok
    ? `<span class="cc-ok">✓ ${ratio.toFixed(1)}:1</span>`
    : `<span class="cc-fail">⚠ ${ratio.toFixed(1)}:1 — อ่านยาก เข้มขึ้นอีก</span>`;
  return { ok, ratio, html };
}
function refreshColorHint(inputEl, hintEl){
  if (!inputEl || !hintEl) return true;
  const { ok, html } = deptColorHint(inputEl.value);
  hintEl.innerHTML = html;
  return ok;
}
const WH_KEYS = ['A','B'];
const WH_PLAIN = { A:'คลัง A', B:'คลัง B' };
const STATUS_LABEL = { pending:'รออนุมัติ', approved:'อนุมัติแล้ว', rejected:'ไม่อนุมัติ', open:'กำลังทำงาน' };
const ADMIN_USERS_FN = SUPABASE_URL + '/functions/v1/admin-users';
// LV model: positions(id,name,lv,active,sort) loaded after login. role is only
// used to tell ADMIN apart; every other permission reads the position's LV.
let positions = [];
const posOf    = p => (p && p.position_id != null) ? positions.find(x=>x.id===p.position_id) : null;
const isAdminP = p => !!p && p.role === 'ADMIN';
const lvOf     = p => { const x = posOf(p); return x ? x.lv : 0; };
const posLabel = p => isAdminP(p) ? 'Admin' : (posOf(p) ? `${posOf(p).name} (LV${posOf(p).lv})` : '–');

// Every value that ends up inside an innerHTML template must go through esc() —
// full_name, employee_code, task names, crew names and the whole jobs.details
// blob are user-controlled and were an XSS vector before this.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => Number(v) || 0;

const FALLBACK_TASKS = {
  INB: [
    {id:'inb_unload',      label:'โหลดรถลงจากตู้คอนเทนเนอร์',  unit:'containers', unitLabel:'ตู้', vehiclesPerContainer:56},
    {id:'inb_palletdown',  label:'ยกรถลงจากแท่นพาเลท',        unit:'vehicles',   unitLabel:'คัน'},
    {id:'inb_putaway',     label:'เก็บรถเข้าที่จอด',           unit:'vehicles',   unitLabel:'คัน'},
  ],
  OUT: [
    {id:'out_precheck',  label:'หารถ + เขียนชื่อร้าน',       unit:'vehicles', unitLabel:'คัน'},
    {id:'out_push',      label:'เข็นรถออกจากคลัง',           unit:'vehicles', unitLabel:'คัน'},
    {id:'out_qccheck',   label:'โหลดรถขึ้นรถขนส่ง',          unit:'vehicles', unitLabel:'คัน', hasIssue:true},
  ],
  INV: [
    {id:'inv_packfree_onvehicle', label:'แพ็คของแถมติดรถ',  unit:'pieces', unitLabel:'ชิ้น'},
    {id:'inv_packfree_set',       label:'จัดชุดของแถม',      unit:'pieces', unitLabel:'ชิ้น'},
    {id:'inv_packship',           label:'แพ็คของส่งออก',     unit:'boxes',  unitLabel:'กล่อง'},
  ],
};
let TASKS = { INB:[...FALLBACK_TASKS.INB], OUT:[...FALLBACK_TASKS.OUT], INV:[...FALLBACK_TASKS.INV] };
const ALL_TASKS = () => Object.keys(TASKS).flatMap(d => (TASKS[d]||[]).map(t=>({...t, dept:d})));
const taskById = id => ALL_TASKS().find(t=>t.id===id);

const ICONS = {
  dash:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="9" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="14" width="8" height="7" rx="1.5"/></svg>',
  list:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.4" fill="currentColor" stroke="none"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15.8 14.2c2.7.4 4.7 2.5 4.7 5.8"/></svg>',
  lock:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>',
  gear:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  queue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4.5h6a1 1 0 0 1 1 1V7H8V5.5a1 1 0 0 1 1-1z"/><rect x="4" y="6" width="16" height="15" rx="2"/><path d="M8.5 13.5l2.2 2.2 4.8-4.8"/></svg>',
  box:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z"/><path d="M3 7.5 12 12l9-4.5"/><path d="M12 12v9"/></svg>',
  matrix:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="6" height="6" rx="1.4"/><rect x="14.5" y="3.5" width="6" height="6" rx="1.4"/><rect x="3.5" y="14.5" width="6" height="6" rx="1.4"/><rect x="14.5" y="14.5" width="6" height="6" rx="1.4"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>',
  id:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/></svg>',
  logout:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/></svg>',
  chevron:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 7l-5 5 5 5"/></svg>',
};

let profile = null, currentUser = null;
let jobs = [], roster = [], users = [], allEmployees = [], taskList = [], scopes = [];
let realtimeChannel = null;
let dateRange = 'today', deptFilter = 'ALL', whFilter = 'ALL', searchTerm = '', activeView = 'dashboard';
let dateFrom = null, dateTo = null;   // ISO yyyy-mm-dd, used when dateRange === 'custom'

// ---------- URL hash deep-link (2026-09-17) ----------
// view + คลัง + ฝั่ง + ช่วงวัน ผูกกับ #hash ไว้ — refresh/แชร์ลิงก์แล้วไม่เสีย
// state. ใช้ replaceState (ไม่ pushState) ผู้ใช้กด back แล้วไม่โดนสแปม
// ประวัติทีละคลิกฟิลเตอร์. ไม่รวม dateFrom/dateTo (custom range) — กรณีนั้น
// เก็บแค่ session ปัจจุบัน ยอมรับได้เพราะซับซ้อนเกินไปสำหรับ deep-link
function readHashState(){
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const out = {};
  if (p.has('view')) out.view = p.get('view');
  if (p.has('wh'))   out.wh   = p.get('wh');
  if (p.has('dept')) out.dept = p.get('dept');
  if (p.has('range') && p.get('range') !== 'custom') out.range = p.get('range');
  return out;
}
function writeHashState(){
  const p = new URLSearchParams();
  p.set('view', activeView);
  if (whFilter   !== 'ALL') p.set('wh', whFilter);
  if (deptFilter !== 'ALL') p.set('dept', deptFilter);
  if (dateRange  !== 'custom') p.set('range', dateRange);
  const hash = '#' + p.toString();
  if (location.hash !== hash) history.replaceState(null, '', hash);
}
let firstLoad = true;    // true until the first successful data load (drives the skeleton)
let loadError = null;    // set when the initial jobs load fails (drives the error card)

// Only ADMIN edits/approves in this app; LV3+ see ERP read-only
const isReadOnly = () => !profile || profile.role !== 'ADMIN';
// Only ADMIN opens the "ผู้ใช้งานระบบ" view (user 2026-11-24); others get their own profile.
const canManageUsers = () => !!profile && isAdminP(profile);
const isUserAdminFull = () => !!profile && profile.role === 'ADMIN';
// ADMIN and LV5 see both warehouses; LV4 sees own warehouse + extra scope
const seesAllWh = () => !!profile && (isAdminP(profile) || lvOf(profile) >= 5);

// ---------- date helpers (Asia/Bangkok) ----------
function nowBkk(){ return new Date(new Date().toLocaleString('en-US', {timeZone:'Asia/Bangkok'})); }
function todayISO(){ return nowBkk().toLocaleDateString('sv-SE'); }
function daysAgoISO(n){ return new Date(nowBkk().getTime() - n*86400000).toLocaleDateString('sv-SE'); }

// ---------- auth ----------
function mapAuthError(err){
  const msg = (err && err.message) || '';
  if (/invalid login credentials/i.test(msg)) return 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง';
  if (/email not confirmed/i.test(msg)) return 'บัญชียังไม่ได้เปิดใช้งาน — ติดต่อแอดมิน';
  return 'เข้าสู่ระบบไม่สำเร็จ: ' + (msg || 'unknown error');
}
function mapDbError(err){
  if (!err) return 'unknown error';
  if (err.code === '42501' || /row-level security/i.test(err.message||'')) return 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้';
  if (err.code === '23505' && /employee_code/.test(err.message||'')) return 'รหัสพนักงานนี้ถูกใช้ไปแล้ว';
  if (err.code === '23505') return 'ข้อมูลซ้ำกับที่มีอยู่แล้ว';
  return err.message || err.code || 'unknown error';
}
function showScreen(id){
  const ls = document.getElementById('loginScreen');   // login lives at auth/login now
  if (ls) ls.hidden = id!=='login';
  document.getElementById('deniedScreen').hidden = id!=='denied';
  document.getElementById('appShell').hidden = id!=='app';
}

// Login lives on its own page (auth/login). Bounce there, optionally with a reason code.
function goLogin(code){
  location.replace('auth/login' + (code ? '?e=' + code : ''));
}
document.getElementById('logoutBtn').addEventListener('click', doLogout);
document.getElementById('deniedLogoutBtn').addEventListener('click', doLogout);

// Inline password modal — replaces window.prompt()/alert(), which some browsers
// and embedded webviews silently block. `onSubmit(pw)` returns an error string
// to show in place, or null on success (then the modal closes itself).
// opts.force: blocking mode (first-login change) — no Esc/cancel, the cancel
// button becomes "ออกจากระบบ"; opts.onDone() runs after success.
function askNewPassword(title, onSubmit, opts){
  const force = !!(opts && opts.force);
  const ov   = document.getElementById('pwModal');
  const a    = document.getElementById('pwNew');
  const b    = document.getElementById('pwNew2');
  const hint = document.getElementById('pwModalHint');
  const ok   = document.getElementById('pwConfirm');
  const no   = document.getElementById('pwCancel');
  document.getElementById('pwModalTitle').textContent = title || 'เปลี่ยนรหัสผ่าน';
  a.value = ''; b.value = ''; hint.textContent = ''; ok.disabled = false;
  const cancel0 = no.textContent;
  if (force) no.textContent = 'ออกจากระบบ';
  ov.hidden = false;
  setTimeout(()=>a.focus(), 30);

  function close(){ ov.hidden = true; no.textContent = cancel0; ok.removeEventListener('click', submit); no.removeEventListener('click', onCancel); ov.removeEventListener('keydown', onKey); }
  function onCancel(){ close(); if (force) doLogout(); }
  function onKey(e){ if (e.key === 'Enter') submit(); else if (e.key === 'Escape' && !force) close(); }
  async function submit(){
    const p = a.value, p2 = b.value;
    if (p.length < 8){ hint.textContent = 'รหัสผ่านต้องอย่างน้อย 8 ตัว'; return; }
    if (p !== p2){ hint.textContent = 'รหัสผ่านสองครั้งไม่ตรงกัน'; return; }
    ok.disabled = true; hint.textContent = 'กำลังบันทึก...';
    const err = onSubmit ? await onSubmit(p) : null;
    if (err){ ok.disabled = false; hint.textContent = err; return; }
    hint.textContent = 'สำเร็จ';
    if (force){ close(); if (opts.onDone) opts.onDone(); return; }
    setTimeout(close, 700);
  }
  ok.addEventListener('click', submit);
  no.addEventListener('click', onCancel);
  ov.addEventListener('keydown', onKey);
}

// First login after admin create/reset: must set own password before using the app.
function forcePasswordChange(){
  return new Promise((resolve)=>{
    askNewPassword('ตั้งรหัสผ่านใหม่', async (np)=>{
      const { error } = await sb.auth.updateUser({ password: np, data: { must_change_password: false } });
      return error ? ('ไม่สำเร็จ: ' + (error.message || error)) : null;
    }, { force:true, onDone: ()=>resolve(true) });
  });
}

function changeOwnPassword(){
  askNewPassword('เปลี่ยนรหัสผ่านของฉัน', async (np)=>{
    const { error } = await sb.auth.updateUser({ password: np });
    return error ? ('ไม่สำเร็จ: ' + (error.message || error)) : null;
  });
}

// --- profile modal: the only account UI a non-ADMIN / non-ASSISTANT sees ---
function openProfileModal(){
  if (!profile) return;
  document.getElementById('pmName').textContent  = profile.full_name || '–';
  document.getElementById('pmCode').textContent  = profile.employee_code || '–';
  document.getElementById('pmRole').textContent  = posLabel(profile);
  document.getElementById('pmHint').textContent = '';
  document.getElementById('profileModal').hidden = false;
}
document.getElementById('changePwBtn').addEventListener('click', ()=>{
  if (!currentUser) return;
  openProfileModal();
});

// Non-blocking toast — replaces alert(), which webviews and the
// "prevent additional dialogs" checkbox both suppress.
function toast(msg, kind){
  let host = document.getElementById('toastHost');
  if (!host){
    host = document.createElement('div'); host.id = 'toastHost';
    host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + (kind === 'ok' ? 'toast-ok' : 'toast-err');
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(()=>{ el.classList.add('leaving'); setTimeout(()=>el.remove(), 130); }, kind === 'ok' ? 2600 : 4400);
}

// In-page confirm — replaces confirm(). Resolves true/false.
function confirmModal(text, opts){
  opts = opts || {};
  return new Promise(resolve=>{
    const ov  = document.getElementById('confirmModal');
    const yes = document.getElementById('confirmYes');
    const no  = document.getElementById('confirmNo');
    document.getElementById('confirmText').textContent = text;
    document.getElementById('confirmTitle').textContent = opts.title || 'ยืนยัน';
    yes.textContent = opts.yes || 'ตกลง';
    yes.className = 'btn-sm ' + (opts.danger ? 'danger' : 'primary');
    ov.hidden = false;
    setTimeout(()=>no.focus(), 30);
    function done(v){ ov.hidden = true; yes.removeEventListener('click', onYes); no.removeEventListener('click', onNo); ov.removeEventListener('keydown', onKey); resolve(v); }
    function onYes(){ done(true); }
    function onNo(){ done(false); }
    function onKey(e){ if (e.key === 'Escape') done(false); else if (e.key === 'Enter') done(true); }
    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
    ov.addEventListener('keydown', onKey);
  });
}

async function doLogout(){
  try { sessionStorage.removeItem('gw-app'); } catch (e) {}  // next person gets device routing again
  try { await sb.auth.signOut(); } catch (e) {}
  profile = null; currentUser = null; jobs = []; roster = [];
  if (realtimeChannel){ sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  goLogin();
}

// Which app(s) this account may open. An explicit profiles.apps wins; otherwise
// the LV default. 'erp' = /erp, 'mobile' = /app.
function allowedApps(p){
  if (p && Array.isArray(p.apps) && p.apps.length) return p.apps;
  if (!p) return [];
  if (isAdminP(p)) return ['erp','mobile'];
  if (lvOf(p) >= 3) return ['erp','mobile'];
  return ['mobile'];
}

// positions table (RLS: any active user reads; ADMIN also sees inactive ones)
async function loadPositions(){
  try{
    const { data, error } = await sb.from('positions').select('id,name,lv,active,sort').order('sort');
    if (error) throw error;
    positions = data || [];
  }catch(e){ /* keep previous list */ }
}

async function afterLogin(user){
  currentUser = user;
  // '*' already carries position_id + warehouse
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (error || !data){
    try { await sb.auth.signOut(); } catch (e) {}
    goLogin('notfound');
    return;
  }
  profile = data;
  await loadPositions();
  renderNav();
  if (profile.active === false){
    try { await sb.auth.signOut(); } catch (e) {}
    goLogin('inactive');
    return;
  }
  if (!allowedApps(profile).includes('erp')){
    if (allowedApps(profile).includes('mobile') && window.gwSwitchTo){
      window.gwSwitchTo('mobile');
      return;
    }
    try { await sb.auth.signOut(); } catch (e) {}
    goLogin('noaccess');
    return;
  }
  if (user.user_metadata && user.user_metadata.must_change_password){
    await forcePasswordChange();
  }
  showScreen('app');
  await loadDepartments();
  buildDeptChips();
  await loadTasksFromDb();
  wireRealtime();
  const hashed = readHashState();
  if (hashed.wh)    whFilter   = hashed.wh;
  if (hashed.dept)  deptFilter = hashed.dept;
  if (hashed.range) dateRange  = hashed.range;
  const validView = hashed.view && Object.prototype.hasOwnProperty.call(VIEW_FILTERS, hashed.view);
  goView(validView ? hashed.view : 'dashboard');
  await refreshAll();
}

// ---------- tasks from DB (fallback to hardcoded) ----------
async function loadTasksFromDb(){
  try{
    const { data, error } = await sb.from('tasks').select('*').eq('active', true);
    if (error) throw error;
    if (data && data.length){
      const byDept = {};
      data.forEach(t=>{
        (byDept[t.department] = byDept[t.department] || []).push({ id:t.id, label:t.name, department:t.department,
          unit: t.unit_label ? 'custom' : 'vehicles', unitLabel: t.unit_label || 'จำนวน' });
      });
      Object.keys(byDept).forEach(d=>{ if (byDept[d].length) TASKS[d] = byDept[d]; });
    }
  }catch(e){ /* keep fallback */ }
}

// ---------- nav ----------
// Primary nav — shown in the sidebar (desktop / tablet rail) and the mobile
// bottom tab bar. `short` is the bottom-bar label.
const NAV = [
  {id:'dashboard',  label:'ภาพรวม',      short:'ภาพรวม', icon:'dash',  title:'ภาพรวม', sub:'สรุปผลงานคลังสินค้าตามช่วงเวลาที่เลือก'},
  {id:'details',    label:'งานทั้งหมด',   short:'งาน',    icon:'list',  title:'งานทั้งหมด', sub:'รายการงานทุกชิ้นตามตัวกรองที่เลือก'},
  {id:'tasks',      label:'ชนิดงาน',      short:'ชนิด',   icon:'box',   title:'ชนิดงาน', sub:'ชนิดงานทั้งหมดของแต่ละฝั่ง — ปิดใช้งานหรือลบถาวรได้'},
  {id:'employees',  label:'พนักงาน',      short:'คน',    icon:'users', title:'พนักงาน', sub:'สรุปจำนวนงานที่ทำของพนักงานแต่ละคน'},
  {id:'skillmatrix', label:'Skill Matrix', short:'สกิล',  icon:'matrix', title:'Skill Matrix', sub:'ใครทำงานชนิดไหนได้บ้าง — แต้มนับจากจำนวนครั้งที่เคยทำสำเร็จ'},
];
// Secondary — reached via the gear icon in the header, not the main nav.
const SECONDARY = [
  {id:'users', label:'ผู้ใช้งานระบบ', icon:'lock', title:'ผู้ใช้งานระบบ', sub:'รายชื่อบัญชีผู้ใช้งาน'},
];
const ALL_NAV = [...NAV, ...SECONDARY];

// adminOnly items (ตำแหน่ง & LV) only show for ADMIN — rebuilt on login/logout
function renderNav(){
  const items = NAV.filter(n => !n.adminOnly || isUserAdminFull());
  // non-admin sees only โปรไฟล์ของฉัน + ออกจากระบบ in the account menu
  const adm = canManageUsers();
  document.getElementById('gearBtn').hidden = !adm;
  document.getElementById('exportCsvBtn').hidden = !adm;
  document.getElementById('navList').innerHTML = items.map(n=>`
  <button type="button" class="navbtn" data-view="${n.id}" aria-current="${n.id===activeView}">
    <span class="nav-ic">${ICONS[n.icon]}</span><span class="nav-tx">${n.label}</span>
  </button>`).join('');
  document.getElementById('botNav').innerHTML = items.map(n=>`
  <button type="button" class="botbtn" data-view="${n.id}" aria-current="${n.id===activeView}">
    ${ICONS[n.icon]}<span>${n.short}</span>
  </button>`).join('');
}
renderNav();
document.getElementById('deniedLockIcon').innerHTML = ICONS.lock;

// account actions — give each a glyph + label, then dock the row into the
// sidebar bottom on tablet/desktop, or leave it in the page header on phones
// (where the sidebar is replaced by the bottom tab bar).
document.getElementById('gearBtn').innerHTML      = ICONS.gear     + '<span class="act-tx">ผู้ใช้งานระบบ</span>';
document.getElementById('exportCsvBtn').innerHTML = ICONS.download + '<span class="act-tx">ส่งออก CSV</span>';
document.getElementById('changePwBtn').innerHTML  = ICONS.id       + '<span class="act-tx">โปรไฟล์ของฉัน</span>';
document.getElementById('logoutBtn').innerHTML    = ICONS.logout   + '<span class="act-tx">ออกจากระบบ</span>';
(function(){
  const acts = document.getElementById('acctActions');
  const side = document.querySelector('.sidebar');
  const sync = document.getElementById('syncBox');
  const head = document.querySelector('.pagehead');
  const mq   = window.matchMedia('(min-width:640px)');
  const place = () => { mq.matches ? side.insertBefore(acts, sync) : head.appendChild(acts); };
  place();
  mq.addEventListener('change', place);
})();

// ---- sidebar collapse (rail) ----
// A manual toggle ≥960px (choice saved); below 960 the rail is forced and the
// toggle is hidden; below 640 the sidebar is gone entirely (bottom tab bar).
(function(){
  const shell  = document.querySelector('.shell');
  const toggle = document.getElementById('railToggle');
  if (!shell || !toggle) return;
  toggle.innerHTML = ICONS.chevron + '<span class="nav-tx">ย่อเมนู</span>';
  const forceMq = window.matchMedia('(max-width:960px)');
  // locked collapsed (user 2026-11-24); expands as an overlay on hover/focus (CSS)
  const apply = () => { shell.classList.add('rail'); toggle.hidden = true; };
  forceMq.addEventListener('change', apply);
  apply();
})();

// which filter controls make sense on each view (others are hidden)
const VIEW_FILTERS = {
  dashboard: ['range','wh','dept','search'],
  details:   ['range','wh','dept'],   // this view has its own search box in the table toolbar
  queue:     ['wh','dept','search'],
  tasks:     ['wh','dept','search'],
  positions: [],
  employees: ['wh','dept','search'],
  skillmatrix: ['wh','dept','search'],
  users:     [],   // users view has its own search + tabs
};
function syncFilterbar(){
  const show = VIEW_FILTERS[activeView] || ['range','wh','dept','search'];
  const set = (elId, key) => { const el = document.getElementById(elId); if (el) el.hidden = !show.includes(key); };
  set('rangeGroup','range'); set('whGroup','wh'); set('deptGroup','dept'); set('searchGroup','search');
  renderWhChips();     // may hide #whGroup further (single-warehouse user)
  buildDeptChips();
  syncDatePick();
  const bar = document.getElementById('filterbar');
  if (bar){
    const anyVisible = ['rangeGroup','whGroup','deptGroup','searchGroup']
      .some(id => { const el = document.getElementById(id); return el && !el.hidden; });
    bar.hidden = !anyVisible;
    bar.classList.toggle('filterbar--search-only',
      show.length === 1 && show[0] === 'search');
  }
}

// ADMIN + LV5 see every warehouse; others see home warehouse + extra (staff_scope) warehouses
function myWhList(){
  if (seesAllWh()) return WH_KEYS.slice();
  const uid = currentUser && currentUser.id;
  const set = new Set(scopes.filter(s=>s.profile_id===uid).map(s=>s.warehouse));
  if (profile && profile.warehouse) set.add(profile.warehouse);
  return [...set].sort();
}
function buildDeptChips(){
  const el = document.getElementById('deptSelect');
  if (!el) return;
  const keys = deptKeysFor(whFilter);
  if (deptFilter !== 'ALL' && !keys.includes(deptFilter)) deptFilter = 'ALL';
  el.innerHTML = [['ALL','ทั้งหมด'], ...keys.map(d=>[d, deptName(d, whFilter)])].map(([v,label])=>
    `<option value="${esc(v)}" ${v===deptFilter?'selected':''}>${esc(label)}</option>`
  ).join('');
}
function renderWhChips(){
  const el = document.getElementById('whSelect');
  const grp = document.getElementById('whGroup');
  if (!el || !grp) return;
  const isAdm = seesAllWh();
  const mine = myWhList();
  let opts;
  if (isAdm) opts = [['ALL','ทั้งหมด'], ...WH_KEYS.map(w=>[w, w])];
  else if (mine.length >= 2) opts = mine.map(w=>[w, w]);   // toggle A/B, no "ทั้งหมด"
  else opts = null;                                        // 0–1 warehouse -> no filter

  if (!opts){
    grp.hidden = true;
    whFilter = mine[0] || 'ALL';
    return;
  }
  const valid = opts.map(o=>o[0]);
  if (!valid.includes(whFilter)) whFilter = valid[0];
  el.innerHTML = opts.map(([v,label])=>
    `<option value="${esc(v)}" ${v===whFilter?'selected':''}>${esc(label)}</option>`
  ).join('');
}

function syncDatePick(){
  const custom = dateRange === 'custom';
  const btn = document.getElementById('calBtn');
  if (btn){
    btn.setAttribute('aria-pressed', custom);
    btn.title = custom ? ('ช่วง: ' + rangeLabel()) : 'เลือกช่วงวันที่';
  }
}
function applyCustomRange(){
  let f = document.getElementById('dateFromInput').value;
  let t = document.getElementById('dateToInput').value;
  if (!f && !t){ toast('เลือกวันที่อย่างน้อย 1 ช่อง'); return; }
  if (!f) f = t; if (!t) t = f;
  if (f > t){ [f, t] = [t, f]; }
  dateFrom = f; dateTo = t; dateRange = 'custom';
  document.getElementById('datePop').hidden = true;
  document.querySelectorAll('#rangeChips .chip').forEach(c=>c.setAttribute('aria-pressed','false'));
  syncDatePick(); render();
}

function goView(id){
  if (id === 'queue') id = 'dashboard';   // approval queue removed 2026-11-24
  if (id === 'users' && !canManageUsers()){ openProfileModal(); return; }
  if (id === 'positions'){ id = isUserAdminFull() ? 'users' : 'dashboard'; if (id==='users') setTimeout(openPosModal, 0); }
  activeView = id;
  syncFilterbar();
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current', b.dataset.view===id));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+id).classList.add('active');
  const n = ALL_NAV.find(x=>x.id===id) || NAV[0];
  document.getElementById('pageTitle').textContent = n.title;
  document.getElementById('pageSub').textContent = n.sub;
  if (id==='users') Promise.all([refreshUsers(), refreshScopes()]).then(renderUsersTable);
  if (id==='tasks') refreshTasksAdmin().then(render);
  if (id==='employees') refreshEmployeesAll().then(render);
  render();
}

document.addEventListener('change', e=>{
  if (e.target.id === 'whSelect'){ whFilter = e.target.value; buildDeptChips(); render(); return; }
  if (e.target.id === 'deptSelect'){ deptFilter = e.target.value; render(); return; }
});

// keyboard support for the sortable table headers (mouse-only before —
// clickable <th> with no key handler is a keyboard-nav dead end)
document.addEventListener('keydown', e=>{
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const th = e.target.closest('[data-dt-sort],[data-task-sort],[data-emp-sort]');
  if (!th) return;
  e.preventDefault();
  th.click();
});

document.addEventListener('input', e=>{
  if (e.target.id === 'ndColor'){ refreshColorHint(e.target, document.getElementById('ndColorHint')); return; }
  const key = e.target.dataset && e.target.dataset.deptColor;
  if (key){ refreshColorHint(e.target, document.querySelector(`[data-dept-color-hint="${key}"]`)); return; }
});

document.addEventListener('click', e=>{
  if (e.target.closest('#retryBtn')){ refreshAll(); return; }
  if (e.target.closest('[data-clear-filters]')){ clearFilters(); return; }

  if (e.target.closest('#gearBtn')){
    if (canManageUsers()) goView('users'); else openProfileModal();
    return;
  }
  if (e.target.closest('#pmClose')){ document.getElementById('profileModal').hidden = true; return; }
  if (e.target.closest('#pmChangePwBtn')){
    document.getElementById('profileModal').hidden = true;
    changeOwnPassword();
    return;
  }

  const empRow = e.target.closest('#employeesTable tbody tr[data-emp]');
  if (empRow){ openEmpPanel(empRow.dataset.emp); return; }
  if (e.target.closest('#empClose') || e.target.id === 'empModal'){ closeEmpModal(); return; }
  const erChip = e.target.closest('#emRange .chip');
  if (erChip){
    empPanel.range = erChip.dataset.er;
    document.querySelectorAll('#emRange .chip').forEach(c=>c.setAttribute('aria-pressed', String(c===erChip)));
    renderEmpPanel(); return;
  }
  const etChip = e.target.closest('#emTabs .chip');
  if (etChip){
    empPanel.tab = etChip.dataset.et;
    document.querySelectorAll('#emTabs .chip').forEach(c=>c.setAttribute('aria-pressed', String(c===etChip)));
    renderEmpTable(); return;
  }

  const navBtn = e.target.closest('[data-view]');
  if (navBtn){ goView(navBtn.dataset.view); return; }

  const rangeChip = e.target.closest('#rangeChips [data-range]');
  if (rangeChip){
    document.querySelectorAll('#rangeChips .chip').forEach(c=>c.setAttribute('aria-pressed','false'));
    rangeChip.setAttribute('aria-pressed','true');
    dateRange = rangeChip.dataset.range; dateFrom = dateTo = null;
    syncDatePick(); render(); return;
  }
  if (e.target.closest('#calBtn')){
    const pop = document.getElementById('datePop');
    pop.hidden = !pop.hidden;
    if (!pop.hidden){
      document.getElementById('dateFromInput').value = dateFrom || todayISO();
      document.getElementById('dateToInput').value   = dateTo   || todayISO();
    }
    return;
  }
  if (e.target.closest('#dateApplyBtn')){ applyCustomRange(); return; }
  if (e.target.closest('#dateClearBtn')){
    dateFrom = dateTo = null; dateRange = 'all';
    document.getElementById('datePop').hidden = true;
    document.querySelectorAll('#rangeChips .chip').forEach(c=>c.setAttribute('aria-pressed', c.dataset.range==='all'));
    syncDatePick(); render(); return;
  }
  // click outside the date popover closes it
  if (!e.target.closest('#datePick')){
    const pop = document.getElementById('datePop');
    if (pop && !pop.hidden) pop.hidden = true;
  }
  if (e.target.closest('#actionStripBtn')){ goView('queue'); return; }
  if (e.target.closest('#exportCsvBtn')){ exportJobsCsv(); return; }
  if (e.target.closest('#exportEmpCsvBtn')){ exportEmployeesXlsx(); return; }

  const batchBtn = e.target.closest('[data-approve-dept]');
  if (batchBtn){ approveDept(batchBtn.dataset.approveDept); return; }

  const approveBtn = e.target.closest('[data-approve-job]');
  if (approveBtn){
    const card = approveBtn.closest('.q-card');
    if (card) card.classList.add('q-done');       // brief ✓ until the queue re-renders
    setJobStatus(approveBtn.dataset.approveJob, 'approved');
    return;
  }
  const rejectBtn = e.target.closest('[data-reject-job]');
  if (rejectBtn){ setJobStatus(rejectBtn.dataset.rejectJob, 'rejected'); return; }
  const delJobBtn = e.target.closest('[data-del-job]');
  if (delJobBtn){ deleteJob(delJobBtn.dataset.delJob); return; }

  const taskToggleBtn = e.target.closest('[data-task-toggle]');
  if (taskToggleBtn){ toggleTaskActive(taskToggleBtn.dataset.taskToggle, taskToggleBtn.dataset.next === 'true'); return; }
  const taskDelBtn = e.target.closest('[data-task-del]');
  if (taskDelBtn){ deleteTask(taskDelBtn.dataset.taskDel); return; }

  if (e.target.closest('#toggleAddDeptBtn')){ const f = document.getElementById('addDeptForm'); f.hidden = !f.hidden;
    if (!f.hidden) refreshColorHint(document.getElementById('ndColor'), document.getElementById('ndColorHint'));
    return; }
  if (e.target.closest('#cancelAddDeptBtn')){ document.getElementById('addDeptForm').hidden = true; return; }
  if (e.target.closest('#createDeptBtn')){ createDeptFromForm(); return; }
  const deptSaveBtn = e.target.closest('[data-dept-save]');
  if (deptSaveBtn){ saveDeptRow(deptSaveBtn.dataset.deptSave); return; }
  const deptToggleBtn = e.target.closest('[data-dept-toggle]');
  if (deptToggleBtn){ toggleDeptActive(deptToggleBtn.dataset.deptToggle, deptToggleBtn.dataset.next === 'true'); return; }
  const deptDelBtn = e.target.closest('[data-dept-del]');
  if (deptDelBtn){ deleteDept(deptDelBtn.dataset.deptDel); return; }

  const ustat = e.target.closest('[data-ustatus]');
  if (ustat){ usersStatus = ustat.dataset.ustatus; renderUsersTable(); return; }
  const uwh = e.target.closest('[data-uwh]');
  if (uwh){ usersWh = uwh.dataset.uwh; usersDept = 'ALL'; renderUsersTable(); return; }
  const udept = e.target.closest('[data-udept]');
  if (udept){ usersDept = udept.dataset.udept; renderUsersTable(); return; }
  if (e.target.closest('[data-close-umodal]')){ closeUserModal(); return; }
  if (e.target.id === 'userModal'){ closeUserModal(); return; }
  if (e.target.id === 'addUserModal' || e.target.closest('#nuClose')){ document.getElementById('addUserModal').hidden = true; return; }
  if (e.target.id === 'posModal' || e.target.closest('#posClose')){ document.getElementById('posModal').hidden = true; return; }
  if (e.target.closest('#openPosBtn')){ openPosModal(); return; }
  if (e.target.closest('#openAddUserBtn')){ if (isUserAdminFull()){ document.getElementById('addUserModal').hidden = false; const c = document.getElementById('nuCode'); if (c) c.focus(); } return; }
  const openUser = e.target.closest('[data-open-user]');
  if (openUser){ openUserModal(openUser.dataset.openUser); return; }

  const kebab = e.target.closest('[data-kebab]');
  document.querySelectorAll('.uc-menu:not([hidden])').forEach(m=>{
    if (!kebab || m !== kebab.nextElementSibling){ m.hidden = true; const b = m.previousElementSibling; if (b) b.setAttribute('aria-expanded','false'); }
  });
  if (kebab){ const m = kebab.nextElementSibling; m.hidden = !m.hidden; kebab.setAttribute('aria-expanded', String(!m.hidden)); return; }
  const saveUserBtn = e.target.closest('[data-save-user]');
  if (saveUserBtn){ saveUserRow(saveUserBtn.dataset.saveUser); return; }
  const toggleUserBtn = e.target.closest('[data-toggle-user]');
  if (toggleUserBtn){ toggleUserActive(toggleUserBtn.dataset.toggleUser, toggleUserBtn.dataset.nextActive === 'true'); return; }
  const resetPassBtn = e.target.closest('[data-reset-pass]');
  if (resetPassBtn){ resetUserPassword(resetPassBtn.dataset.resetPass); return; }
  const delUserBtn = e.target.closest('[data-del-user]');
  if (delUserBtn){ deleteUserAccount(delUserBtn.dataset.delUser); return; }
  if (e.target.closest('#toggleAddUserBtn')){ const f = document.getElementById('addUserForm'); f.hidden = !f.hidden; return; }
  if (e.target.closest('#cancelAddUserBtn')){ document.getElementById('addUserForm').hidden = true; return; }
  if (e.target.closest('#nuGenPassBtn')){ generatedPw = genTempPassword(); document.getElementById('nuPass').value = generatedPw; document.getElementById('addUserHint').textContent = 'สร้างรหัสชั่วคราวแล้ว — จดไว้ก่อนกด สร้างบัญชี'; return; }
  if (e.target.closest('#createUserBtn')){ createUserFromForm(); return; }
  if (e.target.closest('#bulkUserBtn')){ openBulkModal(); return; }
  if (e.target.closest('#buClose')){ document.getElementById('bulkModal').hidden = true; return; }
  if (e.target.closest('#buSubmit')){ bulkCreateUsers(); return; }

  const empToggle = e.target.closest('[data-emp-toggle]');
  if (empToggle){ toggleEmpActive(empToggle.dataset.empToggle, empToggle.dataset.next === 'true'); return; }
  const empDel = e.target.closest('[data-emp-del]');
  if (empDel){ deleteEmp(empDel.dataset.empDel); return; }
  if (e.target.closest('#toggleAddEmpBtn')){ const f = document.getElementById('addEmpForm'); f.hidden = !f.hidden; return; }
  if (e.target.closest('#cancelAddEmpBtn')){ document.getElementById('addEmpForm').hidden = true; return; }
  if (e.target.closest('#createEmpBtn')){ createEmpFromForm(); return; }

  // ----- งานทั้งหมด data table -----
  const dtSortTh = e.target.closest('#dtHead [data-dt-sort]');
  if (dtSortTh){
    const k = dtSortTh.dataset.dtSort;
    if (dtState.sortKey === k) dtState.sortDir = dtState.sortDir==='asc' ? 'desc' : 'asc';
    else { dtState.sortKey = k; dtState.sortDir = 'asc'; }
    render(); refocusSort('#dtHead', 'data-dt-sort', k); return;
  }

  const taskSortTh = e.target.closest('#tasksHead [data-task-sort]');
  if (taskSortTh){
    const k = taskSortTh.dataset.taskSort;
    toggleSort(taskSort, k); renderTasksAdmin(); refocusSort('#tasksHead', 'data-task-sort', k); return;
  }
  const empSortTh = e.target.closest('#employeesHead [data-emp-sort]');
  if (empSortTh){
    const k = empSortTh.dataset.empSort;
    toggleSort(empSort, k); render(); refocusSort('#employeesHead', 'data-emp-sort', k); return;
  }

  const dtPg = e.target.closest('[data-dt-page]');
  if (dtPg){
    const m = dtPg.dataset.dtPage;
    if (m==='first') dtState.page = 0;
    else if (m==='prev') dtState.page -= 1;
    else if (m==='next') dtState.page += 1;
    else if (m==='last') dtState.page = 1e9;   // clamped in renderDetailsTable
    render(); return;
  }
  if (e.target.closest('#dtStatusBtn')){ toggleDtPop('dtStatusPop','dtStatusBtn'); return; }
  if (e.target.closest('#dtColsBtn')){ buildDtColsPop(); toggleDtPop('dtColsPop','dtColsBtn'); return; }
  if (e.target.closest('#dtSearchClear')){
    dtState.q = ''; dtState.page = 0;
    document.getElementById('dtSearch').value = '';
    document.getElementById('dtSearchClear').hidden = true;
    render(); return;
  }
  if (!e.target.closest('#view-details .dt-pop-wrap')){
    document.querySelectorAll('#view-details .dt-pop').forEach(p=>{ p.hidden = true; });
    document.querySelectorAll('#dtStatusBtn,#dtColsBtn').forEach(b=>b.setAttribute('aria-expanded','false'));
  }
});
{
  const us = document.getElementById('usersSearch');
  if (us) us.addEventListener('input', e=>{ usersQ = e.target.value.trim().toLowerCase(); renderUsersTable(); });
  document.addEventListener('keydown', e=>{
    const t = e.target;
    if (e.key === 'Enter' && t && t.matches && t.matches('tr[data-open-user]')){ openUserModal(t.dataset.openUser); return; }
    if (e.key !== 'Escape') return;
    const open = id => { const m = document.getElementById(id); return m && !m.hidden; };
    if (open('confirmModal') || open('pwModal')) return;   // those handle their own Esc
    if (open('posModal')){ document.getElementById('posModal').hidden = true; return; }
    if (open('addUserModal')){ document.getElementById('addUserModal').hidden = true; return; }
    if (open('userModal')) closeUserModal();
  });
}
document.getElementById('searchInput').addEventListener('input', e=>{ searchTerm = e.target.value.trim().toLowerCase(); render(); });

document.getElementById('dtSearch').addEventListener('input', e=>{
  dtState.q = e.target.value.trim().toLowerCase();
  dtState.page = 0;
  document.getElementById('dtSearchClear').hidden = !dtState.q;
  render();
});
document.addEventListener('change', e=>{
  const st = e.target.closest('[data-dt-status]');
  if (st){
    const s = st.dataset.dtStatus;
    dtState.statuses = st.checked
      ? [...dtState.statuses, s]
      : dtState.statuses.filter(x=>x!==s);
    dtState.page = 0; render(); return;
  }
  const cl = e.target.closest('[data-dt-col]');
  if (cl){
    if (cl.checked) dtState.hidden.delete(cl.dataset.dtCol);
    else dtState.hidden.add(cl.dataset.dtCol);
    render(); return;
  }
  if (e.target.id === 'dtPageSize'){
    dtState.size = Number(e.target.value) || 25;
    dtState.page = 0; render(); return;
  }
});

// ---------- data grouping (jobs table stores one row per employee) ----------
function groupJobs(rows){
  const map = new Map();
  rows.forEach(r=>{
    const key = r.job_group_id
      ? 'g:'+r.job_group_id
      : [r.department, r.task_id, (r.details&&r.details.date)||'', (r.details&&r.details.start)||'', (r.created_at||'').slice(0,16)].join('|');
    if (!map.has(key)) map.set(key, { ...r, crewNames: new Set(), rowIds: [] });
    const g = map.get(key);
    g.rowIds.push(r.id);          // every DB row in this group — approve/reject must hit them all
    if (r.employee_name) g.crewNames.add(r.employee_name);
  });
  return [...map.values()].map(g=>({...g, crew: (g.details && g.details.crew && g.details.crew.length) ? g.details.crew : [...g.crewNames]}));
}

// ---------- filtering ----------
function matchSearch(j){
  if (!searchTerm) return true;
  const task = taskById(j.task_id);
  return (((task?task.label:'') + ' ' + (j.crew||[]).join(' ')).toLowerCase()).includes(searchTerm);
}
// warehouse + department chip filters — every jobs list runs through this
function matchScope(j){
  if (whFilter!=='ALL' && j.warehouse!==whFilter) return false;
  if (deptFilter!=='ALL' && j.department!==deptFilter) return false;
  return true;
}
function filteredJobs(){
  const todayStr = todayISO();
  let fromStr = null, toStr = null;
  if (dateRange==='today') fromStr = todayStr;
  else if (dateRange==='week') fromStr = daysAgoISO(6);
  else if (dateRange==='month') fromStr = daysAgoISO(29);
  else if (dateRange==='custom'){ fromStr = dateFrom; toStr = dateTo; }

  return jobs.filter(j=>{
    const d = j.details || {};
    if (fromStr && d.date < fromStr) return false;
    if (toStr && d.date > toStr) return false;
    if (dateRange==='today' && d.date !== todayStr) return false;
    if (!matchScope(j)) return false;
    return matchSearch(j);
  });
}

// ---------- CSV export (current filter) ----------
function csvCell(v){
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportJobsCsv(){
  const rows = filteredJobs();
  const head = ['วันที่','คลัง','ฝั่ง','งาน','ทีม','เริ่ม','จบ','นาที','จำนวน','หน่วย','มีปัญหา','สถานะ'];
  const lines = [head.join(',')];
  rows.forEach(j=>{
    const d = j.details || {};
    const task = taskById(j.task_id);
    const unit = task ? (task.unit==='containers' ? 'ตู้/คัน' : (task.unitLabel||'')) : '';
    const qty = task && task.unit==='containers'
      ? (num(d.vehicles) || num(d.containers)*(task.vehiclesPerContainer||56))
      : num(d.qty);
    lines.push([
      d.date||'', WH_PLAIN[j.warehouse]||j.warehouse||'',
      deptName(j.department, j.warehouse),
      task ? task.label : (j.task_id||''),
      (j.crew||[]).join(' / '),
      d.start||'', d.end||'', (d.mins==null?'':num(d.mins)),
      qty, unit,
      (task && task.hasIssue && d.hasIssue) ? num(d.issueCount) : '',
      STATUS_LABEL[j.status||'approved'] || j.status || '',
    ].map(csvCell).join(','));
  });
  const scope = deptFilter==='ALL' ? 'ทุกฝั่ง' : deptName(deptFilter, whFilter);
  const whScope = whFilter==='ALL' ? 'ทุกคลัง' : (WH_PLAIN[whFilter]||whFilter);
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const rangeTag = dateRange==='custom' ? `${dateFrom}_ถึง_${dateTo}` : dateRange;
  a.download = `warehouse-jobs_${whScope}_${scope}_${rangeTag}_${todayISO()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast(`ส่งออก ${rows.length} รายการ`, 'ok');
}

// Per-person export (พนักงาน view) — real Excel workbook, one SHEET per
// (คลัง × แผนก) so the split people asked for ("แยกแผนกเป็นชีทๆ") is a real
// worksheet tab, not just a sorted column — a flat CSV can't express that.
// Uses SheetJS (loaded from jsdelivr in admin.html) purely client-side.
function safeSheetName(name, used){
  let base = String(name).replace(/[:\\/?*\[\]]/g, '').trim().slice(0, 28) || 'Sheet';
  let n = base, i = 2;
  while (used.has(n)){ n = `${base}_${i}`; i++; }
  used.add(n);
  return n;
}
// One person's totals over a set of jobs: minutes are never split (the whole
// crew is present the full duration) but output quantity is divided by crew
// size per job — same convention as the employee detail panel's empJobShare.
function personOutputTotals(name, list){
  const bag = {};   // unit label -> qty (this person's share)
  let mins = 0, n = 0;
  list.forEach(j=>{
    if (!(j.crew||[]).includes(name)) return;
    n++;
    const d = j.details || {};
    if (d.mins != null) mins += num(d.mins);
    const t = taskById(j.task_id);
    if (!t) return;
    const cw = empCrew(j);
    if (t.unit === 'containers'){
      const veh = num(d.vehicles) || num(d.containers) * (t.vehiclesPerContainer || 56);
      bag['คัน'] = (bag['คัน'] || 0) + veh / cw;
    } else {
      const label = t.unitLabel || 'จำนวน';
      bag[label] = (bag[label] || 0) + num(d.qty) / cw;
    }
  });
  const outputTxt = Object.entries(bag).map(([u, q]) => `${Math.round(q * 10) / 10} ${u}`).join(' / ') || '-';
  return { n, mins, avgMins: n ? Math.round(mins / n) : 0, outputTxt };
}
// One row per (person, job) — "งานอะไรบ้าง" — sorted date then start time.
function personJobRows(name, list){
  return list.filter(j => (j.crew||[]).includes(name))
    .sort((a,b) => {
      const da = (a.details&&a.details.date)||'', db = (b.details&&b.details.date)||'';
      if (da !== db) return da.localeCompare(db);
      return ((a.details&&a.details.start)||'').localeCompare((b.details&&b.details.start)||'');
    })
    .map(j => {
      const d = j.details || {}; const t = taskById(j.task_id); const cw = empCrew(j);
      const status = j.status || 'approved';
      return [name, fmtThaiDate(d.date)||d.date||'', t ? t.label : (j.task_id||''),
        d.start||'-', d.end||'-', d.mins==null?'-':num(d.mins),
        empJobShare(t, d, cw), STATUS_LABEL[status] || status];
    });
}
function exportEmployeesXlsx(){
  const closed = filteredJobs();
  const people = peopleInScope();
  if (!people.length){ toast('ไม่มีพนักงานในขอบเขตนี้'); return; }
  if (typeof XLSX === 'undefined'){ toast('โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ — เช็คอินเทอร์เน็ตแล้วลองใหม่'); return; }

  const groups = new Map();   // "warehouse|department" -> {summary:[], byPerson:[{name, jobRows}]}
  people.forEach(r=>{
    const key = (r.warehouse||'-') + '|' + (r.department||'-');
    if (!groups.has(key)) groups.set(key, { summary:[], people:[] });
    const g = groups.get(key);
    const rangeStats = personOutputTotals(r.name, closed);
    const totalStats = personOutputTotals(r.name, jobs);
    g.summary.push([
      r.name, WH_PLAIN[r.warehouse]||r.warehouse||'', deptName(r.department, r.warehouse),
      rangeStats.n, totalStats.n,
      rangeStats.mins, rangeStats.avgMins,
      rangeStats.outputTxt,
    ]);
    g.people.push({ name: r.name, jobRows: personJobRows(r.name, closed) });
  });

  const summaryHead = ['ชื่อ','คลัง','ฝั่ง','งานในช่วงที่เลือก','งานสะสมทั้งหมด','นาทีรวม (ช่วงที่เลือก)','เฉลี่ยนาที/งาน','จำนวนที่ทำได้ (ช่วงที่เลือก)'];
  const detailHead = ['ชื่อ','วันที่','งานที่ทำ','เริ่ม','จบ','นาที','ผลลัพธ์ (ส่วนของคนนี้)','สถานะ'];
  const wb = XLSX.utils.book_new();
  const usedNames = new Set();
  [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).forEach(([key, g])=>{
    const [wh, dept] = key.split('|');
    const label = `${WH_PLAIN[wh]||wh} ${deptName(dept, wh)}`;
    const aoa = [summaryHead, ...g.summary, [], ['รายละเอียดงานรายบุคคล (ตามตัวกรองช่วงเวลาปัจจุบัน)'], detailHead];
    g.people.forEach(p => { p.jobRows.forEach(row => aoa.push(row)); });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{wch:22},{wch:10},{wch:16},{wch:18},{wch:18},{wch:20},{wch:16},{wch:26}];
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(label, usedNames));
  });

  const scope = deptFilter==='ALL' ? 'ทุกฝั่ง' : deptName(deptFilter, whFilter);
  const whScope = whFilter==='ALL' ? 'ทุกคลัง' : (WH_PLAIN[whFilter]||whFilter);
  const rangeTag = dateRange==='custom' ? `${dateFrom}_ถึง_${dateTo}` : dateRange;
  XLSX.writeFile(wb, `warehouse-employees_${whScope}_${scope}_${rangeTag}_${todayISO()}.xlsx`);
  toast(`ส่งออก ${people.length} คน (${groups.size} ชีท)`, 'ok');
}

function formatResult(details, task){
  if (!task || !details) return '–';
  if (task.unit==='containers') return `${num(details.containers)} ตู้ / ${num(details.vehicles) || (num(details.containers)*(task.vehiclesPerContainer||56))} คัน`;
  let s = `${num(details.qty)} ${task.unitLabel}`;
  if (task.hasIssue && details.hasIssue) s += ` · มีปัญหา ${num(details.issueCount)} คัน`;
  return s;
}

// ---------- renderers ----------
// The `employees` roster table is the legacy list; USER/SUPERVISOR jobs log
// `employee_name` = the auth profile's full_name, which need not be on that
// roster. So "people in scope" is the union of roster names and names that
// actually appear in job crews — same approach as the mobile history/matrix.
function peopleInScope(){
  const inDept = d => deptFilter==='ALL' || d===deptFilter;
  const inWh = w => whFilter==='ALL' || w===whFilter;
  const byName = new Map(); // name -> {department, warehouse} (roster wins, else first job's)
  roster.forEach(r=>{ if (inDept(r.department) && inWh(r.warehouse)) byName.set(r.name, {department:r.department, warehouse:r.warehouse}); });
  jobs.forEach(j=>{
    if (!inDept(j.department) || !inWh(j.warehouse)) return;
    (j.crew||[]).forEach(n=>{ if (!byName.has(n)) byName.set(n, {department:j.department, warehouse:j.warehouse}); });
  });
  return [...byName.entries()]
    .map(([name, info])=>({name, department:info.department, warehouse:info.warehouse}))
    .sort((a,b)=>(a.warehouse||'').localeCompare(b.warehouse||'') || (a.department||'').localeCompare(b.department||'') || a.name.localeCompare(b.name,'th'));
}

// ---- dashboard: month names + age formatting (Asia/Bangkok) ----
const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function fmtThaiDate(iso){
  if (!iso) return '';
  const [y,m,d] = iso.split('-').map(Number);
  return `${d} ${TH_MONTHS[m-1]}`;
}
function rangeLabel(){
  if (dateRange==='today'){ const n = nowBkk(); return `วันนี้ (${n.getDate()} ${TH_MONTHS[n.getMonth()]})`; }
  if (dateRange==='week') return '7 วันล่าสุด';
  if (dateRange==='month') return '30 วันล่าสุด';
  if (dateRange==='custom') return dateFrom===dateTo ? fmtThaiDate(dateFrom) : `${fmtThaiDate(dateFrom)} – ${fmtThaiDate(dateTo)}`;
  return 'ทั้งหมด';
}
function ageText(iso){
  if (!iso) return '–';
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return 'ไม่ถึงชั่วโมง';
  if (h < 24) return h + ' ชม.';
  return Math.floor(h / 24) + ' วัน';
}

// Amber strip = the ADMIN's one "act now". Counts pending jobs in the current
// department scope but ignores the date filter — a job stuck pending for days
// should still show even while looking at "วันนี้".
function renderActionStrip(){
  const el = document.getElementById('actionStrip');
  if (!el) return;
  el.hidden = true; return;   // approval queue removed 2026-11-24
  const pend = jobs.filter(j => (j.status||'approved')==='pending' && matchScope(j));
  el.hidden = false;
  if (!pend.length){
    el.className = 'action-strip ok';
    el.innerHTML = `<span class="as-text">✓ ไม่มีงานค้างอนุมัติ</span>`;
    return;
  }
  const oldest = pend.reduce((m,j)=> (j.created_at||'') && (j.created_at < m) ? j.created_at : m, pend[0].created_at || '');
  el.className = 'action-strip';
  el.innerHTML = `<span class="as-text">⚠ มีงานรออนุมัติ ${pend.length} งาน · เก่าสุดค้าง ${esc(ageText(oldest))}</span>
    <button type="button" class="as-cta" id="actionStripBtn">ดูรายการ</button>`;
}

// Plain-Thai restatement of the active filters, so the scope is never ambiguous.
function renderScopeLine(closed){
  const el = document.getElementById('scopeLine');
  if (!el) return;
  const depts = deptFilter==='ALL' ? deptKeysFor(whFilter) : [deptFilter];
  const dots = depts.map(d=>`<span class="legend-dot" style="background:var(--${d.toLowerCase()})"></span>`).join('');
  const deptTxt = deptFilter==='ALL' ? 'ทุกฝั่ง' : deptName(deptFilter, whFilter);
  const whTxt = whFilter==='ALL' ? 'ทุกคลัง' : WH_PLAIN[whFilter];
  let s = `${dots} กำลังดู · <b>${esc(whTxt)}</b> · <b>${esc(deptTxt)}</b> · <b>${esc(rangeLabel())}</b> · ${closed.length} งาน`;
  if (searchTerm) s += ` · ค้นหา "${esc(searchTerm)}"`;
  el.innerHTML = s;
}

// ---- dashboard: KPI + SVG charts (dependency-free) ----

// Jobs of the previous equal-length window, same scope+search — powers the
// KPI delta chips. Returns null for the "ทั้งหมด" range (nothing to compare).
function prevPeriodJobs(){
  const dayMs = 86400000;
  let curFrom, curTo;
  if (dateRange==='today'){ curFrom = curTo = todayISO(); }
  else if (dateRange==='week'){ curFrom = daysAgoISO(6); curTo = todayISO(); }
  else if (dateRange==='month'){ curFrom = daysAgoISO(29); curTo = todayISO(); }
  else if (dateRange==='custom' && dateFrom && dateTo){ curFrom = dateFrom; curTo = dateTo; }
  else return null;
  const a = new Date(curFrom+'T00:00:00'), b = new Date(curTo+'T00:00:00');
  const len = Math.round((b - a) / dayMs) + 1;
  const pTo   = new Date(a.getTime() -     dayMs).toLocaleDateString('sv-SE');
  const pFrom = new Date(a.getTime() - len*dayMs).toLocaleDateString('sv-SE');
  return jobs.filter(j=>{
    const d = (j.details && j.details.date) || '';
    return d >= pFrom && d <= pTo && matchScope(j) && matchSearch(j);
  });
}

// ▲/▼ % vs the previous window. `invert` = a drop is the good direction (avg time).
function deltaChip(cur, prev, invert){
  if (prev == null) return '';
  if (prev === 0) return cur > 0 ? '<span class="kpi-delta up">ใหม่</span>' : '';
  const pct = Math.round((cur - prev) / prev * 100);
  if (pct === 0) return '<span class="kpi-delta flat">0%</span>';
  const up = pct > 0;
  const good = invert ? !up : up;
  return `<span class="kpi-delta ${good?'up':'down'}">${up?'▲':'▼'} ${Math.abs(pct)}%</span>`;
}

// how many distinct people logged work in this set
function peopleCount(set){
  const names = new Set();
  set.forEach(j => (j.crew||[]).forEach(n => { if (n) names.add(n); }));
  return names.size;
}

// output totalled by each task's OWN declared unit — never assume "คัน".
// containers tasks count as "ตู้" (their primary unit); a job that also needs
// a vehicle count is logged as its own vehicles-unit task type.
// `weight` (optional) scales each job's output — e.g. 1/crewSize for a per-person view
function unitTotals(set, weight){
  const wf = weight || (()=>1);
  const by = new Map();   // label -> qty
  const add = (label, q) => { if (label && q) by.set(label, (by.get(label)||0) + q); };
  set.forEach(j=>{
    const t = taskById(j.task_id), d = j.details || {}, k = wf(j);
    if (!t) return;
    if (t.unit==='containers') add('ตู้', num(d.containers)*k);
    else if (t.unit==='vehicles') add(t.unitLabel || 'คัน', num(d.qty)*k);
    else if (t.unit==='pieces')   add(t.unitLabel || 'ชิ้น', num(d.qty)*k);
    else if (t.unit==='boxes')    add(t.unitLabel || 'กล่อง', num(d.qty)*k);
    else add(t.unitLabel || 'หน่วย', num(d.qty)*k);   // custom
  });
  return [...by.entries()]
    .map(([label,n])=>({ label, n: n < 100 ? Math.round(n*10)/10 : Math.round(n) }))
    .sort((a,b)=>b.n-a.n);
}

// ---- dashboard (one-viewport bento): KPI + stacked hourly/daily columns + dept split + tasks + people + heat ----
// Model is built from the already-filtered `closed` set; SVG/size-dependent parts are
// (re)drawn from container sizes by drawDash(), driven by a ResizeObserver so the
// panels follow the sidebar collapsing. Grow animations run once per data change.
let dash = null, dashSig = '', dashAnim = false, dashTips = {}, dashRO = null, dashRaf = 0;
const DASH_WD = ['อา','จ','อ','พ','พฤ','ศ','ส'], DASH_WD_ORDER = [1,2,3,4,5,6,0];
const fmtH = v => (Math.round(v*10)/10).toLocaleString('en-US');
const jobMh = j => num((j.details||{}).mins) * Math.max(1, (j.crew||[]).length) / 60;   // man-hours
const jobHour = j => { const m = /^(\d{1,2})/.exec((j.details||{}).start || ''); return m ? Math.min(23, +m[1]) : null; };
const isoPlus = (iso, n) => { const d = new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); return d.toLocaleDateString('sv-SE'); };
const shortDate = iso => `${+iso.slice(8,10)}/${+iso.slice(5,7)}`;
const pad2 = n => String(n).padStart(2,'0');
const dkSw = (c, tex) => `<b class="dk-sw${tex?' tex':''}" style="background-color:${esc(c)}"></b>`;
const dkEl = id => document.getElementById(id);

// period of the current filter (pFrom..pTo) as a day list; "ทั้งหมด" = span of the data
function dashPeriod(closed){
  const t = todayISO();
  const ds = closed.map(j=>(j.details||{}).date).filter(Boolean).sort();
  let from, to;
  if (dateRange==='today') from = to = t;
  else if (dateRange==='week'){ from = daysAgoISO(6); to = t; }
  else if (dateRange==='month'){ from = daysAgoISO(29); to = t; }
  else {
    from = (dateRange==='custom' && dateFrom) || ds[0] || t;
    to   = (dateRange==='custom' && dateTo)   || ds[ds.length-1] || t;
  }
  if (from > to) to = from;
  const days = [];
  for (let d = from; d <= to && days.length < 800; d = isoPlus(d, 1)) days.push(d);
  return { from, to, days };
}

function niceScale(max){
  if (!(max > 0)) return { top:4, step:1 };
  const raw = max/4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1,2,2.5,5,10].map(m=>m*mag).find(s=>s>=raw-1e-9);
  return { top: Math.ceil(max/step - 1e-9) * step, step };
}

function buildDash(closed){
  const per = dashPeriod(closed), single = per.days.length === 1;
  const codes = (deptFilter!=='ALL' ? [deptFilter] : deptKeysFor(whFilter)).slice();
  closed.forEach(j=>{ if (j.department && !codes.includes(j.department)) codes.push(j.department); });
  const ci = Object.fromEntries(codes.map((c,i)=>[c,i]));
  const series = codes.map(c=>({ code:c, name:deptName(c, whFilter), color:deptColor(c, whFilter) }));

  let hMin = 8, hMax = 17;
  closed.forEach(j=>{ const h = jobHour(j); if (h!=null){ hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); } });
  const hours = []; for (let h = hMin; h <= hMax; h++) hours.push(h);

  // main chart columns
  const blank = () => codes.map(()=>0);
  let cols, colOf;
  if (single){
    cols = hours.map(h=>({ label:pad2(h), title:`${pad2(h)}:00–${pad2(h)}:59`, vals:blank(), total:0, hour:h }));
    colOf = j => { const h = jobHour(j); return h==null ? -1 : h - hMin; };
  } else {
    const n = per.days.length, step = n <= 31 ? 1 : n <= 217 ? 7 : 30, dayCol = {};
    cols = [];
    for (let i = 0; i < n; i += step){
      const f = per.days[i], t = per.days[Math.min(n-1, i+step-1)];
      per.days.slice(i, i+step).forEach(d=>{ dayCol[d] = cols.length; });
      cols.push({ label:shortDate(f), title: step===1 ? fmtThaiDate(f) : fmtThaiDate(f)+' – '+fmtThaiDate(t), vals:blank(), total:0 });
    }
    colOf = j => { const c = dayCol[(j.details||{}).date]; return c==null ? -1 : c; };
  }

  // sparkline buckets: per hour (one day) / per day (<=12 days) / ~8 equal chunks
  let nb, spOf;
  if (single){ nb = hours.length; spOf = colOf; }
  else {
    const n = per.days.length, sz = n <= 12 ? 1 : Math.ceil(n/8), dayB = {};
    per.days.forEach((d,i)=>{ dayB[d] = Math.floor(i/sz); });
    nb = Math.ceil(n/sz);
    spOf = j => { const b = dayB[(j.details||{}).date]; return b==null ? -1 : b; };
  }
  const sp = { mh:Array(nb).fill(0), jobs:Array(nb).fill(0), min:Array(nb).fill(0), minN:Array(nb).fill(0),
               ppl:Array.from({length:nb}, ()=>new Set()) };

  let totalMh = 0;
  const deptAB = codes.map(()=>({ A:0, B:0 }));
  const tasks = new Map(), ppl = new Map(), heat = {}, wdSeen = new Set();
  closed.forEach(j=>{
    const d = j.details || {}, mh = jobMh(j), crew = (j.crew||[]).filter(Boolean), k = ci[j.department];
    totalMh += mh;
    const c = colOf(j);
    if (c >= 0 && k != null){ cols[c].vals[k] += mh; cols[c].total += mh; }
    if (k != null) deptAB[k][j.warehouse==='B' ? 'B' : 'A'] += mh;
    const b = spOf(j);
    if (b >= 0){
      sp.mh[b] += mh; sp.jobs[b]++;
      if (d.mins != null){ sp.min[b] += num(d.mins); sp.minN[b]++; }
      crew.forEach(n=>sp.ppl[b].add(n));
    }
    const t = taskById(j.task_id), label = t ? t.label : (j.task_id || 'ไม่ทราบ');
    const te = tasks.get(label) || { label, h:0, dept:j.department, wh:j.warehouse };
    te.h += mh; tasks.set(label, te);
    const ph = num(d.mins) / 60;
    crew.forEach(n=>{
      const p = ppl.get(n) || { name:n, h:0, by:{}, wh:j.warehouse };
      p.h += ph; p.by[j.department] = (p.by[j.department]||0) + ph; ppl.set(n, p);
    });
    const h = jobHour(j);
    if (h != null && d.date){
      const wd = new Date(d.date+'T00:00:00').getDay();
      heat[wd+'|'+h] = (heat[wd+'|'+h]||0) + mh; wdSeen.add(wd);
    }
  });

  // dashed "เฉลี่ย 7 วัน": average man-hours per hour over the 7 days before the viewed day
  let avg = null;
  if (single){
    const a0 = isoPlus(per.from, -7), a1 = isoPlus(per.from, -1), sum = hours.map(()=>0);
    let any = false;
    jobs.forEach(j=>{
      const d = (j.details||{}).date;
      if (!d || d < a0 || d > a1 || !matchScope(j) || !matchSearch(j)) return;
      any = true;
      const h = jobHour(j); if (h != null && h >= hMin && h <= hMax) sum[h-hMin] += jobMh(j);
    });
    if (any) avg = sum.map(v=>v/7);
  }

  // KPI cards
  const prev = prevPeriodJobs();
  const avgOf = set => { const w = set.filter(j=>j.details && j.details.mins!=null); return w.length ? Math.round(w.reduce((s,j)=>s+num(j.details.mins),0)/w.length) : 0; };
  const avgM = avgOf(closed), pplN = peopleCount(closed);
  const kpis = [
    { lab:'ชั่วโมงคน', val:fmtH(totalMh), hero:true, spark:sp.mh,
      chip:deltaChip(totalMh, prev ? prev.reduce((s,j)=>s+jobMh(j),0) : null) },
    { lab:'งานทั้งหมด', val:String(closed.length), spark:sp.jobs, chip:deltaChip(closed.length, prev ? prev.length : null) },
    { lab:'เฉลี่ย นาที/งาน', val:String(avgM), spark:sp.min.map((m,i)=>sp.minN[i] ? m/sp.minN[i] : 0),
      chip:deltaChip(avgM, prev ? avgOf(prev) : null, true) },
    { lab:'คนทำงาน', val:String(pplN), spark:sp.ppl.map(s=>s.size), chip:deltaChip(pplN, prev ? peopleCount(prev) : null) },
  ];

  const taskRows = [...tasks.values()].sort((a,b)=>b.h-a.h).slice(0,6).map(t=>({
    label:t.label, h:t.h, color:deptColor(t.dept, t.wh), dept:deptName(t.dept, t.wh) }));
  const pplRows = [...ppl.values()].sort((a,b)=>b.h-a.h).slice(0,6).map(p=>{
    const top = Object.keys(p.by).sort((x,y)=>p.by[y]-p.by[x])[0];
    return { name:p.name, h:p.h, dept:top ? deptName(top, p.wh) : '' };
  });
  const wds = DASH_WD_ORDER.filter(w=>wdSeen.has(w));
  const heatWds = wds.length ? wds : [1,2,3,4,5];
  const sig = [per.from, per.to, whFilter, deptFilter, searchTerm, closed.length, Math.round(totalMh*100)].join('|');
  return { per, single, series, cols, avg, hours, hMin, kpis, deptAB, totalMh, taskRows, pplRows, heat, heatWds, sig };
}

function renderDash(closed){
  dash = buildDash(closed);
  if (dash.sig !== dashSig){ dashSig = dash.sig; dashAnim = true; }
  dashTips = {};
  const D = dash, tips = dashTips;

  // KPI cards
  dkEl('kpiRow').innerHTML = D.kpis.map((k,i)=>`
    <div class="dk-kpi${k.hero?' hero':''}">
      <div class="l">${esc(k.lab)}</div>
      <div class="v num">${esc(k.val)}</div>${k.chip || '<span></span>'}
      <svg class="dk-spark" data-i="${i}" aria-hidden="true"></svg>
    </div>`).join('');

  // trend header: title + legend
  dkEl('dkTrendTitle').textContent = D.single ? 'ชั่วโมงคนรายชั่วโมง'
    : (D.cols.length < D.per.days.length ? 'ชั่วโมงคนรายสัปดาห์' : 'ชั่วโมงคนรายวัน');
  dkEl('dkLegend').innerHTML = D.series.map(s=>`<span>${dkSw(s.color)}${esc(s.name)}</span>`).join('')
    + (D.avg ? `<span><b style="width:14px;height:0;border-top:2px dashed var(--ink-2);border-radius:0"></b>เฉลี่ย 7 วัน</span>` : '');

  // dept split: A solid / B striped (single solid bar when one warehouse is filtered)
  const both = whFilter === 'ALL';
  dkEl('dkDeptSub').textContent = both ? 'คลัง A / B' : (WH_PLAIN[whFilter] || whFilter);
  dkEl('dkDept').innerHTML = D.series.length
    ? D.series.map((s,i)=>{
        const a = D.deptAB[i].A, b = D.deptAB[i].B, t = a + b;
        let track, under, tip;
        if (both){
          track = `<div class="dk-track">${a>0?`<span style="width:calc(${a/t*100}% - 1px);background-color:${esc(s.color)}"></span>`:''}`
                + `${b>0?`<span class="b" style="width:calc(${b/t*100}% - 1px);background-color:${esc(s.color)}"></span>`:''}</div>`;
          under = `<span>A ${fmtH(a)}</span><span>B ${fmtH(b)}</span>`;
          tip = `<div class="tt-h">${esc(s.name)}</div>`
            + `<div class="tt-r">${dkSw(s.color)}คลัง A<span class="num">${fmtH(a)} ชม. · ${t?Math.round(a/t*100):0}%</span></div>`
            + `<div class="tt-r">${dkSw(s.color,true)}คลัง B<span class="num">${fmtH(b)} ชม. · ${t?Math.round(b/t*100):0}%</span></div>`;
        } else {
          const share = D.totalMh ? t/D.totalMh*100 : 0;
          track = `<div class="dk-track" style="background:var(--surface-2);border-radius:7px"><span style="width:${share}%;background-color:${esc(s.color)}"></span></div>`;
          under = `<span>${Math.round(share)}% ของทั้งหมด</span><span></span>`;
          tip = `<div class="tt-h">${esc(s.name)}</div><div class="tt-r">${dkSw(s.color)}${esc(WH_PLAIN[whFilter]||whFilter)}<span class="num">${fmtH(t)} ชม. · ${Math.round(share)}%</span></div>`;
        }
        tips['d'+i] = tip;
        return `<div class="dk-drow" data-tip="d${i}"><span class="dk-dk">${dkSw(s.color)}<span>${esc(s.name)}</span></span>${track}`
          + `<span class="num dk-dv">${fmtH(t)}<small> ชม.</small></span><span class="dk-ab">${under}</span></div>`;
      }).join('')
      + (both ? `<div class="dk-legend"><span><b class="dk-sw" style="background:var(--ink-2)"></b>คลัง A (ทึบ)</span><span><b class="dk-sw tex" style="background-color:var(--ink-2)"></b>คลัง B (ลาย)</span></div>` : '')
    : '<p class="c-empty">ยังไม่มีข้อมูล</p>';

  // leaderboard
  const pmax = D.pplRows.length ? D.pplRows[0].h || 1 : 1;
  dkEl('dkLb').innerHTML = D.pplRows.length
    ? D.pplRows.map((p,i)=>`<div class="dk-lr"><span class="dk-rk">${i+1}</span>`
        + `<span class="dk-nm">${esc(p.name)} <small>${esc(p.dept)}</small></span><span class="dk-lv num">${fmtH(p.h)}</span>`
        + `<div class="dk-lbar"><i style="width:${Math.max(2, p.h/pmax*100)}%"></i></div></div>`).join('')
    : '<p class="c-empty">ยังไม่มีข้อมูล</p>';

  // heat grid: weekday x hour, man-hours, 5-step scale
  const R = D.heatWds.length, nh = D.hours.length;
  let hmax = 0; Object.keys(D.heat).forEach(k=>{ if (D.heat[k] > hmax) hmax = D.heat[k]; });
  let hh = '<span></span>' + D.hours.map(h=>`<span class="h">${pad2(h)}</span>`).join('');
  D.heatWds.forEach((wd,r)=>{
    hh += `<span class="h">${DASH_WD[wd]}</span>`;
    D.hours.forEach((h,c)=>{
      const v = D.heat[wd+'|'+h] || 0, lv = v > 0 ? Math.max(1, Math.ceil(v/hmax*4 - 1e-9)) : 0;
      tips[`h${r}-${c}`] = `<div class="tt-h">${DASH_WD[wd]} ${pad2(h)}:00</div><div class="tt-r">ชั่วโมงคน<span class="num">${fmtH(v)}</span></div>`;
      hh += `<div class="cell" style="background:var(--heat-${lv})" data-tip="h${r}-${c}"></div>`;
    });
  });
  const heatEl = dkEl('dkHeat');
  heatEl.style.gridTemplateColumns = `28px repeat(${nh}, minmax(0,1fr))`;
  heatEl.style.gridTemplateRows = `16px repeat(${R}, minmax(0,1fr))`;
  heatEl.innerHTML = hh;

  if (!dashRO && window.ResizeObserver){
    dashRO = new ResizeObserver(()=>{ cancelAnimationFrame(dashRaf); dashRaf = requestAnimationFrame(drawDash); });
    dashRO.observe(dkEl('view-dashboard'));
  }
  drawDash();
}

function drawDash(){
  if (!dash || activeView !== 'dashboard') return;
  const box = dkEl('dkTrend');
  if (!box || !box.clientWidth || !box.clientHeight) return;   // hidden / not laid out yet
  const anim = dashAnim;
  drawSparks(); drawTrend(anim); drawTasks(anim);
  dashAnim = false;
}

function drawSparks(){
  document.querySelectorAll('#kpiRow .dk-spark').forEach(s=>{
    const w = s.clientWidth, h = s.clientHeight, v = dash.kpis[+s.dataset.i].spark;
    if (!w || !h || v.length < 2){ s.innerHTML = ''; return; }
    const mn = Math.min(...v), mx = Math.max(...v);
    const p = v.map((y,i)=>[2 + i/(v.length-1)*(w-8), h - 4 - (y-mn)/(mx-mn||1)*(h-8)]);
    const hero = !!s.closest('.hero'), c = hero ? 'var(--signal)' : 'var(--accent)', e = p[p.length-1];
    s.setAttribute('viewBox', `0 0 ${w} ${h}`);
    s.innerHTML = `<path d="M${p.map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join('L')}" fill="none" style="stroke:${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
      + `<circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="3.5" style="fill:${c};stroke:${hero?'var(--night)':'var(--surface)'}" stroke-width="2"/>`;
  });
}

function drawTrend(anim){
  const box = dkEl('dkTrend'), W = box.clientWidth, H = box.clientHeight, D = dash, n = D.cols.length;
  const L = 30, R = W - 4, T = 18, B = 18, cw = R - L, ch = H - B - T;
  if (cw < 20 || ch < 20){ box.innerHTML = ''; return; }
  const peak = Math.max(0, ...D.cols.map(c=>c.total), ...(D.avg || [0]));
  const { top, step } = niceScale(peak);
  const Y = v => T + ch - v/top*ch, slot = cw/n, bw = Math.max(3, Math.min(34, slot*.56));
  const nowIdx = D.single && D.per.from === todayISO() ? nowBkk().getHours() - D.hMin : -1;
  const lblEvery = Math.max(1, Math.ceil(30/slot));
  let g = '', cs = '', hits = '';
  for (let v = 0; v <= top + 1e-9; v += step){
    const y = Y(v);
    g += `<line x1="${L}" x2="${R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" style="stroke:var(${v ? '--line' : '--ink-3'})"/>`
      + `<text class="dk-ax" x="${L-6}" y="${(y+4).toFixed(1)}" text-anchor="end">${+v.toFixed(1)}</text>`;
  }
  let maxI = -1, maxV = 0;
  D.cols.forEach((c,i)=>{ if (c.total > maxV){ maxV = c.total; maxI = i; } });
  D.cols.forEach((col,i)=>{
    const cx = L + slot*(i+.5), isNow = i === nowIdx;
    if (i % lblEvery === 0) cs += `<text class="dk-ax${isNow?' now':''}" x="${cx.toFixed(1)}" y="${H-4}" text-anchor="middle">${esc(col.label)}</text>`;
    if (col.total > 0){
      let base = 0; const last = col.vals.map(v=>v>0).lastIndexOf(true);
      col.vals.forEach((v,si)=>{
        if (!(v > 0)) return;
        const y1 = Y(base+v), hgt = Math.max(1, Y(base) - y1 - (base ? 2 : 0)), x = cx - bw/2, rr = Math.min(4, hgt, bw/2);
        const d = si === last
          ? `M${x},${y1+hgt}V${y1+rr}Q${x},${y1} ${x+rr},${y1}H${x+bw-rr}Q${x+bw},${y1} ${x+bw},${y1+rr}V${y1+hgt}Z`
          : `M${x},${y1}h${bw}v${hgt}h${-bw}Z`;
        cs += `<path d="${d}" fill="${esc(D.series[si].color)}"${anim ? ` class="dk-g" style="transform-origin:0 ${T+ch}px;animation-delay:${(i*.4/n).toFixed(2)}s"` : ''}/>`;
        base += v;
      });
    } else cs += `<rect x="${(cx-bw/2).toFixed(1)}" y="${T+ch-3}" width="${bw}" height="2" rx="1" style="fill:var(--line)"/>`;
    let tip = `<div class="tt-h">${esc(col.title)}${isNow?' · กำลังเดิน':''}</div>`;
    tip += col.total
      ? col.vals.map((v,si)=>v>0 ? `<div class="tt-r">${dkSw(D.series[si].color)}${esc(D.series[si].name)}<span class="num">${fmtH(v)}</span></div>` : '').reverse().join('')
        + `<div class="tt-r tt-t">รวม<span class="num">${fmtH(col.total)} ชม.</span></div>`
      : '<div class="tt-r">ยังไม่มีงาน</div>';
    if (D.avg) tip += `<div class="tt-r tt-m">เฉลี่ย 7 วัน<span class="num">${fmtH(D.avg[i])}</span></div>`;
    dashTips['c'+i] = tip;
    hits += `<rect x="${(L+slot*i).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${ch}" fill="transparent" data-tip="c${i}" data-gx="${(L+slot*i).toFixed(1)}"/>`;
  });
  let extra = '';
  if (D.avg) extra += `<path d="M${D.avg.map((v,i)=>(L+slot*(i+.5)).toFixed(1)+','+Y(v).toFixed(1)).join('L')}" fill="none" style="stroke:var(--ink-2)" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (maxI >= 0) extra += `<text class="dk-tot" x="${(L+slot*(maxI+.5)).toFixed(1)}" y="${(Y(maxV)-6).toFixed(1)}" text-anchor="middle">${fmtH(maxV)}</text>`;
  if (!D.totalMh) extra += `<text class="dk-empty" x="${W/2}" y="${H/2}" text-anchor="middle">ยังไม่มีงานในช่วงนี้</text>`;
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(dkEl('dkTrendTitle').textContent)} รวม ${fmtH(D.totalMh)} ชั่วโมงคน">${g}`
    + `<rect id="dkGuide" class="dk-guide" y="${T}" width="${slot.toFixed(1)}" height="${ch}" rx="6" style="fill:var(--ink);fill-opacity:.05"/>${cs}${extra}${hits}</svg>`;
}

function drawTasks(anim){
  const box = dkEl('dkTasks'), W = box.clientWidth, rows = dash.taskRows;
  if (!W) return;
  if (!rows.length){ box.innerHTML = '<p class="c-empty">ยังไม่มีข้อมูล</p>'; return; }
  const stack = W < 360, max = rows[0].h || 1, tot = dash.totalMh || 1;
  box.innerHTML = '<div class="dk-tasks">' + rows.map((r,i)=>{
    dashTips['t'+i] = `<div class="tt-h">${esc(r.label)}</div><div class="tt-r">${dkSw(r.color)}${esc(r.dept)}<span class="num">${fmtH(r.h)} ชม.คน</span></div>`
      + `<div class="tt-r tt-m">สัดส่วน<span class="num">${Math.round(r.h/tot*100)}%</span></div>`;
    return `<div class="dk-trow${stack?' stack':''}" data-tip="t${i}"><span class="dk-tl" title="${esc(r.label)}">${esc(r.label)}</span>`
      + `<div class="dk-tbar"><i${anim ? ` class="dk-gx" style="animation-delay:${(i*.06).toFixed(2)}s;` : ' style="'}width:${Math.max(2, r.h/max*100).toFixed(1)}%;background:${esc(r.color)}"></i></div>`
      + `<span class="dk-tv num">${fmtH(r.h)}</span></div>`;
  }).join('') + '</div>';
}

// one shared tooltip + column guide, delegated
document.addEventListener('mousemove', e=>{
  const tip = dkEl('dkTip'); if (!tip) return;
  const t = e.target.closest ? e.target.closest('#view-dashboard [data-tip]') : null;
  const guide = dkEl('dkGuide');
  if (!t || !dashTips[t.dataset.tip]){
    if (!tip.hidden) tip.hidden = true;
    if (guide) guide.style.opacity = 0;
    return;
  }
  if (guide){
    if (t.dataset.gx != null){ guide.setAttribute('x', t.dataset.gx); guide.style.opacity = 1; }
    else guide.style.opacity = 0;
  }
  tip.innerHTML = dashTips[t.dataset.tip]; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY - r.height - 10;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y < 8) y = e.clientY + 16;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
});
document.addEventListener('mouseleave', ()=>{ const tip = dkEl('dkTip'); if (tip) tip.hidden = true; });

// generic horizontal-bar list
function hbars(box, rows){
  const max = Math.max(1, ...rows.map(r=>r.n));
  box.innerHTML = rows.length
    ? rows.map(r=>`<div class="hbar-row">
        <span class="hbar-lab" title="${esc(r.label)}">${esc(r.label)}</span>
        <span class="hbar-track"><i style="transform:scaleX(${(Math.max(2, r.n/max*100)/100).toFixed(4)});background:${esc(r.color||'var(--accent)')}"></i></span>
        <b class="hbar-n num">${r.disp != null ? esc(r.disp) : r.n}</b>
      </div>`).join('')
    : '<p class="c-empty">ยังไม่มีข้อมูล</p>';
}

// One row renderer, shared by the dashboard table and the "งานทั้งหมด" view —
// they were two divergent tables (6 cols vs 9) before.
const _ICS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const IC_OK    = `<svg ${_ICS}><path d="M5 12l5 5L20 7"/></svg>`;
const IC_NO    = `<svg ${_ICS}><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const IC_TRASH = `<svg ${_ICS}><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>`;
const IC_DOTS  = `<svg ${_ICS}><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`;
function jobRowHTML(j){
  const task = taskById(j.task_id); const d = j.details||{};
  const status = j.status || 'approved';
  const canAct = false;   // approval queue removed 2026-11-24
  return `<tr>
    <td class="mono">${esc(d.date)}</td>
    <td><span class="wh-tag">${esc(WH_PLAIN[j.warehouse]||j.warehouse||'–')}</span></td>
    <td>${deptBadge(j.department, j.warehouse)}</td>
    <td class="td-task">${esc(task?task.label:j.task_id)}</td>
    <td>${esc((j.crew||[]).join(', '))}</td>
    <td class="mono">${esc(d.start||'–')}–${esc(d.end||'–')}</td>
    <td class="mono">${d.mins == null ? '–' : num(d.mins)}</td>
    <td class="mono">${esc(formatResult(d,task))}</td>
    <td><span class="status-badge ${esc(status)}">${STATUS_LABEL[status]||esc(status)}</span></td>
    <td>${[
      canAct ? `<button type="button" class="ic-btn approve" data-approve-job="${esc(j.id)}" aria-label="อนุมัติ" title="อนุมัติ">${IC_OK}</button>` : '',
      canAct ? `<button type="button" class="ic-btn reject" data-reject-job="${esc(j.id)}" aria-label="ไม่อนุมัติ" title="ไม่อนุมัติ">${IC_NO}</button>` : '',
      isReadOnly() ? '' : `<button type="button" class="ic-btn trash" data-del-job="${esc(j.id)}" aria-label="ลบงาน" title="ลบงาน">${IC_TRASH}</button>`,
    ].filter(Boolean).join('') || '–'}</td>
  </tr>`;
}
function emptyRow(cols, msg){
  const clr = isFiltered() ? ` · <button type="button" class="link-btn" data-clear-filters>ล้างตัวกรอง</button>` : '';
  return `<tr><td colspan="${cols}" class="empty-note">${esc(msg)}${clr}</td></tr>`;
}
function renderJobRows(tbody, rows, emptyMsg){
  if (!tbody) return;
  tbody.innerHTML = rows.length
    ? rows.map(jobRowHTML).join('')
    : emptyRow(10, emptyMsg || 'ไม่พบรายการ');
}

// ---------- "งานทั้งหมด" data table: sort + status facet + column toggle + pager ----------
// Column order here is 1:1 with the <td> order in jobRowHTML() — the CSS
// column-hide rules key off nth-child, so keep the two in lockstep.
const DT_COLS = [
  { key:'date',   label:'วันที่',   always:true,  sort:j => ((j.details&&j.details.date)||'') + ((j.details&&j.details.start)||'') },
  { key:'wh',     label:'คลัง',     always:false, sort:j => j.warehouse || '' },
  { key:'dept',   label:'ฝั่ง',     always:false, sort:j => j.department || '' },
  { key:'task',   label:'งาน',     always:true,  sort:j => { const t = taskById(j.task_id); return (t ? t.label : j.task_id) || ''; } },
  { key:'crew',   label:'ทีม',     always:false, sort:j => (j.crew||[]).join(', ') },
  { key:'time',   label:'เริ่ม–จบ', always:false, sort:j => (j.details&&j.details.start) || '' },
  { key:'mins',   label:'นาที',    always:false, sort:j => { const m = j.details&&j.details.mins; return m == null ? -1 : Number(m); } },
  { key:'result', label:'ผลลัพธ์',  always:true,  sort:null },
  { key:'status', label:'สถานะ',   always:true,  sort:j => j.status || 'approved' },
  { key:'act',    label:'จัดการ',   always:true,  sort:null },
];
const DT_STATUS_ORDER = ['open','pending','approved','rejected'];
const dtState = { sortKey:'date', sortDir:'desc', page:0, size:25, statuses:[], q:'', hidden:new Set() };

function renderDtHead(){
  const head = document.getElementById('dtHead');
  if (!head) return;
  head.innerHTML = DT_COLS.map(c=>{
    const sortable = !!c.sort;
    const active = sortable && dtState.sortKey===c.key;
    const caret = active ? `<span class="dt-caret">${dtState.sortDir==='asc'?'▲':'▼'}</span>` : '';
    const ariaSort = !sortable ? '' : active ? (dtState.sortDir==='asc'?'ascending':'descending') : 'none';
    return `<th class="${sortable?'dt-sortable':''}${active?' dt-sorted':''}"`
      + `${sortable?` data-dt-sort="${c.key}" aria-sort="${ariaSort}" tabindex="0" role="button"`:''}>${esc(c.label)}${caret}</th>`;
  }).join('');
}
function buildDtStatusPop(pool){
  const counts = {};
  pool.forEach(j=>{ const s = j.status || 'approved'; counts[s] = (counts[s]||0) + 1; });
  const seen = DT_STATUS_ORDER.filter(s=>counts[s]);
  document.getElementById('dtStatusPop').innerHTML = `<div class="dt-pop-h">กรองสถานะ</div>` + (seen.length
    ? seen.map(s=>`<label class="dt-pop-row"><input type="checkbox" data-dt-status="${s}" ${dtState.statuses.includes(s)?'checked':''}>`
        + `<span>${esc(STATUS_LABEL[s]||s)}</span><span class="dt-pop-n">${counts[s]}</span></label>`).join('')
    : `<div class="dt-pop-empty">ไม่มีข้อมูล</div>`);
}
function syncDtStatusBadge(){
  const badge = document.getElementById('dtStatusCount');
  badge.hidden = !dtState.statuses.length;
  badge.textContent = dtState.statuses.length;
}
function buildDtColsPop(){
  document.getElementById('dtColsPop').innerHTML = `<div class="dt-pop-h">แสดงคอลัมน์</div>`
    + DT_COLS.filter(c=>!c.always).map(c=>`<label class="dt-pop-row">`
      + `<input type="checkbox" data-dt-col="${c.key}" ${dtState.hidden.has(c.key)?'':'checked'}>`
      + `<span>${esc(c.label)}</span></label>`).join('');
}
function renderDtPager(total, start, shown, pages){
  document.getElementById('dtPagerInfo').innerHTML = total
    ? `<span class="dt-strong">${start+1}–${start+shown}</span> จาก <span class="dt-strong">${total}</span>`
    : '0 รายการ';
  const set = (sel, dis) => { const b = document.querySelector(sel); if (b) b.disabled = dis; };
  set('[data-dt-page="first"]', dtState.page<=0);
  set('[data-dt-page="prev"]',  dtState.page<=0);
  set('[data-dt-page="next"]',  dtState.page>=pages-1);
  set('[data-dt-page="last"]',  dtState.page>=pages-1);
  const sz = document.getElementById('dtPageSize');
  if (sz && sz.value !== String(dtState.size)) sz.value = String(dtState.size);
}
function toggleDtPop(popId, btnId){
  const pop = document.getElementById(popId);
  const willOpen = pop.hidden;
  document.querySelectorAll('#view-details .dt-pop').forEach(p=>{ p.hidden = true; });
  document.querySelectorAll('#dtStatusBtn,#dtColsBtn').forEach(b=>b.setAttribute('aria-expanded','false'));
  pop.hidden = !willOpen;
  document.getElementById(btnId).setAttribute('aria-expanded', String(willOpen));
}

function renderDetailsTable(closed){
  renderDtHead();
  syncDtStatusBadge();
  // rebuild the facet list only while it's closed — rebuilding it open would
  // swap out the checkbox the user is mid-click on. Counts only move when the
  // outer filter changes, and that path re-renders anyway.
  if (document.getElementById('dtStatusPop').hidden) buildDtStatusPop(closed);
  const tbl = document.getElementById('detailsTable');
  DT_COLS.forEach(c=>{ if (!c.always) tbl.classList.toggle('dt-hide-'+c.key, dtState.hidden.has(c.key)); });

  let rows = closed.filter(j=>{
    if (dtState.statuses.length && !dtState.statuses.includes(j.status||'approved')) return false;
    if (dtState.q){
      const t = taskById(j.task_id);
      const hay = ((t?t.label:'') + ' ' + (j.crew||[]).join(' ') + ' ' + ((j.details&&j.details.date)||'')).toLowerCase();
      if (!hay.includes(dtState.q)) return false;
    }
    return true;
  });

  const col = DT_COLS.find(c=>c.key===dtState.sortKey);
  if (col && col.sort){
    const dir = dtState.sortDir==='asc' ? 1 : -1;
    rows = [...rows].sort((a,b)=>{
      const va = col.sort(a), vb = col.sort(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
  }

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / dtState.size));
  dtState.page = Math.min(Math.max(dtState.page, 0), pages - 1);
  const start = dtState.page * dtState.size;
  const pageRows = rows.slice(start, start + dtState.size);

  const rc = document.getElementById('dtRowCount');
  if (rc) rc.textContent = total ? `${total} รายการ` : '';
  renderJobRows(tbl.querySelector('tbody'), pageRows, 'ไม่พบรายการที่ตรงกับตัวกรอง');
  renderDtPager(total, start, pageRows.length, pages);
}

async function setJobStatus(jobId, status){
  // a "job" is a group of one-row-per-employee records — approve/reject them all
  const j = jobs.find(x=>x.id===jobId);
  const ids = (j && j.rowIds && j.rowIds.length) ? j.rowIds : [jobId];
  const { error } = await sb.from('jobs').update({
    status, approved_by: currentUser.id, approved_at: new Date().toISOString(),
  }).in('id', ids);
  if (error){ toast('ทำรายการไม่สำเร็จ: ' + mapDbError(error)); return; }
  await refreshJobs(); render();
}

// Hard-delete a whole job group (one DB row per crew member). ADMIN only —
// gated in the UI by isReadOnly() and in the DB by the jobs_delete_admin policy.
async function deleteJob(jobId){
  const j = jobs.find(x=>x.id===jobId);
  const ids = (j && j.rowIds && j.rowIds.length) ? j.rowIds : [jobId];
  const task = (j && taskById(j.task_id)) || (j && taskList.find(t=>t.id===j.task_id));
  const name = task ? (task.label || task.name) : (j && j.task_id) || '';
  const when = (j && j.details && j.details.date) ? ` (${j.details.date})` : '';
  const go = await confirmModal(
    `ลบงาน "${name}"${when} ถาวร?\nลบ ${ids.length} แถว · กู้คืนไม่ได้`,
    { danger:true, yes:'ลบถาวร', title:'ลบงานนี้?' });
  if (!go) return;
  const { error } = await sb.from('jobs').delete().in('id', ids);
  if (error){ toast('ลบไม่สำเร็จ: ' + mapDbError(error)); return; }
  await refreshJobs(); render();
  toast('ลบแล้ว', 'ok');
}

// ===================== APPROVAL QUEUE (phase 3) =====================
// Pending jobs in the current department scope, ignoring the date filter —
// an old pending job still needs approving even while looking at "วันนี้".
function queuePending(){
  return jobs.filter(j => (j.status||'approved')==='pending' && matchScope(j) && matchSearch(j));
}
function isProblem(j){
  const t = taskById(j.task_id);
  return j.department==='OUT' && t && t.hasIssue && j.details && j.details.hasIssue;
}
function crewMatesPending(j, list){
  const key = (j.crew||[]).join('|');
  return list.filter(o => o!==j && (o.crew||[]).join('|')===key).length;
}
// urgency = age in hours, + a bump for jobs whose crew has other work waiting
// (so a crew's jobs get reviewed together), + a big boost for flagged problems.
function urgencyScore(j, list){
  const ageH = (Date.now() - new Date(j.created_at || Date.now()).getTime()) / 3600000;
  let s = ageH;
  const mates = crewMatesPending(j, list);
  if (mates) s += 6 + mates * 2;
  if (isProblem(j)) s += 24;
  return s;
}
function urgencyReason(j, list){
  if (isProblem(j)) return { txt:'มีปัญหา', cls:'bad' };
  const ageH = (Date.now() - new Date(j.created_at || Date.now()).getTime()) / 3600000;
  if (ageH >= 24) return { txt:'ค้าง ' + Math.floor(ageH/24) + ' วัน', cls:'attention' };
  const mates = crewMatesPending(j, list);
  if (mates) return { txt:'รออีก ' + mates + ' งานของทีมนี้', cls:'note' };
  if (ageH >= 1) return { txt:'ค้าง ' + Math.floor(ageH) + ' ชม.', cls:'attention' };
  return { txt:'เพิ่งบันทึก', cls:'note' };
}

function renderQueue(){
  const list = queuePending();
  const scored = [...list].map(j=>({ j, s: urgencyScore(j, list) })).sort((a,b)=>b.s - a.s);
  const ro = isReadOnly();

  const bar = document.getElementById('qBatchBar');
  const byDept = deptKeysFor(whFilter).map(d=>({ d, n: list.filter(x=>x.department===d).length })).filter(x=>x.n);
  if (ro || byDept.length < 1){
    bar.hidden = true; bar.innerHTML = '';
  } else {
    bar.hidden = false;
    bar.innerHTML = `<span class="q-batch-lbl">อนุมัติทั้งฝั่ง:</span>` +
      byDept.map(({d,n})=>`<button type="button" class="btn-sm" data-approve-dept="${d}">${esc(deptName(d, whFilter))} (${n})</button>`).join('');
  }

  const el = document.getElementById('qList');
  if (!list.length){
    const clr = (deptFilter!=='ALL' || searchTerm) ? ` · <button type="button" class="link-btn" data-clear-filters>ล้างตัวกรอง</button>` : '';
    const emptyHTML = `<div class="empty-note">ไม่มีงานรออนุมัติ${deptFilter!=='ALL' ? 'ในฝั่งนี้' : ''}${clr}</div>`;
    if (window.Anim) Anim.flipList(el, '.q-card', () => { el.innerHTML = emptyHTML; });
    else el.innerHTML = emptyHTML;
    return;
  }
  const html = scored.map(({j})=>{
    const task = taskById(j.task_id); const d = j.details || {};
    const r = urgencyReason(j, list);
    return `<div class="q-card" data-dept="${esc(j.department)}" data-flip-id="${esc(j.id)}">
      <div class="q-main">
        <div class="q-top">
          <span class="wh-tag">${esc(WH_PLAIN[j.warehouse]||j.warehouse||'–')}</span>
          ${deptBadge(j.department, j.warehouse)}
          <span class="pill ${r.cls}">${esc(r.txt)}</span>
        </div>
        <div class="q-task">${esc(task ? task.label : j.task_id)}</div>
        <div class="q-metaline mono">${esc(d.date||'')} · ${esc(d.start||'–')}–${esc(d.end||'–')} · ${d.mins == null ? '–' : num(d.mins)} นาที · ${esc(formatResult(d, task))}</div>
        <div class="q-crew">${esc((j.crew||[]).join(', ')) || '–'}</div>
      </div>
      ${ro ? '' : `<div class="q-actions">
        <button type="button" class="q-btn ok" data-approve-job="${esc(j.id)}">อนุมัติ</button>
        <button type="button" class="q-btn no" data-reject-job="${esc(j.id)}">ไม่อนุมัติ</button>
      </div>`}
    </div>`;
  }).join('');
  if (window.Anim) Anim.flipList(el, '.q-card', () => { el.innerHTML = html; });
  else el.innerHTML = html;
}

async function approveDept(dept){
  const list = queuePending().filter(j=>j.department===dept);
  if (!list.length) return;
  const okGo = await confirmModal(`อนุมัติงานฝั่ง ${esc(deptName(dept, whFilter))} ทั้งหมด ${list.length} งาน?`, { yes:'อนุมัติทั้งหมด' });
  if (!okGo) return;
  const ids = list.flatMap(j => (j.rowIds && j.rowIds.length) ? j.rowIds : [j.id]);
  const { error } = await sb.from('jobs').update({
    status: 'approved', approved_by: currentUser.id, approved_at: new Date().toISOString(),
  }).in('id', ids);
  if (error){ toast('ทำรายการไม่สำเร็จ: ' + mapDbError(error)); return; }
  toast(`อนุมัติ ${list.length} งานแล้ว`, 'ok');
  await refreshJobs(); render();
}

// pending-count badge on the "คิวอนุมัติ" nav items (sidebar + bottom bar)
function updatePendingBadges(){
  const n = jobs.filter(j => (j.status||'approved')==='pending' && matchScope(j)).length;
  document.querySelectorAll('[data-view="queue"]').forEach(btn=>{
    let b = btn.querySelector('.nav-badge');
    if (n){
      if (!b){ b = document.createElement('span'); b.className = 'nav-badge'; btn.appendChild(b); }
      b.textContent = n;
    } else if (b){ b.remove(); }
  });
}

// ADMIN-only: manage the `employees` roster (add / deactivate / hard-delete).
// Shown above the read-only analytics table on the พนักงาน view.
function renderEmpRoster(){
  const ro = isReadOnly();
  const bar = document.getElementById('empAdminBar');
  const wrap = document.getElementById('empRosterWrap');
  if (bar) bar.hidden = true;
  if (wrap) wrap.hidden = ro;
  const addF = document.getElementById('addEmpForm'); if (addF) addF.hidden = ro;
  if (ro) return;
  const neWh = document.getElementById('neWh');
  const neDept = document.getElementById('neDept');
  if (neWh && !neWh.options.length){
    neWh.innerHTML = WH_KEYS.map(w=>`<option value="${w}">${WH_PLAIN[w]}</option>`).join('');
    neWh.addEventListener('change', ()=>{ if (neDept) neDept.innerHTML = deptOptions(neWh.value); });
  }
  if (neDept && !neDept.options.length) neDept.innerHTML = deptOptions(neWh ? neWh.value : 'A');
  const tb = document.querySelector('#empRosterTable tbody');
  if (!tb) return;
  const list = allEmployees.filter(em => whFilter==='ALL' || em.warehouse===whFilter);
  if (!list.length){ tb.innerHTML = emptyRow(5, 'ยังไม่มีพนักงานในรายชื่อ — กด ＋ เพิ่มพนักงาน'); return; }
  tb.innerHTML = list.map(em=>{
    const on = em.active !== false;
    return `<tr class="${on?'':'row-inactive'}">
      <td>${esc(em.name)}</td>
      <td><span class="wh-tag">${esc(WH_PLAIN[em.warehouse]||em.warehouse||'–')}</span></td>
      <td>${deptBadge(em.department, em.warehouse)}</td>
      <td><span class="status-badge ${on?'approved':'rejected'}">${on?'ใช้งาน':'ปิดใช้งาน'}</span></td>
      <td>
        <button type="button" class="mini-btn ${on?'reject':'approve'}" data-emp-toggle="${esc(em.id)}" data-next="${on?'false':'true'}">${on?'ปิดใช้งาน':'เปิดใช้งาน'}</button>
        <button type="button" class="mini-btn reject" data-emp-del="${esc(em.id)}">ลบถาวร</button>
      </td>
    </tr>`;
  }).join('');
}

// ---------- generic sortable table head (ชนิดงาน / พนักงาน — งานทั้งหมด has its own dtState) ----------
function renderSortHead(headEl, cols, state, sortAttr){
  if (!headEl) return;
  headEl.innerHTML = `<tr>${cols.map(c=>{
    const sortable = !!c.sort;
    const active = sortable && state.key === c.key;
    const caret = active ? `<span class="dt-caret">${state.dir==='asc'?'▲':'▼'}</span>` : '';
    const ariaSort = !sortable ? '' : active ? (state.dir==='asc'?'ascending':'descending') : 'none';
    return `<th class="${sortable?'dt-sortable':''}${active?' dt-sorted':''}"`
      + `${sortable?` data-${sortAttr}="${c.key}" aria-sort="${ariaSort}" tabindex="0" role="button"`:''}>${esc(c.label)}${caret}</th>`;
  }).join('')}</tr>`;
}
function applySort(list, cols, state){
  const col = cols.find(c=>c.key===state.key);
  if (!col || !col.sort) return list;
  const sorted = list.slice().sort((a,b)=>{
    const av = col.sort(a), bv = col.sort(b);
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
  if (state.dir === 'desc') sorted.reverse();
  return sorted;
}
function toggleSort(state, key){
  if (state.key === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
  else { state.key = key; state.dir = 'asc'; }
}
// sorting rebuilds the <thead> innerHTML, which destroys the focused <th> —
// keyboard users would otherwise lose their place on every sort. Re-focus
// the same column's new element by its data attribute.
function refocusSort(headSel, attr, key){
  const th = document.querySelector(`${headSel} [${attr}="${key}"]`);
  if (th) th.focus();
}

const TASK_COLS = [
  { key:'name',   label:'ชื่องาน',       sort:t => t.name || '' },
  { key:'group',  label:'กลุ่ม',         sort:t => (t.task_group && String(t.task_group).trim()) || 'ทั่วไป' },
  { key:'wh',     label:'คลัง',          sort:t => t.warehouse || '' },
  { key:'dept',   label:'ฝั่ง',          sort:t => deptName(t.department, t.warehouse) },
  { key:'linked', label:'งานที่ผูกอยู่',  sort:null },   // computed count, not on raw row — skip sort
  { key:'act',    label:'จัดการ',        sort:null },
];
const taskSort = { key:'name', dir:'asc' };

// sort fns read the enriched {r, inRange, total} shape built in renderEmployeesTable
const EMP_COLS = [
  { key:'name',    label:'พนักงาน',                       sort:e => e.r.name || '' },
  { key:'wh',      label:'คลัง',                          sort:e => e.r.warehouse || '' },
  { key:'dept',    label:'ฝั่ง',                          sort:e => deptName(e.r.department, e.r.warehouse) },
  { key:'inRange', label:'งานที่เคยทำ (ช่วงที่เลือก)',     sort:e => e.inRange },
  { key:'total',   label:'งานสะสมทั้งหมด',                 sort:e => e.total },
];
const empSort = { key:'name', dir:'asc' };

// ---------- task types (ชนิดงาน view) ----------
async function refreshTasksAdmin(){
  try{
    const { data, error } = await sb.from('tasks').select('*').order('department').order('name');
    if (error) throw error;
    taskList = data || [];
  }catch(e){ /* non-critical panel */ }
}
function renderTasksAdmin(){
  const ro = isReadOnly();
  const cols = ro ? 5 : 6;
  const tb = document.querySelector('#tasksTable tbody');
  if (!tb) return;
  const addBtn = document.getElementById('addTaskOpenBtn'); if (addBtn) addBtn.hidden = ro;
  renderSortHead(document.getElementById('tasksHead'), ro ? TASK_COLS.slice(0,-1) : TASK_COLS, taskSort, 'task-sort');
  const sorted = applySort(taskList.filter(t => whFilter==='ALL' || t.warehouse===whFilter), TASK_COLS, taskSort);
  if (!sorted.length){ tb.innerHTML = `<tr><td colspan="${cols}" class="empty-note">ยังไม่มีชนิดงาน${whFilter!=='ALL'?'ในคลังนี้':''} — หัวหน้างานเพิ่มได้จากแอปมือถือ</td></tr>`; return; }
  // bucket by warehouse | department | group (rows keep the chosen sort inside a bucket)
  const buckets = new Map();
  sorted.forEach(t=>{
    const k = [t.warehouse||'', t.department||'', taskGroupOf(t)].join('\u0001');
    if (!buckets.has(k)) buckets.set(k, { wh:t.warehouse||'', dept:t.department||'', grp:taskGroupOf(t), items:[] });
    buckets.get(k).items.push(t);
  });
  const th = (a,b)=>String(a).localeCompare(String(b),'th');
  const bl = [...buckets.values()].sort((a,b)=> th(a.wh,b.wh) || th(a.dept,b.dept) || th(a.grp,b.grp));
  tb.innerHTML = bl.map(b=>{
    const head = `<tr class="tg-row-head"><td colspan="${cols}"><span class="tg-title">${esc(b.grp)}</span>
      <span class="tg-meta">${esc(WH_PLAIN[b.wh]||b.wh||'–')} · ${esc(deptName(b.dept, b.wh))} · ${b.items.length} งาน</span>
      ${ro ? '' : `<button type="button" class="mini-btn" data-grp-rename data-wh="${esc(b.wh)}" data-dept="${esc(b.dept)}" data-grp="${esc(b.grp)}">เปลี่ยนชื่อกลุ่ม</button>`}</td></tr>`;
    return head + b.items.map(t=>taskRowHtml(t, ro)).join('');
  }).join('');
}
const TASK_DEFAULT_GROUP = 'ทั่วไป';
const taskGroupOf = t => (t.task_group && String(t.task_group).trim()) || TASK_DEFAULT_GROUP;
function taskGroupOptions(t){
  const cur = taskGroupOf(t);
  const set = new Set(taskList.filter(x=>x.warehouse===t.warehouse && x.department===t.department).map(taskGroupOf));
  set.add(cur);
  return [...set].sort((a,b)=>a.localeCompare(b,'th'))
    .map(g=>`<option value="${esc(g)}"${g===cur?' selected':''}>${esc(g)}</option>`).join('') +
    `<option value="\u0000new">+ กลุ่มใหม่…</option>`;
}
function taskRowHtml(t, ro){
    const on = t.active !== false;
    const linked = jobs.reduce((n,j)=> n + (j.task_id===t.id ? ((j.rowIds&&j.rowIds.length)||1) : 0), 0);
    return `<tr class="${on?'':'row-inactive'}">
      <td>${esc(t.name)}${t.unit_label ? ` <span style="color:var(--ink-dim);font-size:12px;">· ${esc(t.unit_label)}</span>` : ''}</td>
      <td>${ro ? esc(taskGroupOf(t)) : `<select class="task-group-sel" data-task-group-sel="${esc(t.id)}" aria-label="กลุ่มงาน ${esc(t.name)}">${taskGroupOptions(t)}</select>`}</td>
      <td><span class="wh-tag">${esc(WH_PLAIN[t.warehouse]||t.warehouse||'–')}</span></td>
      <td>${deptBadge(t.department, t.warehouse)}</td>
      <td class="mono">${linked || ''}</td>
      ${ro ? '' : `<td>
        <button type="button" class="mini-btn ${on?'reject':'approve'}" data-task-toggle="${esc(t.id)}" data-next="${on?'false':'true'}">${on?'ปิดใช้งาน':'เปิดใช้งาน'}</button>
        <button type="button" class="mini-btn reject" data-task-del="${esc(t.id)}">ลบถาวร</button>
      </td>`}
    </tr>`;
}
// ---- add task template (mirrors mobile insert) ----
const AT_NEW = '\u0000new';
let atGroupPick = null;
function atScopeRows(){
  const wh = document.getElementById('atWh').value, dept = document.getElementById('atDept').value;
  return taskList.filter(t=>t.warehouse===wh && t.department===dept);
}
function atRefresh(){
  const groups = [...new Set(atScopeRows().map(taskGroupOf).concat(TASK_DEFAULT_GROUP))].sort((a,b)=>a.localeCompare(b,'th'));
  if (atGroupPick && atGroupPick !== AT_NEW && !groups.includes(atGroupPick)) atGroupPick = null;
  if (!atGroupPick) atGroupPick = TASK_DEFAULT_GROUP;
  document.getElementById('atGroupChips').innerHTML =
    groups.map(g=>`<button type="button" class="chip" data-at-group="${esc(g)}" aria-pressed="${atGroupPick===g}">${esc(g)}</button>`).join('') +
    `<button type="button" class="chip" data-at-group-new aria-pressed="${atGroupPick===AT_NEW}">+ กลุ่มใหม่</button>`;
  document.getElementById('atGroupNew').hidden = atGroupPick !== AT_NEW;
}
function atFillDepts(keepDept){
  const wh = document.getElementById('atWh').value;
  const keys = deptKeysFor(wh);
  const sel = document.getElementById('atDept');
  sel.innerHTML = keys.map(k=>`<option value="${esc(k)}">${esc(deptName(k, wh))}</option>`).join('');
  if (keepDept && keys.includes(keepDept)) sel.value = keepDept;
}
function openAddTaskModal(preset){
  const wh = preset && preset.wh ? preset.wh : (whFilter !== 'ALL' ? whFilter : WH_KEYS[0]);
  document.getElementById('atWh').innerHTML = WH_KEYS.map(w=>`<option value="${w}">${esc(WH_PLAIN[w])}</option>`).join('');
  document.getElementById('atWh').value = wh;
  atFillDepts(preset && preset.dept ? preset.dept : (deptFilter !== 'ALL' ? deptFilter : null));
  document.getElementById('atName').value = '';
  document.getElementById('atUnit').value = '';
  document.getElementById('atGroupNew').value = '';
  document.getElementById('atHint').textContent = '';
  atGroupPick = TASK_DEFAULT_GROUP;
  atRefresh();
  document.getElementById('addTaskModal').hidden = false;
  setTimeout(()=>document.getElementById('atName').focus(), 30);
}
function closeAddTaskModal(){ document.getElementById('addTaskModal').hidden = true; }
async function saveAddTask(){
  const hint = document.getElementById('atHint');
  const wh = document.getElementById('atWh').value, dept = document.getElementById('atDept').value;
  const name = document.getElementById('atName').value.trim();
  if (!dept){ hint.textContent = 'เลือกแผนกก่อน'; return; }
  if (!name){ hint.textContent = 'พิมพ์ชื่องานก่อน'; return; }
  const norm = s => String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
  if (atScopeRows().some(t=>norm(t.name) === norm(name))){ hint.textContent = 'มีงานชื่อนี้แล้ว'; return; }
  let grp = atGroupPick;
  if (grp === AT_NEW){
    grp = document.getElementById('atGroupNew').value.trim();
    if (!grp){ hint.textContent = 'พิมพ์ชื่อกลุ่มใหม่ก่อน'; return; }
  }
  const taskGroup = (!grp || grp === TASK_DEFAULT_GROUP) ? null : grp;
  const unitLabel = document.getElementById('atUnit').value.trim() || null;
  const btn = document.getElementById('atSave');
  btn.disabled = true; hint.textContent = 'กำลังเพิ่ม...';
  try{
    const id = wh.toLowerCase() + '_' + dept.toLowerCase() + '_' + Date.now();
    const { error } = await sb.from('tasks').insert({ id, warehouse: wh, department: dept, name, active: true, unit_label: unitLabel, task_group: taskGroup });
    if (error) throw error;
    closeAddTaskModal();
    await refreshTasksAdmin(); await loadTasksFromDb(); render();
    refreshDeptModal();
    toast(`เพิ่ม "${name}" แล้ว`, 'ok');
  }catch(err){
    const denied = err && (err.code === '42501' || /row-level security|permission/i.test(err.message||''));
    hint.textContent = denied ? 'คุณไม่มีสิทธิ์เพิ่มงานในแผนกนี้' : 'เพิ่มไม่สำเร็จ: ' + mapDbError(err);
  }finally{ btn.disabled = false; }
}
// ---- department card modal (templates grouped by task_group) ----
let deptModalKey = null;
function renderDeptModal(){
  const [wh, code] = deptModalKey.split(':');
  const d = DEPT_ROWS.find(x=>x.warehouse===wh && x.code===code) || { warehouse:wh, code, name:code, color:'#6B7280' };
  const tasks = taskList.filter(t=>t.warehouse===wh && t.department===code);
  const workers = allEmployees.filter(e=>e.warehouse===wh && e.department===code).length;
  const groups = new Map();
  tasks.forEach(t=>{ const g = taskGroupOf(t); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(t); });
  const gl = [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],'th'));
  const body = !tasks.length ? '<p class="empty-note">ยังไม่มีแม่แบบงาน</p>' : gl.map(([g, items])=>{
    items = items.slice().sort((a,b)=> ((a.active===false)-(b.active===false)) || String(a.name).localeCompare(String(b.name),'th'));
    return `<div class="dm-group"><div class="dm-group-head"><span>${esc(g)}</span><span class="dm-count">${items.length}</span></div>` +
      items.map(t=>{ const on = t.active !== false;
        return `<div class="dm-task${on?'':' row-inactive'}"><span class="dm-task-name">${esc(t.name)}</span>
          <span class="dm-task-unit">${esc(t.unit_label || 'จำนวน')}</span>
          <span class="status-badge ${on?'approved':'rejected'}">${on?'ใช้งาน':'ปิดใช้งาน'}</span></div>`; }).join('') + '</div>';
  }).join('');
  document.getElementById('deptModalHead').innerHTML =
    `<span class="dm-dot" style="background:${esc(d.color||'#6B7280')}"></span>
     <div><h3>${esc(d.code)}${d.name && d.name!==d.code ? " · "+esc(d.name) : ""}</h3>
     <div class="dm-sub">${esc(WH_PLAIN[wh]||wh)} · ${tasks.length} แม่แบบ · ${workers} คนงาน</div></div>`;
  document.getElementById('deptModalBody').innerHTML = body;
  document.getElementById('deptModalAdd').hidden = isReadOnly();
}
function openDeptModal(key){
  deptModalKey = key;
  renderDeptModal();
  document.getElementById('deptModal').hidden = false;
  setTimeout(()=>document.getElementById('deptModalClose').focus(), 30);
}
function closeDeptModal(){ deptModalKey = null; document.getElementById('deptModal').hidden = true; }
function refreshDeptModal(){ if (deptModalKey && !document.getElementById('deptModal').hidden) renderDeptModal(); }
document.addEventListener('click', e=>{
  const v = e.target.closest('[data-dept-view]');
  if (v){ openDeptModal(v.dataset.deptView); return; }
  const row = e.target.closest('tr[data-dept-open]');
  if (row && !e.target.closest('input,button,select,a,label')){ openDeptModal(row.dataset.deptOpen); return; }
  if (e.target.closest('#deptModalClose') || e.target.id === 'deptModal'){ closeDeptModal(); return; }
  if (e.target.closest('#deptModalAdd') && deptModalKey){
    const [wh, dept] = deptModalKey.split(':');
    openAddTaskModal({ wh, dept });
  }
});
document.addEventListener('keydown', e=>{
  const m = document.getElementById('deptModal');
  const at = document.getElementById('addTaskModal');
  if (e.key === 'Escape' && m && !m.hidden && at && at.hidden) closeDeptModal();
});
document.addEventListener('click', e=>{
  if (e.target.closest('#addTaskOpenBtn')){ openAddTaskModal(); return; }
  if (e.target.closest('#atCancel') || e.target.id === 'addTaskModal'){ closeAddTaskModal(); return; }
  if (e.target.closest('#atSave')){ saveAddTask(); return; }
  const c = e.target.closest('[data-at-group], [data-at-group-new]');
  if (c){
    atGroupPick = c.hasAttribute('data-at-group-new') ? AT_NEW : c.dataset.atGroup;
    atRefresh();
    if (atGroupPick === AT_NEW) document.getElementById('atGroupNew').focus();
  }
});
document.addEventListener('change', e=>{
  if (e.target.id === 'atWh'){ atFillDepts(); atRefresh(); }
  else if (e.target.id === 'atDept') atRefresh();
});
document.addEventListener('keydown', e=>{
  const m = document.getElementById('addTaskModal');
  if (!m || m.hidden) return;
  if (e.key === 'Escape'){ closeAddTaskModal(); e.stopImmediatePropagation(); }
  else if (e.key === 'Enter' && e.target.tagName === 'INPUT') saveAddTask();
});
// in-page text prompt (window.prompt is blocked in some webviews)
function askGroupName(title, initial, existing){
  return new Promise(resolve=>{
    const ov = document.getElementById('groupModal');
    const inp = document.getElementById('groupInput');
    const hint = document.getElementById('groupHint');
    const ok = document.getElementById('groupOk'), no = document.getElementById('groupNo');
    document.getElementById('groupTitle').textContent = title;
    document.getElementById('groupList').innerHTML = (existing||[]).map(g=>`<option value="${esc(g)}"></option>`).join('');
    inp.value = initial || ''; hint.textContent = '';
    ov.hidden = false; setTimeout(()=>{ inp.focus(); inp.select(); }, 30);
    function done(v){ ov.hidden = true; ok.removeEventListener('click', onOk); no.removeEventListener('click', onNo); ov.removeEventListener('keydown', onKey); resolve(v); }
    function onOk(){ const v = inp.value.trim(); if (!v){ hint.textContent = 'พิมพ์ชื่อกลุ่มก่อน'; return; } done(v); }
    function onNo(){ done(null); }
    function onKey(e){ if (e.key==='Escape') done(null); else if (e.key==='Enter') onOk(); }
    ok.addEventListener('click', onOk); no.addEventListener('click', onNo); ov.addEventListener('keydown', onKey);
  });
}
async function setTaskGroup(id, grp){
  try{
    const { error } = await sb.from('tasks').update({ task_group: grp === TASK_DEFAULT_GROUP ? null : grp }).eq('id', id);
    if (error) throw error;
    await refreshTasksAdmin(); await loadTasksFromDb(); render();
  }catch(err){ toast('ย้ายกลุ่มไม่สำเร็จ: ' + mapDbError(err)); render(); }
}
async function renameTaskGroup(wh, dept, oldName, newName){
  try{
    let q = sb.from('tasks').update({ task_group: newName === TASK_DEFAULT_GROUP ? null : newName }).eq('warehouse', wh).eq('department', dept);
    q = oldName === TASK_DEFAULT_GROUP ? q.is('task_group', null) : q.eq('task_group', oldName);
    const { error } = await q;
    if (error) throw error;
    await refreshTasksAdmin(); await loadTasksFromDb(); render();
    toast('เปลี่ยนชื่อกลุ่มแล้ว', 'ok');
  }catch(err){ toast('เปลี่ยนชื่อกลุ่มไม่สำเร็จ: ' + mapDbError(err)); }
}
document.addEventListener('change', async e=>{
  const sel = e.target.closest('[data-task-group-sel]');
  if (!sel) return;
  const t = taskList.find(x=>String(x.id)===String(sel.dataset.taskGroupSel));
  if (!t) return;
  let v = sel.value;
  if (v === '\u0000new'){
    const existing = [...new Set(taskList.filter(x=>x.warehouse===t.warehouse && x.department===t.department).map(taskGroupOf))];
    v = await askGroupName('ย้ายไปกลุ่มใหม่ — ' + t.name, '', existing);
    if (!v){ render(); return; }
  }
  if (v === taskGroupOf(t)) return;
  setTaskGroup(t.id, v);
});
document.addEventListener('click', async e=>{
  const b = e.target.closest('[data-grp-rename]');
  if (!b) return;
  const { wh, dept, grp } = b.dataset;
  const existing = [...new Set(taskList.filter(x=>x.warehouse===wh && x.department===dept).map(taskGroupOf))];
  const nv = await askGroupName(`เปลี่ยนชื่อกลุ่ม "${grp}"`, grp, existing);
  if (!nv || nv === grp) return;
  if (existing.includes(nv) && !(await confirmModal(`มีกลุ่ม "${nv}" อยู่แล้ว — รวมงานเข้ากลุ่มนั้น?`, { yes:'รวมกลุ่ม' }))) return;
  renameTaskGroup(wh, dept, grp, nv);
});
async function toggleTaskActive(id, next){
  try{
    const { error } = await sb.from('tasks').update({ active: next }).eq('id', id);
    if (error) throw error;
    await refreshTasksAdmin(); await loadTasksFromDb(); render();
  }catch(err){ toast('ทำรายการไม่สำเร็จ: ' + mapDbError(err)); }
}
async function deleteTask(id){
  const t = taskList.find(x=>String(x.id)===String(id));
  const go = await confirmModal(
    `ลบชนิดงาน "${(t&&t.name)||''}" ถาวร?\nถ้ามีงานที่บันทึกไว้แล้วผูกอยู่ จะลบไม่ได้ — ให้ใช้ "ปิดใช้งาน" แทน`,
    { danger:true, yes:'ลบถาวร' });
  if (!go) return;
  try{
    const { error } = await sb.from('tasks').delete().eq('id', id);
    if (error) throw error;
    await refreshTasksAdmin(); await loadTasksFromDb(); render();
    toast('ลบแล้ว', 'ok');
  }catch(err){
    if (err.code === '23503' || /foreign key/i.test(err.message||'')){
      toast('ชนิดงานนี้มีงานผูกอยู่ — ใช้ "ปิดใช้งาน" แทนการลบถาวร');
    } else {
      toast('ลบไม่สำเร็จ: ' + mapDbError(err));
    }
  }
}

// ---------- ADMIN-only: departments (add / toggle / delete) ----------
// Per-warehouse (2026-09-14): the table shows only the currently selected
// คลัง chip's rows (both when "ทั้งหมด" is picked, each tagged with its
// warehouse). A row's identity is (warehouse, code) — never code alone,
// since the same code can exist independently in both warehouses.
function renderDeptAdmin(){
  const wrap = document.getElementById('deptAdmin');
  if (!wrap) return;
  // only show once the departments table exists (loadDepartments populated DEPT_ROWS)
  const isAdm = profile && profile.role === 'ADMIN' && DEPT_ROWS.length > 0;
  wrap.hidden = !isAdm;
  if (!isAdm) return;
  const ndWh = document.getElementById('ndWh');
  if (ndWh && !ndWh.options.length) ndWh.innerHTML = WH_KEYS.map(w=>`<option value="${w}">${WH_PLAIN[w]}</option>`).join('');
  if (ndWh && whFilter !== 'ALL') ndWh.value = whFilter;
  const tb = document.querySelector('#deptTable tbody');
  if (!tb) return;
  const usage = (wh, code) => {
    const inScope = scopes.filter(s=>s.warehouse===wh && s.department===code).length;
    const inTasks = taskList.filter(t=>t.warehouse===wh && t.department===code).length;
    const inEmp   = allEmployees.filter(e=>e.warehouse===wh && e.department===code).length;
    return { inScope, inTasks, inEmp, total: inScope+inTasks+inEmp };
  };
  const rows = DEPT_ROWS.filter(d => whFilter==='ALL' || d.warehouse===whFilter);
  tb.innerHTML = rows.map(d=>{
      const u = usage(d.warehouse, d.code);
      const on = d.active !== false;
      const key = d.warehouse + ':' + d.code;
      const nTpl = taskList.filter(t=>t.warehouse===d.warehouse && t.department===d.code).length;
      return `<tr class="dept-row-click ${on?'':'row-inactive'}" data-dept-open="${esc(key)}">
        <td><span class="wh-tag">${esc(WH_PLAIN[d.warehouse]||d.warehouse)}</span></td>
        <td class="mono"><button type="button" class="dept-open-btn" data-dept-view="${esc(key)}" aria-label="ดูแม่แบบงานแผนก ${esc(d.name)} (${nTpl})"><b>${esc(d.code)}</b></button></td>
        <td><input type="text" class="code-input" data-dept-name="${esc(key)}" value="${esc(d.name)}" style="width:150px"></td>
        <td><input type="color" data-dept-color="${esc(key)}" value="${esc(d.color||'#6B7280')}"><span class="color-contrast-hint" data-dept-color-hint="${esc(key)}"></span></td>
        <td class="mono">${u.total ? `${u.total} (scope ${u.inScope} · งาน ${u.inTasks} · คน ${u.inEmp})` : '–'}</td>
        <td><span class="status-badge ${on?'approved':'rejected'}">${on?'ใช้งาน':'ปิดใช้งาน'}</span></td>
        <td>
          <button type="button" class="mini-btn" data-dept-view="${esc(key)}" aria-label="ดูแม่แบบงานแผนก ${esc(d.name)} (${nTpl})">ดูแม่แบบ (${nTpl})</button>
          <button type="button" class="mini-btn approve" data-dept-save="${esc(key)}">บันทึก</button>
          <button type="button" class="mini-btn ${on?'reject':'approve'}" data-dept-toggle="${esc(key)}" data-next="${on?'false':'true'}">${on?'ปิดใช้งาน':'เปิดใช้งาน'}</button>
          ${u.total ? '' : `<button type="button" class="mini-btn reject" data-dept-del="${esc(key)}">ลบถาวร</button>`}
        </td>
      </tr>`;
    }).join('');
  rows.forEach(d=>{
    const key = d.warehouse + ':' + d.code;
    refreshColorHint(document.querySelector(`[data-dept-color="${key}"]`), document.querySelector(`[data-dept-color-hint="${key}"]`));
  });
}
async function reloadDeptsEverywhere(){
  await loadDepartments();
  buildDeptChips();
  await loadTasksFromDb();
  renderDeptAdmin(); render();
}
async function createDeptFromForm(){
  if (!profile || profile.role !== 'ADMIN') return;
  const hint = document.getElementById('addDeptHint');
  const wh = document.getElementById('ndWh').value;
  const code = document.getElementById('ndCode').value.trim().toUpperCase();
  const name = document.getElementById('ndName').value.trim();
  const color = document.getElementById('ndColor').value || '#6B7280';
  if (!WH_KEYS.includes(wh)){ hint.textContent = 'เลือกคลัง'; return; }
  if (!/^[A-Z][A-Z0-9_]{1,11}$/.test(code)){ hint.textContent = 'รหัสต้องขึ้นต้นด้วยตัวอักษร A–Z ยาว 2–12 ตัว (A–Z ตัวเลข _)'; return; }
  if (!name){ hint.textContent = 'กรอกชื่อเต็ม'; return; }
  if (DEPT_ROWS.some(d=>d.code===code && d.warehouse===wh)){ hint.textContent = `รหัส "${code}" มีอยู่แล้วใน${WH_PLAIN[wh]}`; return; }
  if (!deptColorHint(color).ok){ hint.textContent = `สีนี้อ่านยากเกินไป (contrast ${deptColorRatio(color).toFixed(1)}:1, ต้อง ≥4.5:1) — เลือกสีเข้มขึ้น`; return; }
  hint.textContent = 'กำลังเพิ่ม...';
  const sort = (Math.max(0, ...DEPT_ROWS.filter(d=>d.warehouse===wh).map(d=>d.sort||0)) + 10);
  const { error } = await sb.from('departments').insert({ code, name, color, sort, active: true, warehouse: wh });
  if (error){ hint.textContent = 'ไม่สำเร็จ: ' + mapDbError(error); return; }
  ['ndCode','ndName'].forEach(id=>{ document.getElementById(id).value=''; });
  document.getElementById('addDeptForm').hidden = true;
  hint.textContent = '';
  toast(`เพิ่มแผนก ${code} ใน${WH_PLAIN[wh]}แล้ว`, 'ok');
  await reloadDeptsEverywhere();
}
async function saveDeptRow(key){
  if (!profile || profile.role !== 'ADMIN') return;
  const [wh, code] = key.split(':');
  const name = document.querySelector(`[data-dept-name="${key}"]`).value.trim();
  const color = document.querySelector(`[data-dept-color="${key}"]`).value;
  if (!name){ toast('ชื่อแผนกว่างไม่ได้'); return; }
  if (!deptColorHint(color).ok){ toast(`สีนี้อ่านยากเกินไป (contrast ${deptColorRatio(color).toFixed(1)}:1, ต้อง ≥4.5:1) — เลือกสีเข้มขึ้น`); return; }
  const { error } = await sb.from('departments').update({ name, color }).eq('warehouse', wh).eq('code', code);
  if (error){ toast('บันทึกไม่สำเร็จ: ' + mapDbError(error)); return; }
  toast('บันทึกแล้ว', 'ok');
  await reloadDeptsEverywhere();
}
async function toggleDeptActive(key, next){
  if (!profile || profile.role !== 'ADMIN') return;
  const [wh, code] = key.split(':');
  const { error } = await sb.from('departments').update({ active: next }).eq('warehouse', wh).eq('code', code);
  if (error){ toast('ทำรายการไม่สำเร็จ: ' + mapDbError(error)); return; }
  await reloadDeptsEverywhere();
}
async function deleteDept(key){
  if (!profile || profile.role !== 'ADMIN') return;
  const [wh, code] = key.split(':');
  const go = await confirmModal(`ลบแผนก "${code}" (${WH_PLAIN[wh]}) ถาวร?\nลบได้เฉพาะแผนกที่ยังไม่มี scope / ชนิดงาน / พนักงาน ผูกอยู่ · ไม่กระทบแผนกรหัสเดียวกันในอีกคลัง`, { danger:true, yes:'ลบถาวร' });
  if (!go) return;
  const { error } = await sb.from('departments').delete().eq('warehouse', wh).eq('code', code);
  if (error){
    if (error.code === '23503' || /foreign key/i.test(error.message||'')) toast('แผนกนี้ยังมีข้อมูลผูกอยู่ — ใช้ "ปิดใช้งาน" แทน');
    else toast('ลบไม่สำเร็จ: ' + mapDbError(error));
    return;
  }
  toast('ลบแล้ว', 'ok');
  await reloadDeptsEverywhere();
}

async function createEmpFromForm(){
  const hint = document.getElementById('addEmpHint');
  const name = document.getElementById('neName').value.trim();
  const department = document.getElementById('neDept').value;
  const warehouse = document.getElementById('neWh').value;
  if (!name){ hint.textContent = 'พิมพ์ชื่อพนักงานก่อน'; return; }
  if (allEmployees.some(e=>e.name===name && e.department===department && e.warehouse===warehouse)){ hint.textContent = `"${name}" มีอยู่ในรายชื่อคลัง/ฝั่งนี้แล้ว`; return; }
  hint.textContent = 'กำลังเพิ่ม...';
  try{
    const { error } = await sb.from('employees').insert({ name, department, warehouse });
    if (error) throw error;
    hint.textContent = `เพิ่ม "${name}" แล้ว`;
    document.getElementById('neName').value = '';
    await Promise.all([refreshEmployeesAll(), refreshRoster()]); render();
    setTimeout(()=>{ hint.textContent = ''; }, 1200);
  }catch(err){ hint.textContent = 'ไม่สำเร็จ: ' + mapDbError(err); }
}

async function toggleEmpActive(id, next){
  try{
    const { error } = await sb.from('employees').update({ active: next }).eq('id', id);
    if (error) throw error;
    await Promise.all([refreshEmployeesAll(), refreshRoster()]); render();
  }catch(err){ toast('ทำรายการไม่สำเร็จ: ' + mapDbError(err)); }
}

async function deleteEmp(id){
  const em = allEmployees.find(x=>String(x.id)===String(id));
  const go = await confirmModal(
    `ลบ "${(em&&em.name)||'พนักงานคนนี้'}" ออกจากรายชื่อถาวร?\nประวัติงานที่บันทึกชื่อไว้แล้วยังอยู่ครบ`,
    { danger:true, yes:'ลบถาวร' });
  if (!go) return;
  try{
    const { error } = await sb.from('employees').delete().eq('id', id);
    if (error) throw error;
    await Promise.all([refreshEmployeesAll(), refreshRoster()]); render();
    toast('ลบแล้ว', 'ok');
  }catch(err){
    if (err.code === '23503' || /foreign key/i.test(err.message||'')){
      toast('คนนี้มีประวัติงานผูกอยู่ — ใช้ "ปิดใช้งาน" แทนการลบถาวร');
    } else {
      toast('ลบไม่สำเร็จ: ' + mapDbError(err));
    }
  }
}

function renderEmployeesTable(closed){
  const people = peopleInScope();
  const tbody = document.querySelector('#employeesTable tbody');
  renderSortHead(document.getElementById('employeesHead'), EMP_COLS, empSort, 'emp-sort');
  if (people.length===0){ tbody.innerHTML = emptyRow(5, 'ยังไม่มีพนักงานในขอบเขตนี้'); return; }
  const enriched = people.map(r=>({
    r,
    inRange: closed.filter(j=>(j.crew||[]).includes(r.name)).length,
    total: jobs.filter(j=>(j.crew||[]).includes(r.name)).length,
  }));
  tbody.innerHTML = applySort(enriched, EMP_COLS, empSort).map(({r,inRange,total})=>{
    const initials = esc(r.name.trim().slice(0,1));
    const deptCell = r.department
      ? `${deptBadge(r.department, r.warehouse)}`
      : '<span class="td-sub">–</span>';
    return `<tr class="emp-row" data-emp="${esc(r.name)}" tabindex="0" role="button" aria-label="ดูรายละเอียด ${esc(r.name)}">
      <td><span class="emp-name-cell"><span class="emp-avatar">${initials}</span>${esc(r.name)}</span></td>
      <td><span class="wh-tag">${esc(WH_PLAIN[r.warehouse]||r.warehouse||'–')}</span></td>
      <td>${deptCell}</td>
      <td class="mono">${num(inRange)}</td>
      <td class="mono">${num(total)}</td>
    </tr>`;
  }).join('');
}

// ---------- Skill Matrix — ใครมีสกิลอะไรบ้าง (แต้ม = จำนวนครั้งที่เคยทำสำเร็จ) ----------
// A grid-of-everyone table reads as a wall of tiny bars — no single person
// stands out. This is one SCORECARD per person instead (avatar, total-points
// KPI, then a real bar chart of just *their* skills) — same shape as the
// employee detail panel's own "งานตามคลัง/งานตามแผนก" cards, reusing hbars().
// Bars are scaled against that person's own best skill, so within one card
// the chart genuinely measures *them* — their strongest skill always reads
// as the longest bar, exactly the "วัดตัวตนระดับบุคคล" framing.
function renderSkillMatrix(){
  const wrap = document.getElementById('skillMatrixWrap');
  if (!wrap) return;
  const tasksInScope = taskList.filter(t => t.active !== false && (whFilter==='ALL' || t.warehouse===whFilter) && (deptFilter==='ALL' || t.department===deptFilter));
  if (!tasksInScope.length){ wrap.innerHTML = `<p class="empty-note">ยังไม่มีชนิดงานในขอบเขตนี้</p>`; return; }

  const q = searchTerm;
  const people = peopleInScope().filter(p => !q || p.name.toLowerCase().includes(q));
  if (!people.length){ wrap.innerHTML = `<p class="empty-note">${q?`ไม่พบพนักงานที่ตรงกับ "${esc(q)}"`:'ยังไม่มีพนักงานในขอบเขตนี้'}</p>`; return; }

  const countFor = (name, t) => jobs.filter(j => j.task_id===t.id && (j.crew||[]).includes(name)).length;

  const cards = people.map(p=>{
    // own-department tasks first (even at 0 — a real "never done this" gap),
    // then any other skill they've picked up elsewhere, both sorted by count.
    const own = tasksInScope.filter(t => t.department===p.department && t.warehouse===p.warehouse);
    const other = tasksInScope.filter(t => !(t.department===p.department && t.warehouse===p.warehouse));
    const rowFor = t => {
      const n = countFor(p.name, t);
      return { label: t.name, n, color: deptColor(t.department, t.warehouse), disp: n>0 ? String(n) : 'ยังไม่เคยทำ', _gap: n===0 };
    };
    const ownRows = own.map(rowFor).sort((a,b)=> b.n-a.n);
    const otherRows = other.map(rowFor).filter(r=>r.n>0).sort((a,b)=> b.n-a.n);
    const rows = [...ownRows, ...otherRows];
    const total = rows.reduce((s,r)=>s+r.n, 0);
    const gapCount = ownRows.filter(r=>r._gap).length;
    return { p, rows, total, gapCount };
  }).sort((a,b)=> b.total - a.total || a.p.name.localeCompare(b.p.name,'th'));

  const meta = `<div class="skm-meta">${people.length} คน × ${tasksInScope.length} ชนิดงาน · เรียงตามแต้มรวมมากไปน้อย</div>`;

  // ---- heatmap: person × task, shade by count, coverage %, single-person risk row ----
  const cnt = {};   // cnt[name][task_id] = times done (one pass over jobs)
  jobs.forEach(j => (j.crew||[]).forEach(n => { (cnt[n] = cnt[n] || {})[j.task_id] = ((cnt[n]||{})[j.task_id]||0) + 1; }));
  const heatLv = n => n<=0 ? 0 : n<=2 ? 1 : n<=5 ? 2 : n<=10 ? 3 : 4;
  const everyone = peopleInScope();   // risk is judged on everyone in scope, not the search result
  const ablePeople = t => everyone.filter(p => ((cnt[p.name]||{})[t.id]||0) > 0).length;
  const ableN = tasksInScope.map(ablePeople);
  const hmRows = cards.map(({p}) => {
    const cells = tasksInScope.map(t => {
      const n = (cnt[p.name]||{})[t.id] || 0;
      return `<td class="skm-hm-c skm-heat-${heatLv(n)}" title="${esc(p.name)} · ${esc(t.name)}: ${n}">${n>0?n:''}</td>`;
    }).join('');
    const done = tasksInScope.filter(t => ((cnt[p.name]||{})[t.id]||0) > 0).length;
    const pct = Math.round(done / tasksInScope.length * 100);
    return `<tr><th scope="row" class="skm-hm-name"><span class="skm-hm-who"><span class="emp-avatar" aria-hidden="true">${esc(p.name.trim().slice(0,1))}</span><span class="skm-hm-nm">${esc(p.name)}</span>${deptBadge(p.department, p.warehouse)}</span></th>${cells}<td class="skm-hm-cov num"><span class="skm-cov"><span class="skm-cov-bar"><i style="width:${pct}%"></i></span><b>${pct}%</b></span></td></tr>`;
  }).join('');
  const hmHead = tasksInScope.map((t,i) => `<th scope="col" class="skm-hm-v${ableN[i]===1?' skm-risk-col':''}"><div>${esc(t.name)}</div></th>`).join('');
  const hmRisk = tasksInScope.map((t,i) => ableN[i]===1 ? `<td class="skm-risk" title="ทำได้เพียง 1 คน">เสี่ยง</td>` : `<td class="skm-hm-able num">${ableN[i]}</td>`).join('');
  const riskN = ableN.filter(n=>n===1).length;
  const legendHTML = `<div class="skm-legend"><span class="skm-lg"><i class="skm-heat-0"></i>ยังไม่เคย</span><span class="skm-lg"><i class="skm-heat-1"></i>1–2</span><span class="skm-lg"><i class="skm-heat-2"></i>3–5</span><span class="skm-lg"><i class="skm-heat-3"></i>6–10</span><span class="skm-lg"><i class="skm-heat-4"></i>10+</span><span class="skm-legend-risk">${riskN ? riskN+' งานเสี่ยง: ' : 'เสี่ยง = '}ทำได้เพียง 1 คน</span></div>`;
  const heatmap = `<div class="skm-hm-wrap">${legendHTML}<div class="skm-hm-scroll"><table class="skm-hm">
    <thead><tr><th class="skm-hm-corner">พนักงาน</th>${hmHead}<th class="skm-hm-covh">ครอบคลุม</th></tr></thead>
    <tbody>${hmRows}</tbody>
    <tfoot><tr><th scope="row" class="skm-hm-name">ทำได้ (คน)</th>${hmRisk}<td></td></tr></tfoot>
  </table></div></div>`;

  wrap.innerHTML = `${meta}${heatmap}<div class="skm-card-grid">` + cards.map(({p, rows, total, gapCount})=>{
    const initials = esc(p.name.trim().slice(0,1));
    return `<div class="skm-card">
      <div class="skm-card-head">
        <span class="emp-avatar" style="width:38px;height:38px;font-size:14px;">${initials}</span>
        <div class="skm-card-t">
          <div class="skm-card-name">${esc(p.name)}</div>
          <div class="skm-card-tags"><span class="wh-tag">${esc(WH_PLAIN[p.warehouse]||p.warehouse||'–')}</span>${deptBadge(p.department, p.warehouse)}</div>
        </div>
        <div class="skm-card-total"><b class="num">${total}</b><span>แต้มรวม</span></div>
      </div>
      ${gapCount ? `<div class="skm-card-gap-note">⚠ ยังไม่เคยทำ ${gapCount} งานในฝั่งตัวเอง</div>` : ''}
      <div class="chart-hbars skm-card-bars">${rows.length ? rows.map(r=>`<div class="hbar-row${r._gap?' skm-hbar-gap':''}" title="${esc(r.label)}${r._gap?' — ยังไม่เคยทำ':''}">
        <span class="hbar-lab">${esc(r.label)}</span>
        <span class="hbar-track"><i style="width:${r._gap?2:Math.max(4, r.n/Math.max(1,...rows.map(x=>x.n))*100)}%;background:${r._gap?'var(--ink-faint)':esc(r.color)}"></i></span>
        <b class="hbar-n num">${esc(r.disp)}</b>
      </div>`).join('') : '<p class="c-empty">ไม่มีชนิดงานในขอบเขตนี้</p>'}</div>
    </div>`;
  }).join('') + `</div>`;
}

// ---- employee detail panel (personal KPIs + day/month/year breakdown) ----
// Full-width overlay; all figures computed client-side from `jobs`.
let empPanel = { name:null, range:'all', tab:'day' };
// a group job is attributed to one person by dividing its OUTPUT by the crew size
// (time is never divided — the whole crew is present the full duration)
const empCrew = j => (j.crew||[]).length || 1;

function empPanelFrom(range){
  if (range==='today') return todayISO();
  if (range==='week')  return daysAgoISO(6);
  if (range==='month') return daysAgoISO(29);
  if (range==='year')  return nowBkk().getFullYear() + '-01-01';
  return null;   // 'all'
}
const empPanelJobs = () => jobs.filter(j => (j.crew||[]).includes(empPanel.name));
// same date window drives the whole panel — KPIs, the คลัง/แผนก split, and the table
function empRangedJobs(){
  const from = empPanelFrom(empPanel.range);
  const all  = empPanelJobs();
  return from ? all.filter(j => ((j.details&&j.details.date)||'') >= from) : all;
}

function openEmpPanel(name){
  if (!jobs.some(j=>(j.crew||[]).includes(name))) return;
  empPanel = { name, range:'all', tab:'day' };
  const mine = jobs.filter(j=>(j.crew||[]).includes(name));
  document.getElementById('emName').textContent   = name;
  document.getElementById('emAvatar').textContent = name.trim().slice(0,1);

  // home department from the roster (mobile logs one department per person)
  const rEntry   = roster.find(r=>r.name===name);
  const homeDept = (rEntry && rEntry.department) || [...new Set(mine.map(j=>j.department))][0];
  document.getElementById('emDept').innerHTML = deptBadge(homeDept, rEntry && rEntry.warehouse)
    + (rEntry && rEntry.warehouse ? ` <span class="emp-home-wh">คลังหลัก ${esc(rEntry.warehouse)}</span>` : '');
  document.querySelectorAll('#emRange .chip').forEach(c=>c.setAttribute('aria-pressed', String(c.dataset.er==='all')));
  document.querySelectorAll('#emTabs .chip').forEach(c=>c.setAttribute('aria-pressed', String(c.dataset.et==='day')));
  renderEmpPanel();
  document.getElementById('empModal').hidden = false;
}
function closeEmpModal(){ document.getElementById('empModal').hidden = true; }

function renderEmpPanel(){
  const rng = empRangedJobs();
  const wt  = j => 1 / empCrew(j);   // per-person share

  const wm     = rng.filter(j => j.details && j.details.mins!=null);
  const totMin = wm.reduce((s,j)=>s+num(j.details.mins),0);
  const avg    = wm.length ? Math.round(totMin/wm.length) : 0;
  const days   = new Set(rng.map(j=>(j.details&&j.details.date)).filter(Boolean)).size;
  const top    = unitTotals(rng, wt)[0];

  const kpi = (n,l)=>`<div class="ek"><div class="ek-n num">${n}</div><div class="ek-l">${esc(l)}</div></div>`;
  document.getElementById('emStats').innerHTML =
    kpi(rng.length, 'งานทั้งหมด') +
    kpi(days, 'วันที่ทำงาน') +
    kpi(days ? (rng.length/days).toFixed(1) : '0', 'งาน/วัน') +
    kpi(avg, 'เฉลี่ย นาที/งาน') +
    kpi(Math.round(totMin/60), 'ชม.รวม') +
    kpi(top ? `${top.n.toLocaleString('en-US')} ${esc(top.label)}` : '–', 'ผลงานหลัก (ส่วนของคนนี้)');

  // proportion breakdowns — which warehouses, which departments (scoped to range)
  const pct = n => rng.length ? Math.round(n/rng.length*100) : 0;
  const whRows = WH_KEYS
    .map(w=>({ label:WH_PLAIN[w], n:rng.filter(j=>j.warehouse===w).length, color:'var(--accent)' }))
    .filter(r=>r.n>0)
    .map(r=>({ ...r, disp:`${r.n} · ${pct(r.n)}%` }));
  const dCount = {};
  rng.forEach(j=>{ if (j.department) dCount[j.department] = (dCount[j.department]||0) + 1; });
  const deptRows = Object.entries(dCount).sort((a,b)=>b[1]-a[1])
    .map(([d,n])=>({ label:deptName(d), n, color:deptColor(d), disp:`${n} · ${pct(n)}%` }));
  hbars(document.getElementById('emByWh'), whRows);
  hbars(document.getElementById('emByDept'), deptRows);

  renderEmpTable();
}

// this person's share of one job's output, formatted with unit
function empJobShare(t, d, cw){
  if (!t) return '–';
  const nf = v => { v = num(v)/cw; return (v < 100 ? Math.round(v*10)/10 : Math.round(v)).toLocaleString('en-US'); };
  if (t.unit==='containers') return num(d.vehicles) ? `${nf(d.vehicles)} คัน` : `${nf(d.containers)} ตู้`;
  return `${nf(d.qty)} ${t.unitLabel||''}`.trim() || '–';
}

function renderEmpTable(){
  const box = document.getElementById('emTable');
  const set = empRangedJobs().filter(j => j.details && j.details.date);
  if (!set.length){ box.innerHTML = '<p class="c-empty">ไม่มีข้อมูลในช่วงนี้</p>'; return; }

  // รายวัน — one row per job, with its open/close time
  if (empPanel.tab === 'day'){
    const key = j => (j.details.date||'') + (j.details.start||'') + (j.id||'');
    const rows = [...set].sort((a,b)=>key(b).localeCompare(key(a))).slice(0,200);
    let lastD = null;
    box.innerHTML = `
      <table class="emp-tbl">
        <thead><tr><th>วันที่</th><th>งานที่ทำ</th><th>เปิด–ปิด</th><th>ผลลัพธ์</th><th>นาที</th></tr></thead>
        <tbody>${rows.map(j=>{
          const d = j.details, t = taskById(j.task_id);
          const show = d.date !== lastD; lastD = d.date;
          return `<tr class="${show?'et-first':''}">
            <td>${show ? esc(fmtThaiDate(d.date)) : ''}</td>
            <td class="et-task">${esc(t ? t.label : j.task_id)}</td>
            <td class="mono">${esc(d.start||'–')}–${esc(d.end||'–')}</td>
            <td class="mono">${esc(empJobShare(t, d, empCrew(j)))}</td>
            <td class="mono">${d.mins==null ? '–' : num(d.mins)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    return;
  }

  // รายเดือน / รายปี — aggregate by period × task type
  const perOf = empPanel.tab==='month' ? (d=>d.slice(0,7)) : (d=>d.slice(0,4));
  const g = new Map();
  set.forEach(j=>{
    const d = j.details, cw = empCrew(j);
    const period = perOf(d.date), k = period + '|' + j.task_id;
    const b = g.get(k) || { period, task_id:j.task_id, n:0, min:0, wm:0, qty:0, containers:0, vehicles:0 };
    b.n++;
    if (d.mins!=null){ b.min += num(d.mins); b.wm++; }
    b.qty += num(d.qty)/cw; b.containers += num(d.containers)/cw; b.vehicles += num(d.vehicles)/cw;
    g.set(k, b);
  });
  const rows = [...g.values()].sort((a,b)=> b.period.localeCompare(a.period) || b.n - a.n);

  const label = empPanel.tab==='month' ? 'เดือน' : 'ปี';
  const fmtP  = p => empPanel.tab==='month'
    ? `${TH_MONTHS[+p.slice(5,7)-1]} ${(+p.slice(0,4))+543}` : `${(+p)+543}`;
  const nf = n => (n < 100 ? Math.round(n*10)/10 : Math.round(n)).toLocaleString('en-US');
  const outStr = b => {
    const t = taskById(b.task_id);
    if (!t) return '–';
    if (t.unit==='containers') return b.vehicles ? `${nf(b.vehicles)} คัน` : `${nf(b.containers)} ตู้`;
    return `${nf(b.qty)} ${t.unitLabel||''}`.trim() || '–';
  };
  let lastP = null;
  box.innerHTML = `
    <table class="emp-tbl">
      <thead><tr><th>${label}</th><th>งานที่ทำ</th><th>จำนวน</th><th>ผลลัพธ์</th><th>นาทีรวม</th><th>เฉลี่ย นาที/งาน</th></tr></thead>
      <tbody>${rows.map(b=>{
        const t = taskById(b.task_id);
        const show = b.period !== lastP; lastP = b.period;
        return `<tr class="${show?'et-first':''}">
          <td>${show ? esc(fmtP(b.period)) : ''}</td>
          <td class="et-task">${esc(t ? t.label : (b.task_id||'–'))}</td>
          <td class="mono">${b.n}</td>
          <td class="mono">${esc(outStr(b))}</td>
          <td class="mono">${b.min.toLocaleString('en-US')}</td>
          <td class="mono">${b.wm ? Math.round(b.min/b.wm) : '–'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

document.addEventListener('keydown', e=>{
  const m = document.getElementById('empModal');
  if (e.key === 'Escape' && m && !m.hidden){ closeEmpModal(); return; }
  const row = e.target.closest && e.target.closest('#employeesTable tbody tr[data-emp]');
  if (row && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openEmpPanel(row.dataset.emp); }
});

// ตำแหน่ง dropdown: active positions "name (LVn)" + an "Admin" choice. `sel` is a
// position id (string/number) or 'ADMIN'; an inactive current position is kept so it displays.
function positionOptions(sel, withAdmin){
  const s = sel == null ? '' : String(sel);
  const list = positions.filter(x => x.active !== false || String(x.id) === s)
    .sort((a,b)=> (a.sort-b.sort) || (a.lv-b.lv));
  return list.map(x=>`<option value="${esc(x.id)}" ${String(x.id)===s?'selected':''}>${esc(x.name)} (LV${esc(x.lv)})${x.active===false?' · ปิด':''}</option>`).join('')
    + (withAdmin ? `<option value="ADMIN" ${s==='ADMIN'?'selected':''}>Admin</option>` : '');
}
function whOptions(sel){
  return WH_KEYS.map(w=>`<option value="${w}" ${sel===w?'selected':''}>${esc(WH_PLAIN[w])}</option>`).join('');
}
function deptOptions(wh, sel){
  const keys = deptKeysFor(wh);
  return keys.map(d=>`<option value="${esc(d)}" ${sel===d?'selected':''}>${esc(deptName(d, wh))}</option>`).join('');
}
// A SUPERVISOR / USER may cover more than one department (profiles.departments).
function userDepts(u){
  if (Array.isArray(u.departments) && u.departments.length) return u.departments;
  return u.department ? [u.department] : [];
}
function deptCheckboxes(selected, cls, disabled){
  const set = new Set(selected || []);
  return `<span class="dept-cb-row">` + deptKeysFor(null).map(d=>
    `<label class="dept-cb"><input type="checkbox" class="${cls}" value="${d}" ${set.has(d)?'checked':''} ${disabled?'disabled':''}> ${esc(deptName(d))}</label>`
  ).join('') + `</span>`;
}

// ---------- staff_scope: the (warehouse × department) grant grid ----------
function userScopePairs(uid){
  return scopes.filter(s=>s.profile_id===uid).map(s=>({ warehouse:s.warehouse, department:s.department }));
}
// Departments are per-warehouse now — a single dept×warehouse grid would imply
// a shared row set that no longer exists, so each warehouse gets its own
// checkbox column built from *its own* department list (คลังใครคลังมัน).
function scopeGridHTML(pairs, cls){
  const set = new Set((pairs||[]).map(p=>p.warehouse+':'+p.department));
  return `<div class="scope-grid-wh">` + WH_KEYS.map(w=>{
    const keys = deptKeysFor(w);
    const body = keys.length
      ? keys.map(d=>`<label class="dept-cb"><input type="checkbox" class="${cls}" data-wh="${w}" data-dept="${d}"${set.has(w+':'+d)?' checked':''}> ${esc(deptName(d, w))}</label>`).join('')
      : `<span class="td-sub">ยังไม่มีแผนก</span>`;
    return `<div class="scope-grid-col"><b>${esc(WH_PLAIN[w])}</b>${body}</div>`;
  }).join('') + `</div>`;
}
function readScopeGrid(root, cls){
  return [...root.querySelectorAll('.'+cls+':checked')].map(c=>({ warehouse:c.dataset.wh, department:c.dataset.dept }));
}
function scopeSummary(pairs){
  if (!pairs.length) return '<span class="td-sub">ยังไม่กำหนด</span>';
  return WH_KEYS.filter(w=>pairs.some(p=>p.warehouse===w)).map(w=>{
    const ds = deptKeysFor(w).filter(d=>pairs.some(p=>p.warehouse===w && p.department===d));
    return `<span class="scope-sum"><b>${esc(WH_PLAIN[w])}</b> ` + ds.map(d=>esc(deptName(d, w))).join(', ') + `</span>`;
  }).join(' ');
}
// desired vs current -> {add:[], del:[staff_scope rows]}
function diffScope(uid, desired){
  const cur = scopes.filter(s=>s.profile_id===uid);
  const want = new Set(desired.map(p=>p.warehouse+':'+p.department));
  const have = new Set(cur.map(s=>s.warehouse+':'+s.department));
  return {
    add: desired.filter(p=>!have.has(p.warehouse+':'+p.department)),
    del: cur.filter(s=>!want.has(s.warehouse+':'+s.department)),
  };
}
const APP_LABEL = { erp:'Skill Matrix', mobile:'มือถือ' };
function appCheckboxes(selected, cls, disabled){
  const set = new Set(selected || []);
  return `<span class="dept-cb-row">` + ['erp','mobile'].map(a=>
    `<label class="dept-cb"><input type="checkbox" class="${cls}" value="${a}" ${set.has(a)?'checked':''} ${disabled?'disabled':''}> ${APP_LABEL[a]}</label>`
  ).join('') + `</span>`;
}

// ---------- users view: filters + sorted table + detail modal ----------
let usersStatus = 'active', usersWh = 'ALL', usersDept = 'ALL', usersQ = '', usersModalId = null;
const userRank = u => isAdminP(u) ? 99 : lvOf(u);
const whOrd = w => { const i = WH_KEYS.indexOf(w); return i < 0 ? 99 : i; };
const userDeptName = u => u.department ? String(deptName(u.department, u.warehouse) || '') : '';

// Admin first, then LV5..LV1, then no position; within a level: คลัง A,B -> แผนก -> ชื่อ (Thai)
function sortedUsers(){
  return users.slice().sort((a,b)=>
    (userRank(b) - userRank(a))
    || (whOrd(a.warehouse) - whOrd(b.warehouse))
    || userDeptName(a).localeCompare(userDeptName(b), 'th')
    || String(a.full_name||'').localeCompare(String(b.full_name||''), 'th'));
}

function userSegHTML(items, cur, attr){
  return items.map(it=>`<button type="button" class="chip" ${attr}="${esc(it.k)}" aria-pressed="${it.k===cur}">${esc(it.label)} <span class="u-n">${it.n}</span></button>`).join('');
}

function userHomeText(u){
  if (isAdminP(u)) return 'ทุกคลัง · ทุกแผนก';
  return u.warehouse ? `${esc(WH_PLAIN[u.warehouse]||u.warehouse)} · ${u.department ? esc(deptName(u.department, u.warehouse)) : '–'}` : '–';
}
function userAppChips(u){
  const chips = allowedApps(u).map(a=>`<span class="u-chip">${a==='erp'?'ERP':esc(APP_LABEL[a]||a)}</span>`).join('');
  return chips + (Array.isArray(u.apps) && u.apps.length ? '' : ' <span class="td-sub">(ตามตำแหน่ง)</span>');
}
function userRoleCls(u){ const l = lvOf(u); return isAdminP(u) ? 'r-admin' : l >= 4 ? 'r-asst' : l >= 2 ? 'r-sup' : 'r-user'; }

function closeUserModal(){
  usersModalId = null;
  const ov = document.getElementById('userModal'); if (ov) ov.hidden = true;
  const b = document.getElementById('userModalBody'); if (b){ b.innerHTML = ''; b.removeAttribute('data-user-row'); }
}
function openUserModal(id){
  if (!canManageUsers()) return;
  usersModalId = id; renderUserModal();
}

function renderUserModal(){
  const ov = document.getElementById('userModal'), body = document.getElementById('userModalBody');
  if (!ov || !body) return;
  const u = usersModalId && canManageUsers() ? users.find(x=>x.id===usersModalId) : null;
  if (!u){ closeUserModal(); return; }
  const full = isUserAdminFull();
  const active = u.active !== false;
  const isSelf = currentUser && u.id === currentUser.id;
  const isAdm = isAdminP(u);
  const nm = u.full_name || '–';
  const pairs = userScopePairs(u.id);
  const effApps = allowedApps(u);
  const head = `
    <div class="u-mhead">
      <span class="emp-avatar uc-av" aria-hidden="true">${esc(nm.trim().slice(0,1))}</span>
      <div class="uc-title">
        <span class="uc-name">${esc(nm)}${isSelf ? ' <span class="u-self">บัญชีคุณ</span>' : ''}</span>
        <div class="uc-sub">${u.employee_code ? `<span class="u-code">${esc(u.employee_code)}</span>` : '<span class="td-sub">ยังไม่มีรหัสพนักงาน (เข้าสู่ระบบไม่ได้)</span>'}</div>
      </div>
      <span class="role-pill ${userRoleCls(u)}">${esc(posLabel(u))}</span>
      <span class="status-badge ${active?'approved':'rejected'}">${active?'ใช้งาน':'ปิดใช้งาน'}</span>
    </div>`;
  let inner;
  if (!full){
    inner = `${head}
      <div class="uc-fields">
        <div class="uc-field"><span class="uc-lbl">คลัง · แผนกหลัก</span><div>${userHomeText(u)}</div></div>
        <div class="uc-field"><span class="uc-lbl">สิทธิ์เสริม (คลัง×แผนก)</span><div>${scopeSummary(pairs)}</div></div>
        <div class="uc-field"><span class="uc-lbl">ระบบที่ใช้ได้</span><div>${userAppChips(u)}</div></div>
      </div>
      <div class="modal-actions"><button type="button" class="btn-sm" data-close-umodal>ปิด</button></div>`;
  } else {
    const scopeCell = `<span class="td-sub" data-scope-admin ${isAdm?'':'hidden'}>ทุกคลัง · ทุกแผนก</span><div data-scope-grid ${isAdm?'hidden':''}>${scopeGridHTML(pairs, 'u-scope-cb')}</div>`;
    inner = `${head}
      <div class="uc-fields">
        <div class="uc-field">
          <span class="uc-lbl">ตำแหน่ง</span>
          <select class="mini-select" data-u-pos ${isSelf?'disabled title="เปลี่ยนตำแหน่งตัวเองไม่ได้"':''}>${positionOptions(isAdm ? 'ADMIN' : u.position_id, true)}</select>
        </div>
        <div class="uc-field" data-home-block ${isAdm?'hidden':''}>
          <span class="uc-lbl">คลังหลัก</span>
          <select class="mini-select" data-u-wh>${whOptions(u.warehouse)}</select>
        </div>
        <div class="uc-field" data-home-block ${isAdm?'hidden':''}>
          <span class="uc-lbl">แผนกหลัก</span>
          <select class="mini-select" data-u-dept>${deptOptions(u.warehouse || WH_KEYS[0], u.department)}</select>
        </div>
        <div class="uc-field" style="grid-column:1/-1;">
          <span class="uc-lbl">สิทธิ์เสริม (คลัง×แผนก) · ไม่บังคับ</span>
          <div class="scope-cell">${scopeCell}</div>
        </div>
        <div class="uc-field">
          <span class="uc-lbl">ระบบที่ใช้ได้</span>
          ${appCheckboxes(effApps, 'u-app-cb')}
        </div>
        <div class="uc-field">
          <span class="uc-lbl">รหัสพนักงาน</span>
          <input type="text" class="code-input" data-u-code value="${esc(u.employee_code||'')}" placeholder="รหัส" readonly title="รหัสพนักงานแก้ไม่ได้ (ใช้เป็นชื่อเข้าสู่ระบบ)">
        </div>
      </div>
      <div class="uc-btns">
        <button type="button" class="mini-btn approve" data-save-user="${esc(u.id)}">บันทึก</button>
        <button type="button" class="mini-btn" data-reset-pass="${esc(u.id)}">รีเซ็ตรหัส</button>
        ${isSelf ? '' : `<button type="button" class="mini-btn" data-toggle-user="${esc(u.id)}" data-next-active="${active?'false':'true'}">${active?'ปิดใช้งาน':'เปิดใช้งาน'}</button>`}
        ${!isSelf && !isAdm ? `<button type="button" class="mini-btn reject" data-del-user="${esc(u.id)}">ลบถาวร</button>` : ''}
        <span class="u-spacer"></span>
        <button type="button" class="btn-sm" data-close-umodal>ปิด</button>
      </div>`;
  }
  const keepScroll = body.scrollTop;
  body.setAttribute('data-user-row', u.id);
  body.innerHTML = inner;
  body.scrollTop = keepScroll;
  ov.hidden = false;
}

function renderUsersTable(){
  const wrap = document.getElementById('usersList');
  if (!wrap) return;
  if (!canManageUsers()){ wrap.innerHTML = ''; closeUserModal(); return; }
  const full = isUserAdminFull();          // ADMIN = full toolset; LV4+ = read-only
  const bar = document.getElementById('userAdminBar');
  if (bar) bar.hidden = true;
  const hb = document.getElementById('usersHeadBtns'); if (hb) hb.hidden = !full;
  const pb = document.getElementById('openPosBtn'); if (pb) pb.hidden = !isUserAdminFull();
  const note = document.getElementById('usersViewNote');
  if (note) note.textContent = full
    ? 'เพิ่มบัญชี / แก้สิทธิ์-แผนก-รหัสพนักงาน / ปิดใช้งาน หรือ ลบถาวรได้จากที่นี่ · บัญชีที่มีประวัติงานลบถาวรไม่ได้ ให้ปิดใช้งานแทน'
    : 'LV4 ขึ้นไป — อ่านอย่างเดียว · เห็นเฉพาะบัญชีในคลังที่ได้รับมอบหมาย (แก้ไขไม่ได้ · ติดต่อผู้ดูแลระบบ)';
  const nuPos = document.getElementById('nuPos');
  if (full && nuPos){
    // positions can change (ตำแหน่ง & LV view) — rebuild options, keep the pick
    const keep = nuPos.value;
    nuPos.innerHTML = positionOptions(keep || (positions.find(x=>x.active!==false) || {}).id, true);
    const nuWh = document.getElementById('nuWh');
    if (!nuWh.options.length){
      nuWh.innerHTML = whOptions(WH_KEYS[0]);
      document.getElementById('nuDept').innerHTML = deptOptions(nuWh.value);
    }
    const grid = document.getElementById('nuScopeGrid');
    if (grid && !grid.innerHTML) grid.innerHTML = scopeGridHTML([], 'nu-scope-cb');
    const acbs = document.getElementById('nuAppCbs');
    if (acbs && !acbs.innerHTML) acbs.innerHTML = ['erp','mobile'].map(a=>
      `<label class="dept-cb"><input type="checkbox" class="nu-app-cb" value="${a}"> ${APP_LABEL[a]}</label>`).join('');
    syncNewUserAdmin();
  }

  const base = users.filter(u=> full || !isAdminP(u));   // non-admin never sees ADMIN rows (RLS also enforces)
  const whs = seesAllWh() ? WH_KEYS.slice() : myWhList();
  if (usersWh !== 'ALL' && !whs.includes(usersWh)) usersWh = 'ALL';
  if (usersWh === 'ALL' || !deptKeysFor(usersWh).includes(usersDept)) usersDept = 'ALL';
  const q = usersQ;
  const mq = u => !q || (u.full_name||'').toLowerCase().includes(q) || (u.employee_code||'').toLowerCase().includes(q);
  const ms = u => usersStatus === 'all' || (usersStatus === 'active') === (u.active !== false);
  const mw = u => usersWh === 'ALL' || u.warehouse === usersWh;
  const md = u => usersDept === 'ALL' || u.department === usersDept;

  const cnt = f => base.filter(f).length;
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('usersStatusTabs', userSegHTML([
    { k:'active', label:'ใช้งาน',  n: cnt(u=>mq(u)&&mw(u)&&md(u)&&u.active!==false) },
    { k:'off',    label:'ปิดแล้ว', n: cnt(u=>mq(u)&&mw(u)&&md(u)&&u.active===false) },
    { k:'all',    label:'ทั้งหมด', n: cnt(u=>mq(u)&&mw(u)&&md(u)) },
  ], usersStatus, 'data-ustatus'));
  set('usersWhTabs', userSegHTML(
    [{ k:'ALL', label:'ทุกคลัง', n: cnt(u=>mq(u)&&ms(u)) }]
      .concat(whs.map(w=>({ k:w, label:WH_PLAIN[w]||w, n: cnt(u=>mq(u)&&ms(u)&&u.warehouse===w) }))),
    usersWh, 'data-uwh'));
  const dEl = document.getElementById('usersDeptTabs');
  if (dEl){
    dEl.hidden = usersWh === 'ALL';
    dEl.innerHTML = usersWh === 'ALL' ? '' : userSegHTML(
      [{ k:'ALL', label:'ทุกแผนก', n: cnt(u=>mq(u)&&ms(u)&&u.warehouse===usersWh) }]
        .concat(deptKeysFor(usersWh).map(d=>({ k:d, label:deptName(d, usersWh), n: cnt(u=>mq(u)&&ms(u)&&u.warehouse===usersWh&&u.department===d) }))),
      usersDept, 'data-udept');
  }

  const list = sortedUsers().filter(u=> (full || !isAdminP(u)) && mq(u) && ms(u) && mw(u) && md(u));
  if (!list.length){
    wrap.innerHTML = `<tr><td colspan="6" class="empty-note">ไม่พบผู้ใช้ตามตัวกรอง</td></tr>`;
  } else {
    const grp = u => isAdminP(u) ? 'Admin' : lvOf(u) > 0 ? 'LV' + lvOf(u) : 'ไม่มีตำแหน่ง';
    const gCount = new Map(); list.forEach(u=>{ const g = grp(u); gCount.set(g, (gCount.get(g)||0) + 1); });
    let lastG = null;
    wrap.innerHTML = list.map(u=>{
      const g = grp(u);
      const gRow = g !== lastG ? `<tr class="u-group"><td colspan="6">${esc(g)} <span class="u-n">${gCount.get(g)}</span></td></tr>` : '';
      lastG = g;
      const active = u.active !== false;
      const isSelf = currentUser && u.id === currentUser.id;
      const nm = u.full_name || '–';
      return gRow + `<tr class="u-row ${active?'':'row-inactive'}" data-open-user="${esc(u.id)}" tabindex="0">
        <td><div class="u-name"><span class="emp-avatar uc-av" aria-hidden="true">${esc(nm.trim().slice(0,1))}</span>
          <div><b>${esc(nm)}</b>${isSelf ? ' <span class="u-self">บัญชีคุณ</span>' : ''}
          <div class="u-code">${u.employee_code ? esc(u.employee_code) : '<span class="td-sub">ยังไม่มีรหัส</span>'}</div></div></div></td>
        <td><span class="role-pill ${userRoleCls(u)}">${esc(posLabel(u))}</span></td>
        <td>${userHomeText(u)}</td>
        <td>${userAppChips(u)}</td>
        <td><span class="status-badge ${active?'approved':'rejected'}">${active?'ใช้งาน':'ปิดใช้งาน'}</span></td>
        <td class="u-manage">จัดการ ›</td>
      </tr>`;
    }).join('');
  }
  renderUserModal();   // keep an open detail modal in sync after save / toggle / delete
}

async function saveUserRow(userId){
  if (!isUserAdminFull()) return;   // ASSISTANT view is read-only
  const row = document.querySelector(`[data-user-row="${userId}"]`);
  if (!row) return;
  const posVal = row.querySelector('[data-u-pos]').value;
  const wasAdmin = isAdminP(users.find(x=>x.id===userId));
  const toAdmin = posVal === 'ADMIN';
  const upd = {};
  let desiredScope = [];
  if (toAdmin){
    // Admin: no home / position; extra scope irrelevant
    if (!wasAdmin) upd.role = 'ADMIN';
    upd.position_id = null;
  } else {
    const position_id = Number(posVal);
    const warehouse = row.querySelector('[data-u-wh]').value;
    const department = row.querySelector('[data-u-dept]').value;
    if (!position_id || !positions.some(x=>x.id===position_id)){ toast('เลือกตำแหน่ง'); return; }
    if (!WH_KEYS.includes(warehouse) || !department){ toast('ต้องเลือกตำแหน่ง + คลังหลัก + แผนกหลัก'); return; }
    desiredScope = readScopeGrid(row, 'u-scope-cb');
    Object.assign(upd, { position_id, warehouse, department, departments: [department] });
    // role of a non-admin is synced from the position by a DB trigger; only
    // demoting a former ADMIN needs a role value (placeholder, trigger rewrites it)
    if (wasAdmin) upd.role = 'USER';
  }

  const appsChecked = [...row.querySelectorAll('.u-app-cb:checked')].map(c=>c.value);
  if (!appsChecked.length){ toast('เลือกระบบที่ใช้ได้อย่างน้อย 1 ระบบ (Skill Matrix / มือถือ)'); return; }
  upd.apps = appsChecked;

  const btn = row.querySelector('[data-save-user]');
  const label = btn.textContent; btn.textContent = '...'; btn.disabled = true;
  try{
    const { error } = await sb.from('profiles').update(upd).eq('id', userId);
    if (error) throw error;
    // staff_scope diff — ADMIN / USER end up with desiredScope = [] -> all rows removed
    const { add, del } = diffScope(userId, desiredScope);
    if (del.length){
      const { error: dErr } = await sb.from('staff_scope').delete().in('id', del.map(s=>s.id));
      if (dErr) throw dErr;
    }
    if (add.length){
      const { error: aErr } = await sb.from('staff_scope').insert(
        add.map(p=>({ profile_id: userId, warehouse: p.warehouse, department: p.department, created_by: currentUser.id })));
      if (aErr) throw aErr;
    }
    await Promise.all([refreshUsers(), refreshScopes()]); renderUsersTable();
    toast('บันทึกแล้ว', 'ok');
  }catch(err){
    toast('บันทึกไม่สำเร็จ: ' + mapDbError(err));
    btn.textContent = label; btn.disabled = false;
  }
}

async function toggleUserActive(userId, next){
  if (!isUserAdminFull()) return;   // ASSISTANT view is read-only
  if (currentUser && userId === currentUser.id){ toast('ปิดใช้งานบัญชีตัวเองไม่ได้'); return; }
  if (!next){
    const go = await confirmModal('ปิดใช้งานบัญชีนี้? ผู้ใช้จะเข้าสู่ระบบไม่ได้ (ข้อมูลงานยังอยู่ครบ)', { danger:true, yes:'ปิดใช้งาน' });
    if (!go) return;
  }
  try{
    const { error } = await sb.from('profiles').update({ active: next }).eq('id', userId);
    if (error) throw error;
    await refreshUsers(); renderUsersTable();
  }catch(err){ toast('ทำรายการไม่สำเร็จ: ' + mapDbError(err)); }
}

function resetUserPassword(userId){
  if (!isUserAdminFull()) return;
  const u = users.find(x=>x.id===userId);
  const name = (u && u.full_name) || 'ผู้ใช้นี้';
  askNewPassword(`ตั้งรหัสผ่านใหม่: ${name}`, async (pw)=>{
    try{
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(ADMIN_USERS_FN, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ action: 'set-password', user_id: userId, password: pw }),
      });
      const out = await res.json().catch(()=>({}));
      if (!res.ok || out.error) return (out.error || ('HTTP ' + res.status));
      return null;
    }catch(err){ return 'รีเซ็ตรหัสไม่สำเร็จ: ' + (err.message || err); }
  });
}

async function deleteUserAccount(userId){
  if (!isUserAdminFull()) return;
  if (currentUser && userId === currentUser.id){ toast('ลบบัญชีตัวเองไม่ได้'); return; }
  const u = users.find(x=>x.id===userId);
  const name = (u && u.full_name) || 'บัญชีนี้';
  const go = await confirmModal(
    `ลบบัญชี "${name}" ถาวร?\nลบทั้งบัญชีเข้าระบบ + โปรไฟล์ + ขอบเขตสิทธิ์ · กู้คืนไม่ได้\nถ้าบัญชีเคยเปิดงาน ระบบจะไม่ลบให้ — ใช้ "ปิดใช้งาน" แทน`,
    { danger:true, yes:'ลบถาวร' });
  if (!go) return;
  try{
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(ADMIN_USERS_FN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action: 'delete', user_id: userId }),
    });
    const out = await res.json().catch(()=>({}));
    if (!res.ok || out.error) throw new Error(out.error || ('HTTP ' + res.status));
    await Promise.all([refreshUsers(), refreshScopes()]); renderUsersTable();
    toast('ลบบัญชีแล้ว', 'ok');
  }catch(err){ toast('ลบไม่สำเร็จ: ' + (err.message || err)); }
}

// random temp password (no look-alike chars), shown once in the create-form hint
let generatedPw = '';
function genTempPassword(){
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(10); crypto.getRandomValues(buf);
  return Array.from(buf, n => abc[n % abc.length]).join('');
}

async function createUserFromForm(){
  if (!isUserAdminFull()) return;
  const hint = document.getElementById('addUserHint');
  const employee_code = normalizeEmpCode(document.getElementById('nuCode').value);
  const rawCode = document.getElementById('nuCode').value.trim();
  const full_name = document.getElementById('nuName').value.trim();
  const password = document.getElementById('nuPass').value;
  const posVal = document.getElementById('nuPos').value;
  const isAdmNew = posVal === 'ADMIN';
  const warehouse = document.getElementById('nuWh').value;
  const department = document.getElementById('nuDept').value;
  const scope = isAdmNew ? [] : readScopeGrid(document.getElementById('nuScopeGrid'), 'nu-scope-cb');
  const apps = [...document.querySelectorAll('#nuAppCbs .nu-app-cb:checked')].map(c=>c.value);
  if (!rawCode || !full_name || !password){ hint.textContent = 'กรอก รหัสพนักงาน / ชื่อ / รหัสผ่าน ให้ครบ'; return; }
  if (!employee_code){ hint.textContent = 'รูปแบบรหัสพนักงานไม่ถูกต้อง (ตัวอักษร/ตัวเลข/ขีด 3-20 ตัว)'; return; }
  if (password.length < 8){ hint.textContent = 'รหัสผ่านต้องอย่างน้อย 8 ตัว'; return; }
  const position_id = Number(posVal);
  if (!isAdmNew && !positions.some(x=>x.id===position_id && x.active!==false)){ hint.textContent = 'เลือกตำแหน่ง'; return; }
  if (!isAdmNew && (!WH_KEYS.includes(warehouse) || !department)){ hint.textContent = 'ต้องเลือกตำแหน่ง + คลังหลัก + แผนกหลัก'; return; }
  const payload = isAdmNew
    ? { action: 'create', employee_code, password, full_name, role: 'ADMIN', scope: [], apps }
    : { action: 'create', employee_code, password, full_name, role: 'USER', position_id, warehouse, department, departments: [department], scope, apps };
  hint.textContent = 'กำลังสร้างบัญชี...';
  try{
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(ADMIN_USERS_FN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(()=>({}));
    if (!res.ok || out.error) throw new Error(out.error || ('HTTP ' + res.status));
    hint.textContent = `สร้างบัญชีรหัส ${employee_code} แล้ว` + (generatedPw && generatedPw === password ? ` — รหัสผ่านชั่วคราว: ${password} (แจ้งผู้ใช้ตอนนี้ จะไม่แสดงอีก)` : '');
    ['nuCode','nuName','nuPass'].forEach(id=>{ document.getElementById(id).value = ''; });
    document.querySelectorAll('#nuScopeGrid .nu-scope-cb:checked, #nuAppCbs .nu-app-cb:checked').forEach(c=>{ c.checked = false; });
    await Promise.all([refreshUsers(), refreshScopes()]); renderUsersTable();
    generatedPw = '';
    // keep the message (it may hold the one-time temp password) until the next form edit
  }catch(err){ hint.textContent = 'ไม่สำเร็จ: ' + err.message; }
}

// ---------- bulk create: one line per account, one shared initial password ----------
function openBulkModal(){
  if (!isUserAdminFull()) return;
  // dropdowns = defaults for lines that omit the position / คลัง / แผนก column
  const pos = document.getElementById('buPos');
  pos.innerHTML = positionOptions(pos.value || (positions.find(x=>x.active!==false) || {}).id, true);
  const bw = document.getElementById('buWh');
  if (!bw.options.length){
    bw.innerHTML = whOptions(WH_KEYS[0]);
    document.getElementById('buDept').innerHTML = deptOptions(bw.value);
    document.getElementById('buAppCbs').innerHTML = ['erp','mobile'].map(a=>
      `<label class="dept-cb"><input type="checkbox" class="bu-app-cb" value="${a}"> ${APP_LABEL[a]}</label>`).join('');
  }
  document.getElementById('buScopeGrid').innerHTML = scopeGridHTML([], 'bu-scope-cb');
  document.getElementById('buHint').textContent = '';
  document.getElementById('buResults').textContent = '';
  document.getElementById('buSubmit').disabled = false;
  document.getElementById('bulkModal').hidden = false;
}

async function bulkCreateUsers(){
  if (!isUserAdminFull()) return;
  const hint = document.getElementById('buHint');
  const out = document.getElementById('buResults');
  const btn = document.getElementById('buSubmit');
  const password = document.getElementById('buPass').value;
  const defPos = document.getElementById('buPos').value;
  const defWh = document.getElementById('buWh').value;
  const defDept = document.getElementById('buDept').value;
  const scope = readScopeGrid(document.getElementById('buScopeGrid'), 'bu-scope-cb');
  const apps = [...document.querySelectorAll('#buAppCbs .bu-app-cb:checked')].map(c=>c.value);
  const lines = document.getElementById('buLines').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if (!lines.length){ hint.textContent = 'ใส่รายชื่ออย่างน้อย 1 บรรทัด'; return; }
  if (password.length < 8){ hint.textContent = 'รหัสผ่านต้องอย่างน้อย 8 ตัว'; return; }
  const lc = s => String(s||'').trim().toLowerCase();
  const posByName = n => positions.find(x=>x.active!==false && lc(x.name)===lc(n));
  const whByText = t => WH_KEYS.find(w=>lc(w)===lc(t) || lc(WH_PLAIN[w])===lc(t));
  const deptByText = (wh, t) => deptKeysFor(wh).find(d=>lc(d)===lc(t) || lc(deptName(d, wh))===lc(t));
  btn.disabled = true; out.textContent = '';
  let ok = 0, bad = 0;
  const addLine = (good, text)=>{ out.textContent += (good ? '✓ ' : '✗ ') + text + '\n'; };
  try{
    const { data: { session } } = await sb.auth.getSession();
    for (let i = 0; i < lines.length; i++){
      hint.textContent = `กำลังสร้าง ${i+1}/${lines.length}...`;
      // "รหัส ชื่อ-นามสกุล | ตำแหน่ง | คลัง | แผนก" (separator | , or tab; last 3 optional)
      const cols = lines[i].split(/\s*[|\t,]\s*/);
      const m = cols[0].match(/^(\S+)\s+(.+)$/);
      const employee_code = m ? normalizeEmpCode(m[1]) : '';
      const full_name = m ? m[2].trim() : '';
      if (!m){ bad++; addLine(false, `${lines[i]} — ต้องมีรหัสและชื่อ`); continue; }
      if (!employee_code){ bad++; addLine(false, `${m[1]} — รูปแบบรหัสพนักงานไม่ถูกต้อง`); continue; }
      let body;
      if (!cols[1] && defPos === 'ADMIN'){
        body = { action: 'create', employee_code, password, full_name, role: 'ADMIN', scope: [], apps };
      } else {
        const px = cols[1] ? posByName(cols[1]) : positions.find(x=>x.id===Number(defPos));
        if (!px){ bad++; addLine(false, `${employee_code} ${full_name} — ไม่พบตำแหน่ง "${cols[1]||defPos}"`); continue; }
        const wh = cols[2] ? whByText(cols[2]) : defWh;
        if (!wh){ bad++; addLine(false, `${employee_code} ${full_name} — คลัง "${cols[2]}" ไม่ถูกต้อง (A/B)`); continue; }
        const dp = cols[3] ? deptByText(wh, cols[3]) : (deptKeysFor(wh).includes(defDept) ? defDept : null);
        if (!dp){ bad++; addLine(false, `${employee_code} ${full_name} — ไม่พบแผนก "${cols[3]||defDept}" ในคลัง ${wh}`); continue; }
        body = { action: 'create', employee_code, password, full_name, role: 'USER', position_id: px.id, warehouse: wh, department: dp, departments: [dp], scope, apps };
      }
      try{
        const res = await fetch(ADMIN_USERS_FN, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + session.access_token,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(body),
        });
        const r =await res.json().catch(()=>({}));
        if (!res.ok || r.error) throw new Error(r.error || ('HTTP ' + res.status));
        ok++; addLine(true, `${employee_code} ${full_name}`);
      }catch(err){ bad++; addLine(false, `${employee_code} ${full_name} — ${err.message || err}`); }
    }
  }catch(err){ hint.textContent = 'ไม่สำเร็จ: ' + (err.message || err); btn.disabled = false; return; }
  hint.textContent = `เสร็จ: สำเร็จ ${ok} · ไม่สำเร็จ ${bad}`;
  btn.disabled = false;
  await Promise.all([refreshUsers(), refreshScopes()]); renderUsersTable();
}

// ---------- view state: loading skeleton / load-error card ----------
function isFiltered(){ return dateRange!=='all' || deptFilter!=='ALL' || whFilter!=='ALL' || !!searchTerm; }

function clearFilters(){
  dateRange = 'all'; deptFilter = 'ALL'; whFilter = 'ALL'; searchTerm = ''; dateFrom = dateTo = null;
  const s = document.getElementById('searchInput'); if (s) s.value = '';
  document.querySelectorAll('#rangeChips .chip').forEach(c=>c.setAttribute('aria-pressed', c.dataset.range==='all'));
  const dp = document.getElementById('datePop'); if (dp) dp.hidden = true;
  syncDatePick();
  renderWhChips();   // resets whFilter to a valid value for this user
  buildDeptChips();
  render();
}

function skeletonHTML(){
  const b = n => Array(n).fill('<div class="sk sk-row"></div>').join('');
  if (activeView==='dashboard')
    return `<div class="sk sk-strip"></div>
      <div class="sk-cards"><div class="sk sk-card"></div><div class="sk sk-card"></div><div class="sk sk-card"></div><div class="sk sk-card"></div></div>
      <div class="sk sk-chart"></div>${b(4)}`;
  if (activeView==='queue')
    return `<div class="sk sk-qcard"></div><div class="sk sk-qcard"></div><div class="sk sk-qcard"></div>`;
  return b(7);
}

function showViewState(kind){
  const vs = document.getElementById('viewState');
  document.querySelector('.main').classList.toggle('has-state', !!kind);
  if (!kind){ vs.hidden = true; vs.innerHTML = ''; return; }
  vs.hidden = false;
  vs.innerHTML = kind==='error'
    ? `<div class="state-card">
         <div class="state-ic">!</div>
         <div class="state-title">โหลดข้อมูลไม่สำเร็จ</div>
         <div class="state-sub">${esc(loadError || 'เชื่อมต่อฐานข้อมูลไม่ได้')}</div>
         <button type="button" class="btn-sm primary" id="retryBtn">ลองใหม่</button>
       </div>`
    : skeletonHTML();
}

function render(){
  if (loadError){ showViewState('error'); return; }
  if (firstLoad){ showViewState('loading'); return; }
  showViewState(null);
  renderWhChips();                 // keep the คลัง filter in sync with the user's scope
  const closed = filteredJobs();
  updatePendingBadges();
  if (activeView==='dashboard'){
    renderActionStrip(); renderScopeLine(closed); renderDash(closed);
  } else if (activeView==='queue'){
    renderQueue();
  } else if (activeView==='details'){
    renderDetailsTable(closed);
  } else if (activeView==='employees'){
    renderEmpRoster();
    renderEmployeesTable(closed);
  } else if (activeView==='skillmatrix'){
    renderSkillMatrix();
  } else if (activeView==='tasks'){
    renderDeptAdmin();
    renderTasksAdmin();
  } else if (activeView==='users'){
    renderUsersTable();
  }
  if (!document.getElementById('posModal').hidden) renderPositions();
  writeHashState();
}

// ---------- data refresh ----------
async function refreshJobs(){
  const { data, error } = await sb.from('jobs').select('*').order('created_at', { ascending:false }).limit(2000);
  if (error) throw error;                 // jobs is critical — let refreshAll surface it
  jobs = groupJobs(data || []);
}
async function refreshRoster(){
  try{
    const { data, error } = await sb.from('employees').select('*').eq('active', true).order('name');
    if (error) throw error;
    roster = data || [];
  }catch(e){ /* keep as-is */ }
}
// The full roster (incl. deactivated) — only the ADMIN employees-management block needs it.
async function refreshEmployeesAll(){
  try{
    const { data, error } = await sb.from('employees').select('*').order('department').order('name');
    if (error) throw error;
    allEmployees = data || [];
  }catch(e){ /* keep as-is */ }
}
async function refreshUsers(){
  try{
    const { data, error } = await sb.from('profiles').select('*')
      .order('active', { ascending: false }).order('full_name');
    if (error) throw error;
    users = data || [];
  }catch(e){ /* admin-only view; ignore errors for non-critical panel */ }
}
async function refreshScopes(){
  try{
    const { data, error } = await sb.from('staff_scope').select('*');
    if (error) throw error;
    scopes = data || [];
  }catch(e){ /* admin-only; non-critical */ }
}
async function refreshAll(){
  document.getElementById('syncText').textContent = 'กำลังโหลดข้อมูล...';
  loadError = null;
  if (firstLoad) render();                        // paints the skeleton
  const [jobsRes] = await Promise.allSettled([refreshJobs(), refreshRoster(), refreshUsers(), refreshScopes(), refreshEmployeesAll(), refreshTasksAdmin()]);
  if (jobsRes.status === 'rejected'){
    loadError = mapDbError(jobsRes.reason);
    document.getElementById('syncText').textContent = 'โหลดข้อมูลไม่สำเร็จ';
    render();
    return;
  }
  firstLoad = false;
  document.getElementById('syncText').textContent = 'ซิงก์สดกับแอปมือถือ';
  render();
}

function wireRealtime(){
  if (realtimeChannel) sb.removeChannel(realtimeChannel);
  // realtime refreshes never blow away the view — a transient failure just
  // notes it in the sync line; the full error state is for the initial load.
  const softRefresh = fn => () => fn().then(render).catch(()=>{
    document.getElementById('syncText').textContent = 'อัปเดตล่าสุดไม่สำเร็จ · จะลองใหม่';
  });
  realtimeChannel = sb.channel('erp-jobs-changes-'+(currentUser?currentUser.id:'anon'))
    .on('postgres_changes', {event:'*', schema:'public', table:'jobs'}, softRefresh(refreshJobs))
    .on('postgres_changes', {event:'*', schema:'public', table:'employees'}, softRefresh(()=>Promise.all([refreshRoster(), refreshEmployeesAll()])))
    .on('postgres_changes', {event:'*', schema:'public', table:'tasks'}, softRefresh(()=>Promise.all([refreshTasksAdmin(), loadTasksFromDb()])))
    .on('postgres_changes', {event:'*', schema:'public', table:'staff_scope'}, softRefresh(refreshScopes))
    .subscribe();
}

// ---------- boot ----------
render();
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user){
    await afterLogin(session.user);
  } else {
    goLogin();
    return;
  }
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT'){ goLogin(); }
    if (event === 'PASSWORD_RECOVERY'){
      askNewPassword('ตั้งรหัสผ่านใหม่', async (pw)=>{
        const { error } = await sb.auth.updateUser({ password: pw });
        return error ? (error.message || String(error)) : null;
      });
    }
  });
})();

// position change in user card: Admin hides home คลัง/แผนก + scope grid, others show them
document.addEventListener('change', e => {
  const t = e.target; if (!t || !t.closest) return;
  const sel = t.closest('[data-u-pos]');
  if (sel){
    const card = sel.closest('[data-user-row]'); if (!card) return;
    const isAdmin = sel.value === 'ADMIN';
    card.querySelectorAll('[data-scope-admin]').forEach(el => el.hidden = !isAdmin);
    card.querySelectorAll('[data-scope-grid]').forEach(el => el.hidden = isAdmin);
    card.querySelectorAll('[data-home-block]').forEach(el => el.hidden = isAdmin);
    return;
  }
  // home คลัง change -> refill that card's home แผนก list
  const wh = t.closest('[data-u-wh]');
  if (wh){
    const card = wh.closest('[data-user-row]'); if (!card) return;
    card.querySelector('[data-u-dept]').innerHTML = deptOptions(wh.value);
    return;
  }
  if (t.id === 'nuWh'){ document.getElementById('nuDept').innerHTML = deptOptions(t.value); return; }
  if (t.id === 'buWh'){ document.getElementById('buDept').innerHTML = deptOptions(t.value); return; }
  if (t.id === 'nuPos'){ syncNewUserAdmin(); return; }
});
// create form: Admin has no home คลัง/แผนก and no extra scope
function syncNewUserAdmin(){
  const p = document.getElementById('nuPos'); if (!p) return;
  document.querySelectorAll('#addUserForm .nu-nonadmin').forEach(el => el.hidden = p.value === 'ADMIN');
}

// ---------- ตำแหน่ง & LV (ADMIN only; direct writes, RLS is_admin) ----------
function renderPositions(){
  const tb = document.querySelector('#positionsTable tbody');
  if (!tb) return;
  const full = isUserAdminFull();
  document.getElementById('addPositionForm').hidden = !full;
  if (!full){ tb.innerHTML = ''; return; }
  const cnt = new Map();
  users.forEach(u=>{ if (u.position_id != null) cnt.set(u.position_id, (cnt.get(u.position_id)||0) + 1); });
  const rows = positions.slice().sort((a,b)=> (a.sort-b.sort) || (a.lv-b.lv));
  if (!rows.length){ tb.innerHTML = `<tr><td colspan="5" class="empty-note">ยังไม่มีตำแหน่ง</td></tr>`; return; }
  tb.innerHTML = rows.map(p=>{
    const on = p.active !== false, n = cnt.get(p.id) || 0;
    const lvSel = [1,2,3,4,5].map(l=>`<option value="${l}" ${p.lv===l?'selected':''}>LV${l}</option>`).join('');
    return `<tr class="${on?'':'row-inactive'}" data-pos-row="${esc(p.id)}">
      <td><input type="text" class="code-input" data-pos-name value="${esc(p.name)}" maxlength="30" aria-label="ชื่อตำแหน่ง"></td>
      <td><select class="mini-select" data-pos-lv aria-label="LV">${lvSel}</select></td>
      <td><span class="status-badge ${on?'approved':'rejected'}">${on?'ใช้งาน':'ปิดใช้งาน'}</span></td>
      <td class="mono">${n}</td>
      <td>
        <button type="button" class="mini-btn approve" data-pos-save="${esc(p.id)}">บันทึก</button>
        <button type="button" class="mini-btn ${on?'reject':'approve'}" data-pos-toggle="${esc(p.id)}" data-next="${on?'false':'true'}">${on?'ปิดใช้งาน':'เปิดใช้งาน'}</button>
        <button type="button" class="mini-btn reject" data-pos-del="${esc(p.id)}" ${n?`disabled title="มีผู้ใช้ ${n} คน — ลบไม่ได้"`:''}>ลบ</button>
      </td>
    </tr>`;
  }).join('');
}
function openPosModal(){
  if (!isUserAdminFull()) return;
  document.getElementById('posModal').hidden = false;
  Promise.all([loadPositions(), refreshUsers()]).then(renderPositions);
  renderPositions();
}
async function positionsRefresh(msg){
  await Promise.all([loadPositions(), refreshUsers()]);
  render();
  if (msg) toast(msg, 'ok');
}
async function addPosition(){
  if (!isUserAdminFull()) return;
  const hint = document.getElementById('addPositionHint');
  const name = document.getElementById('npName').value.trim();
  const lv = Number(document.getElementById('npLv').value);
  if (!name){ hint.textContent = 'กรอกชื่อตำแหน่ง'; return; }
  if (!(lv >= 1 && lv <= 5)){ hint.textContent = 'เลือก LV 1-5'; return; }
  if (positions.some(x=>x.name.toLowerCase() === name.toLowerCase())){ hint.textContent = 'มีชื่อตำแหน่งนี้แล้ว'; return; }
  hint.textContent = '';
  const sort = positions.reduce((m,x)=>Math.max(m, x.sort||0), 0) + 10;
  const { error } = await sb.from('positions').insert({ name, lv, sort });
  if (error){ toast('เพิ่มไม่สำเร็จ: ' + mapDbError(error)); return; }
  document.getElementById('npName').value = '';
  await positionsRefresh('เพิ่มตำแหน่งแล้ว');
}
async function savePosition(id){
  if (!isUserAdminFull()) return;
  const row = document.querySelector(`[data-pos-row="${id}"]`); if (!row) return;
  const name = row.querySelector('[data-pos-name]').value.trim();
  const lv = Number(row.querySelector('[data-pos-lv]').value);
  if (!name){ toast('ชื่อตำแหน่งห้ามว่าง'); return; }
  const { error } = await sb.from('positions').update({ name, lv }).eq('id', id);
  if (error){ toast('บันทึกไม่สำเร็จ: ' + mapDbError(error)); return; }
  await positionsRefresh('บันทึกแล้ว');
}
async function togglePosition(id, next){
  if (!isUserAdminFull()) return;
  if (!next){
    const go = await confirmModal('ปิดใช้งานตำแหน่งนี้? สร้าง/ย้ายผู้ใช้ไปตำแหน่งนี้ไม่ได้อีก (ผู้ใช้เดิมยังอยู่)', { danger:true, yes:'ปิดใช้งาน' });
    if (!go) return;
  }
  const { error } = await sb.from('positions').update({ active: next }).eq('id', id);
  if (error){ toast('ทำรายการไม่สำเร็จ: ' + mapDbError(error)); return; }
  await positionsRefresh();
}
async function deletePosition(id){
  if (!isUserAdminFull()) return;
  const p = positions.find(x=>String(x.id)===String(id));
  if (users.some(u=>String(u.position_id)===String(id))){ toast('ลบไม่ได้: ยังมีผู้ใช้ในตำแหน่งนี้'); return; }
  const go = await confirmModal(`ลบตำแหน่ง "${(p && p.name) || ''}" ถาวร?`, { danger:true, yes:'ลบถาวร' });
  if (!go) return;
  const { error } = await sb.from('positions').delete().eq('id', id);
  if (error){ toast('ลบไม่สำเร็จ: ' + (error.code === '23503' ? 'ยังมีผู้ใช้ในตำแหน่งนี้' : mapDbError(error))); return; }
  await positionsRefresh('ลบตำแหน่งแล้ว');
}
document.addEventListener('click', e=>{
  const sv = e.target.closest('[data-pos-save]');   if (sv){ savePosition(sv.dataset.posSave); return; }
  const tg = e.target.closest('[data-pos-toggle]'); if (tg){ togglePosition(tg.dataset.posToggle, tg.dataset.next === 'true'); return; }
  const dl = e.target.closest('[data-pos-del]');    if (dl && !dl.disabled){ deletePosition(dl.dataset.posDel); return; }
  if (e.target.closest('#createPositionBtn')){ addPosition(); return; }
});
