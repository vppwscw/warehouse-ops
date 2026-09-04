// ===================== SUPABASE INIT =====================

const DEPT_KEYS = ['INB','OUT','INV'];
const DEPT_PLAIN = { INB:'ขาเข้า', OUT:'ขาออก', INV:'สต๊อก' };
const ROLE_LABEL = { ADMIN:'ผู้ดูแลระบบ', ASSISTANT:'ผู้ช่วยผู้จัดการ', SUPERVISOR:'หัวหน้างาน', USER:'พนักงาน' };
const STATUS_LABEL = { pending:'รออนุมัติ', approved:'อนุมัติแล้ว', rejected:'ไม่อนุมัติ', open:'กำลังทำงาน' };
const ADMIN_USERS_FN = SUPABASE_URL + '/functions/v1/admin-users';
const ROLE_ORDER = ['USER','SUPERVISOR','ASSISTANT','ADMIN'];

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
const ALL_TASKS = () => DEPT_KEYS.flatMap(d => (TASKS[d]||[]).map(t=>({...t, dept:d})));
const taskById = id => ALL_TASKS().find(t=>t.id===id);

const ICONS = {
  dash:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="9" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="14" width="8" height="7" rx="1.5"/></svg>',
  list:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.4" fill="currentColor" stroke="none"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15.8 14.2c2.7.4 4.7 2.5 4.7 5.8"/></svg>',
  lock:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>',
  gear:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  queue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4.5h6a1 1 0 0 1 1 1V7H8V5.5a1 1 0 0 1 1-1z"/><rect x="4" y="6" width="16" height="15" rx="2"/><path d="M8.5 13.5l2.2 2.2 4.8-4.8"/></svg>',
  box:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z"/><path d="M3 7.5 12 12l9-4.5"/><path d="M12 12v9"/></svg>',
};

let profile = null, currentUser = null;
let jobs = [], roster = [], users = [];
let realtimeChannel = null;
let dateRange = 'today', deptFilter = 'ALL', searchTerm = '', activeView = 'dashboard';
let jobsPreset = 'all'; // dashboard jobs-table preset tab: all | pending | today
let prevSideCounts = {}; // last-rendered side-card job counts, for the counter animation
let firstLoad = true;    // true until the first successful data load (drives the skeleton)
let loadError = null;    // set when the initial jobs load fails (drives the error card)

// ASSISTANT sees everything ADMIN sees but can't approve/reject jobs
const isReadOnly = () => !profile || profile.role !== 'ADMIN';

// ---------- date helpers (Asia/Bangkok) ----------
function nowBkk(){ return new Date(new Date().toLocaleString('en-US', {timeZone:'Asia/Bangkok'})); }
function todayISO(){ return nowBkk().toLocaleDateString('sv-SE'); }
function daysAgoISO(n){ return new Date(nowBkk().getTime() - n*86400000).toLocaleDateString('sv-SE'); }

// ---------- auth ----------
function mapAuthError(err){
  const msg = (err && err.message) || '';
  if (/invalid login credentials/i.test(msg)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (/email not confirmed/i.test(msg)) return 'บัญชียังไม่ได้ยืนยันอีเมล';
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
  document.getElementById('loginScreen').hidden = id!=='login';
  document.getElementById('deniedScreen').hidden = id!=='denied';
  document.getElementById('appShell').hidden = id!=='app';
}

document.getElementById('loginSubmitBtn').addEventListener('click', async ()=>{
  const hint = document.getElementById('loginHint');
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  if (!email || !pass){ hint.textContent = 'กรอกอีเมลและรหัสผ่านให้ครบ'; return; }
  hint.textContent = 'กำลังเข้าสู่ระบบ...';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error){ hint.textContent = mapAuthError(error); return; }
  hint.textContent = '';
  await afterLogin(data.user);
});
document.getElementById('loginPass').addEventListener('keydown', e=>{ if (e.key==='Enter') document.getElementById('loginSubmitBtn').click(); });
document.getElementById('logoutBtn').addEventListener('click', doLogout);
document.getElementById('deniedLogoutBtn').addEventListener('click', doLogout);

// Inline password modal — replaces window.prompt()/alert(), which some browsers
// and embedded webviews silently block. `onSubmit(pw)` returns an error string
// to show in place, or null on success (then the modal closes itself).
function askNewPassword(title, onSubmit){
  const ov   = document.getElementById('pwModal');
  const a    = document.getElementById('pwNew');
  const b    = document.getElementById('pwNew2');
  const hint = document.getElementById('pwModalHint');
  const ok   = document.getElementById('pwConfirm');
  const no   = document.getElementById('pwCancel');
  document.getElementById('pwModalTitle').textContent = title || 'เปลี่ยนรหัสผ่าน';
  a.value = ''; b.value = ''; hint.textContent = ''; ok.disabled = false;
  ov.hidden = false;
  setTimeout(()=>a.focus(), 30);

  function close(){ ov.hidden = true; ok.removeEventListener('click', submit); no.removeEventListener('click', close); ov.removeEventListener('keydown', onKey); }
  function onKey(e){ if (e.key === 'Enter') submit(); else if (e.key === 'Escape') close(); }
  async function submit(){
    const p = a.value, p2 = b.value;
    if (p.length < 8){ hint.textContent = 'รหัสผ่านต้องอย่างน้อย 8 ตัว'; return; }
    if (p !== p2){ hint.textContent = 'รหัสผ่านสองครั้งไม่ตรงกัน'; return; }
    ok.disabled = true; hint.textContent = 'กำลังบันทึก...';
    const err = onSubmit ? await onSubmit(p) : null;
    if (err){ ok.disabled = false; hint.textContent = err; return; }
    hint.textContent = 'สำเร็จ';
    setTimeout(close, 700);
  }
  ok.addEventListener('click', submit);
  no.addEventListener('click', close);
  ov.addEventListener('keydown', onKey);
}

document.getElementById('changePwBtn').addEventListener('click', ()=>{
  if (!currentUser) return;
  askNewPassword('เปลี่ยนรหัสผ่านของฉัน', async (np)=>{
    const { error } = await sb.auth.updateUser({ password: np });
    return error ? ('ไม่สำเร็จ: ' + (error.message || error)) : null;
  });
});

// Non-blocking toast — replaces alert(), which webviews and the
// "prevent additional dialogs" checkbox both suppress.
function toast(msg, kind){
  let host = document.getElementById('toastHost');
  if (!host){ host = document.createElement('div'); host.id = 'toastHost'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = 'toast ' + (kind === 'ok' ? 'toast-ok' : 'toast-err');
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(()=>{ el.classList.add('leaving'); setTimeout(()=>el.remove(), 220); }, kind === 'ok' ? 2600 : 4400);
}

// In-page confirm — replaces confirm(). Resolves true/false.
function confirmModal(text, opts){
  opts = opts || {};
  return new Promise(resolve=>{
    const ov  = document.getElementById('confirmModal');
    const yes = document.getElementById('confirmYes');
    const no  = document.getElementById('confirmNo');
    document.getElementById('confirmText').textContent = text;
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
  await sb.auth.signOut();
  profile = null; currentUser = null; jobs = []; roster = [];
  if (realtimeChannel){ sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginHint').textContent = '';
  showScreen('login');
}

async function afterLogin(user){
  currentUser = user;
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (error || !data){
    document.getElementById('loginHint').textContent = 'ไม่พบข้อมูลผู้ใช้งานนี้ในระบบ';
    await sb.auth.signOut();
    return;
  }
  profile = data;
  if (profile.active === false){
    document.getElementById('deniedText').textContent = 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ';
    showScreen('denied');
    return;
  }
  if (!['ADMIN','ASSISTANT'].includes(profile.role)){
    showScreen('denied');
    return;
  }
  showScreen('app');
  await loadTasksFromDb();
  wireRealtime();
  goView('dashboard');
  await refreshAll();
}

// ---------- tasks from DB (fallback to hardcoded) ----------
async function loadTasksFromDb(){
  try{
    const { data, error } = await sb.from('tasks').select('*').eq('active', true);
    if (error) throw error;
    if (data && data.length){
      const byDept = { INB:[], OUT:[], INV:[] };
      data.forEach(t=>{
        byDept[t.department] = byDept[t.department] || [];
        byDept[t.department].push({ id:t.id, label:t.name, unit:'vehicles', unitLabel:'จำนวน' });
      });
      DEPT_KEYS.forEach(d=>{ if (byDept[d] && byDept[d].length) TASKS[d] = byDept[d]; });
    }
  }catch(e){ /* keep fallback */ }
}

// ---------- nav ----------
// Primary nav — shown in the sidebar (desktop / tablet rail) and the mobile
// bottom tab bar. `short` is the bottom-bar label.
const NAV = [
  {id:'dashboard',  label:'ภาพรวม',      short:'ภาพรวม', icon:'dash',  title:'ภาพรวม', sub:'สรุปผลงานคลังสินค้าตามช่วงเวลาที่เลือก'},
  {id:'queue',      label:'คิวอนุมัติ',   short:'คิว',    icon:'queue', title:'คิวอนุมัติ', sub:'งานที่รออนุมัติ เรียงตามความเร่งด่วน'},
  {id:'details',    label:'งานทั้งหมด',   short:'งาน',    icon:'list',  title:'งานทั้งหมด', sub:'รายการงานทุกชิ้นตามตัวกรองที่เลือก'},
  {id:'employees',  label:'พนักงาน',      short:'คน',     icon:'users', title:'พนักงาน', sub:'สรุปจำนวนงานที่ทำของพนักงานแต่ละคน'},
];
// Secondary — reached via the gear icon in the header, not the main nav.
const SECONDARY = [
  {id:'users', label:'ผู้ใช้งานระบบ', icon:'lock', title:'ผู้ใช้งานระบบ', sub:'รายชื่อบัญชีผู้ใช้งาน'},
];
const ALL_NAV = [...NAV, ...SECONDARY];

document.getElementById('navList').innerHTML = NAV.map(n=>`
  <button type="button" class="navbtn" data-view="${n.id}" aria-current="${n.id==='dashboard'}">
    <span class="nav-ic">${ICONS[n.icon]}</span><span class="nav-tx">${n.label}</span>
  </button>`).join('');
document.getElementById('botNav').innerHTML = NAV.map(n=>`
  <button type="button" class="botbtn" data-view="${n.id}" aria-current="${n.id==='dashboard'}">
    ${ICONS[n.icon]}<span>${n.short}</span>
  </button>`).join('');
document.getElementById('gearBtn').innerHTML = ICONS.gear;
document.getElementById('loginLockIcon').innerHTML = ICONS.lock;
document.getElementById('deniedLockIcon').innerHTML = ICONS.lock;
document.getElementById('brandMark').innerHTML = ICONS.box;

function goView(id){
  activeView = id;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current', b.dataset.view===id));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+id).classList.add('active');
  const n = ALL_NAV.find(x=>x.id===id) || NAV[0];
  document.getElementById('pageTitle').textContent = n.title;
  document.getElementById('pageSub').textContent = n.sub;
  if (id==='users') renderUsersTable();
  render();
}

function setJobsPreset(preset){
  jobsPreset = preset;
  document.querySelectorAll('#jobsPresets .preset').forEach(p=>
    p.setAttribute('aria-pressed', p.dataset.preset===preset));
  if (activeView!=='dashboard') goView('dashboard'); else render();
}

document.addEventListener('click', e=>{
  if (e.target.closest('#retryBtn')){ refreshAll(); return; }
  if (e.target.closest('[data-clear-filters]')){ clearFilters(); return; }

  const navBtn = e.target.closest('[data-view]');
  if (navBtn){ goView(navBtn.dataset.view); return; }

  const rangeChip = e.target.closest('#rangeChips [data-range]');
  if (rangeChip){
    document.querySelectorAll('#rangeChips .chip').forEach(c=>c.setAttribute('aria-pressed','false'));
    rangeChip.setAttribute('aria-pressed','true');
    dateRange = rangeChip.dataset.range; render(); return;
  }
  const deptChip = e.target.closest('#deptChips [data-dept]');
  if (deptChip){
    document.querySelectorAll('#deptChips .chip').forEach(c=>c.setAttribute('aria-pressed','false'));
    deptChip.setAttribute('aria-pressed','true');
    deptFilter = deptChip.dataset.dept; render(); return;
  }

  const presetBtn = e.target.closest('#jobsPresets [data-preset]');
  if (presetBtn){ setJobsPreset(presetBtn.dataset.preset); return; }

  if (e.target.closest('#actionStripBtn')){ goView('queue'); return; }

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

  const saveUserBtn = e.target.closest('[data-save-user]');
  if (saveUserBtn){ saveUserRow(saveUserBtn.dataset.saveUser); return; }
  const toggleUserBtn = e.target.closest('[data-toggle-user]');
  if (toggleUserBtn){ toggleUserActive(toggleUserBtn.dataset.toggleUser, toggleUserBtn.dataset.nextActive === 'true'); return; }
  const resetPassBtn = e.target.closest('[data-reset-pass]');
  if (resetPassBtn){ resetUserPassword(resetPassBtn.dataset.resetPass); return; }
  if (e.target.closest('#toggleAddUserBtn')){ const f = document.getElementById('addUserForm'); f.hidden = !f.hidden; return; }
  if (e.target.closest('#cancelAddUserBtn')){ document.getElementById('addUserForm').hidden = true; return; }
  if (e.target.closest('#createUserBtn')){ createUserFromForm(); return; }
});
document.getElementById('searchInput').addEventListener('input', e=>{ searchTerm = e.target.value.trim().toLowerCase(); render(); });

// ---------- data grouping (jobs table stores one row per employee) ----------
function groupJobs(rows){
  const map = new Map();
  rows.forEach(r=>{
    const key = [r.department, r.task_id, (r.details&&r.details.date)||'', (r.details&&r.details.start)||'', (r.created_at||'').slice(0,16)].join('|');
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
function filteredJobs(){
  const todayStr = todayISO();
  let fromStr = null;
  if (dateRange==='today') fromStr = todayStr;
  else if (dateRange==='week') fromStr = daysAgoISO(6);
  else if (dateRange==='month') fromStr = daysAgoISO(29);

  return jobs.filter(j=>{
    const d = j.details || {};
    if (fromStr && d.date < fromStr) return false;
    if (dateRange==='today' && d.date !== todayStr) return false;
    if (deptFilter!=='ALL' && j.department!==deptFilter) return false;
    return matchSearch(j);
  });
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
  const byName = new Map(); // name -> department (roster wins, else first job's dept)
  roster.forEach(r=>{ if (inDept(r.department)) byName.set(r.name, r.department); });
  jobs.forEach(j=>{
    if (!inDept(j.department)) return;
    (j.crew||[]).forEach(n=>{ if (!byName.has(n)) byName.set(n, j.department); });
  });
  return [...byName.entries()]
    .map(([name, department])=>({name, department}))
    .sort((a,b)=>a.name.localeCompare(b.name,'th'));
}

// ---- dashboard: month names + age formatting (Asia/Bangkok) ----
const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function rangeLabel(){
  if (dateRange==='today'){ const n = nowBkk(); return `วันนี้ (${n.getDate()} ${TH_MONTHS[n.getMonth()]})`; }
  if (dateRange==='week') return '7 วันล่าสุด';
  if (dateRange==='month') return '30 วันล่าสุด';
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
  const pend = jobs.filter(j => (j.status||'approved')==='pending'
    && (deptFilter==='ALL' || j.department===deptFilter));
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
  const depts = deptFilter==='ALL' ? DEPT_KEYS : [deptFilter];
  const dots = depts.map(d=>`<span class="legend-dot" style="background:var(--${d.toLowerCase()})"></span>`).join('');
  const deptTxt = deptFilter==='ALL' ? 'ทุกฝั่ง' : DEPT_PLAIN[deptFilter];
  let s = `${dots} กำลังดู · <b>${esc(deptTxt)}</b> · <b>${esc(rangeLabel())}</b> · ${closed.length} งาน`;
  if (searchTerm) s += ` · ค้นหา "${esc(searchTerm)}"`;
  el.innerHTML = s;
}

// per-department 7-day job counts, for the card sparklines
function daySeries(dept){
  const days = [...Array(7)].map((_,i)=>daysAgoISO(6-i));
  return days.map(dt => jobs.filter(j => (j.details&&j.details.date)===dt && j.department===dept).length);
}

// One card per side (เข้า/ออก/สต๊อก): job count + unit output + trend.
// Replaces the old dept bar list + unit-cards split panel.
function renderSideCards(closed){
  const sums = { INB:{containers:0,vehicles:0}, OUT:{vehicles:0,issue:0}, INV:{pieces:0,boxes:0} };
  closed.forEach(j=>{
    const task = taskById(j.task_id); const d = j.details||{}; if (!task) return;
    if (task.unit==='containers'){ sums.INB.containers += num(d.containers); sums.INB.vehicles += num(d.vehicles) || (num(d.containers)*(task.vehiclesPerContainer||56)); }
    else if (j.department==='INB') sums.INB.vehicles += num(d.qty);
    else if (j.department==='OUT'){ sums.OUT.vehicles += num(d.qty); if (task.hasIssue && d.hasIssue) sums.OUT.issue += num(d.issueCount); }
    else if (task.unit==='boxes') sums.INV.boxes += num(d.qty);
    else if (task.unit==='pieces') sums.INV.pieces += num(d.qty);
  });
  // was any INB vehicle figure derived from a container multiplier (vs counted)?
  const inbDerived = closed.some(j=>{
    const t = taskById(j.task_id); const d = j.details||{};
    return t && t.unit==='containers' && num(d.containers) && !num(d.vehicles);
  });

  const counts = {};
  const html = DEPT_KEYS.map(dept=>{
    const count = closed.filter(j=>j.department===dept).length;
    counts[dept] = count;
    const series = daySeries(dept);
    const smax = Math.max(1, ...series);
    const spark = series.map(v=>`<i class="${v>0?'on':''}" style="height:${Math.max(2,Math.round(v/smax*26))}px"></i>`).join('');
    let unit, cvt = '';
    if (dept==='INB'){
      if (num(sums.INB.containers)){
        unit = `<span class="approx">${num(sums.INB.containers)} ตู้ ${inbDerived?'≈':'·'} ${num(sums.INB.vehicles)} คัน</span>`;
        if (inbDerived) cvt = '(56 คัน/ตู้ — ประมาณ)';
      } else {
        unit = `${num(sums.INB.vehicles)} คัน`;
      }
    } else if (dept==='OUT'){
      unit = `${num(sums.OUT.vehicles)} คัน`;
    } else {
      unit = `${num(sums.INV.pieces)} ชิ้น<br>${num(sums.INV.boxes)} กล่อง`;
    }
    const issue = (dept==='OUT' && num(sums.OUT.issue))
      ? `<span class="badge issue sc-issue">มีปัญหา ${num(sums.OUT.issue)} คัน</span>` : '';
    return `<div class="side-card" data-dept="${dept}">
      <div class="sc-cap"></div>
      <div class="sc-body">
        <div class="sc-lab"><span class="dot" style="background:var(--${dept.toLowerCase()})"></span>${DEPT_PLAIN[dept]}</div>
        <div class="sc-big"><span class="sc-big-n num">${count}</span><span class="u">งาน</span></div>
        <div class="sc-unit">${unit}</div>
        ${cvt ? `<div class="sc-cvt">${cvt}</div>` : ''}
        ${issue}
      </div>
      <div class="sc-spark">${spark}</div>
    </div>`;
  }).join('');
  document.getElementById('sideCards').innerHTML = html;
  if (window.Anim) DEPT_KEYS.forEach(dept=>{
    const card = document.querySelector(`.side-card[data-dept="${dept}"]`);
    if (!card) return;
    Anim.count(card.querySelector('.sc-big-n'), counts[dept], prevSideCounts[dept]);
    Anim.bars(card.querySelector('.sc-spark'), 'i', { stiffness:90, damping:16, stagger:28 });
  });
  prevSideCounts = counts;
}

function renderDayChart(){
  const days = [...Array(7)].map((_,i)=>daysAgoISO(6-i));
  const counts = days.map(d=> jobs.filter(j=> (j.details&&j.details.date)===d && (deptFilter==='ALL'||j.department===deptFilter)).length);
  const max = Math.max(1, ...counts);
  const wd = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  document.getElementById('dayChart').innerHTML = days.map((d,i)=>{
    const h = Math.max(4, Math.round(counts[i]/max*90));
    const dow = wd[new Date(d+'T00:00:00').getDay()];
    return `<div class="daybar-wrap">
      <span class="daybar-val num">${counts[i]||''}</span>
      <span class="daybar" style="height:${h}px"></span>
      <span class="daybar-lbl">${dow}</span>
    </div>`;
  }).join('');
  if (window.Anim) Anim.bars(document.getElementById('dayChart'), '.daybar', { stiffness:90, damping:16, stagger:40 });
}

// One row renderer, shared by the dashboard table and the "งานทั้งหมด" view —
// they were two divergent tables (6 cols vs 9) before.
function jobRowHTML(j){
  const task = taskById(j.task_id); const d = j.details||{};
  const status = j.status || 'approved';
  const canAct = !isReadOnly() && status==='pending';
  return `<tr>
    <td class="mono">${esc(d.date)}</td>
    <td><span class="badge ${esc(j.department)}"><span class="dot"></span>${DEPT_PLAIN[j.department]||esc(j.department)}</span></td>
    <td class="td-task">${esc(task?task.label:j.task_id)}</td>
    <td>${esc((j.crew||[]).join(', '))}</td>
    <td class="mono">${esc(d.start||'–')}–${esc(d.end||'–')}</td>
    <td class="mono">${d.mins == null ? '–' : num(d.mins)}</td>
    <td class="mono">${esc(formatResult(d,task))}</td>
    <td><span class="status-badge ${esc(status)}">${STATUS_LABEL[status]||esc(status)}</span></td>
    <td>${canAct ? `
      <button type="button" class="mini-btn approve" data-approve-job="${esc(j.id)}">อนุมัติ</button>
      <button type="button" class="mini-btn reject" data-reject-job="${esc(j.id)}">ไม่อนุมัติ</button>
    ` : '–'}</td>
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
    : emptyRow(9, emptyMsg || 'ไม่พบรายการ');
}

// Dashboard bottom table — filtered set, narrowed by the preset tabs, capped.
function renderDashJobs(closed){
  let rows = closed;
  if (jobsPreset==='pending') rows = closed.filter(j=>(j.status||'approved')==='pending');
  else if (jobsPreset==='today'){ const t = todayISO(); rows = closed.filter(j=>(j.details&&j.details.date)===t); }
  rows = [...rows].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')).slice(0,12);
  renderJobRows(document.querySelector('#dashJobsTable tbody'), rows,
    jobsPreset==='pending' ? 'ไม่มีงานรออนุมัติในช่วงนี้' : 'ยังไม่มีงานที่บันทึกในช่วงนี้');
}

function renderDetailsTable(closed){
  const key = j => ((j.details&&j.details.date)||'') + ((j.details&&j.details.start)||'');
  const rows = [...closed].sort((a,b)=>key(b).localeCompare(key(a)));
  renderJobRows(document.querySelector('#detailsTable tbody'), rows, 'ไม่พบรายการที่ตรงกับตัวกรอง');
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

// ===================== APPROVAL QUEUE (phase 3) =====================
// Pending jobs in the current department scope, ignoring the date filter —
// an old pending job still needs approving even while looking at "วันนี้".
function queuePending(){
  return jobs.filter(j => (j.status||'approved')==='pending'
    && (deptFilter==='ALL' || j.department===deptFilter)
    && matchSearch(j));
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
  const byDept = DEPT_KEYS.map(d=>({ d, n: list.filter(x=>x.department===d).length })).filter(x=>x.n);
  if (ro || byDept.length < 1){
    bar.hidden = true; bar.innerHTML = '';
  } else {
    bar.hidden = false;
    bar.innerHTML = `<span class="q-batch-lbl">อนุมัติทั้งฝั่ง:</span>` +
      byDept.map(({d,n})=>`<button type="button" class="btn-sm" data-approve-dept="${d}">${DEPT_PLAIN[d]} (${n})</button>`).join('');
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
          <span class="badge ${esc(j.department)}"><span class="dot"></span>${DEPT_PLAIN[j.department]||esc(j.department)}</span>
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
  const okGo = await confirmModal(`อนุมัติงานฝั่ง${DEPT_PLAIN[dept]}ทั้งหมด ${list.length} งาน?`, { yes:'อนุมัติทั้งหมด' });
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
  const n = jobs.filter(j => (j.status||'approved')==='pending'
    && (deptFilter==='ALL' || j.department===deptFilter)).length;
  document.querySelectorAll('[data-view="queue"]').forEach(btn=>{
    let b = btn.querySelector('.nav-badge');
    if (n){
      if (!b){ b = document.createElement('span'); b.className = 'nav-badge'; btn.appendChild(b); }
      b.textContent = n;
    } else if (b){ b.remove(); }
  });
}

function renderEmployeesTable(closed){
  const people = peopleInScope();
  const tbody = document.querySelector('#employeesTable tbody');
  if (people.length===0){ tbody.innerHTML = emptyRow(4, 'ยังไม่มีพนักงานในขอบเขตนี้'); return; }
  tbody.innerHTML = people.map(r=>{
    const inRange = closed.filter(j=>(j.crew||[]).includes(r.name)).length;
    const total = jobs.filter(j=>(j.crew||[]).includes(r.name)).length;
    const initials = esc(r.name.trim().slice(0,1));
    const deptCell = r.department
      ? `<span class="badge ${esc(r.department)}"><span class="dot"></span>${DEPT_PLAIN[r.department]||esc(r.department)}</span>`
      : '<span class="td-sub">–</span>';
    return `<tr>
      <td><span class="emp-name-cell"><span class="emp-avatar">${initials}</span>${esc(r.name)}</span></td>
      <td>${deptCell}</td>
      <td class="mono">${num(inRange)}</td>
      <td class="mono">${num(total)}</td>
    </tr>`;
  }).join('');
}

function roleOptions(sel){
  return ROLE_ORDER.map(r=>`<option value="${r}" ${sel===r?'selected':''}>${ROLE_LABEL[r]}</option>`).join('');
}
function deptOptions(sel){
  return `<option value="">— ไม่มีแผนก —</option>` +
    DEPT_KEYS.map(d=>`<option value="${d}" ${sel===d?'selected':''}>${DEPT_PLAIN[d]}</option>`).join('');
}

function renderUsersTable(){
  const tbody = document.querySelector('#usersTable tbody');
  if (!tbody) return;
  const ro = isReadOnly();
  const bar = document.getElementById('userAdminBar');
  if (bar) bar.hidden = ro;
  if (ro){ const f = document.getElementById('addUserForm'); if (f) f.hidden = true; }
  const note = document.getElementById('usersViewNote');
  if (note) note.textContent = ro
    ? 'รายชื่อผู้ใช้งานในระบบ (อ่านอย่างเดียว)'
    : 'เพิ่มบัญชี / แก้สิทธิ์-แผนก-รหัสพนักงาน / ปิดใช้งานได้จากที่นี่ · การลบถาวรทำที่ Supabase dashboard';
  const nuRole = document.getElementById('nuRole');
  if (!ro && nuRole && !nuRole.options.length){
    nuRole.innerHTML = roleOptions('USER');
    document.getElementById('nuDept').innerHTML = deptOptions('');
  }

  if (users.length===0){ tbody.innerHTML = `<tr><td colspan="6" class="empty-note">ไม่พบข้อมูลผู้ใช้งาน</td></tr>`; return; }
  tbody.innerHTML = users.map(u=>{
    const active = u.active !== false;
    const isSelf = currentUser && u.id === currentUser.id;
    const deptBadge = u.department
      ? `<span class="badge ${esc(u.department)}"><span class="dot"></span>${DEPT_PLAIN[u.department]||esc(u.department)}</span>`
      : '<span class="td-sub">ทุกแผนก</span>';
    const statusBadge = `<span class="status-badge ${active?'approved':'rejected'}">${active?'ใช้งาน':'ปิดใช้งาน'}</span>`;
    if (ro){
      return `<tr>
        <td>${esc(u.full_name||'–')}</td>
        <td><span class="badge role">${ROLE_LABEL[u.role]||esc(u.role)}</span></td>
        <td>${deptBadge}</td>
        <td>${esc(u.employee_code || '–')}</td>
        <td>${statusBadge}</td>
        <td></td>
      </tr>`;
    }
    return `<tr data-user-row="${esc(u.id)}" class="${active?'':'row-inactive'}">
      <td>${esc(u.full_name||'–')}</td>
      <td><select class="mini-select" data-u-role ${isSelf?'disabled title="เปลี่ยนสิทธิ์ตัวเองไม่ได้"':''}>${roleOptions(u.role)}</select></td>
      <td><select class="mini-select" data-u-dept>${deptOptions(u.department)}</select></td>
      <td><input type="text" class="code-input" data-u-code value="${esc(u.employee_code||'')}" placeholder="รหัส"></td>
      <td>${isSelf ? statusBadge
        : `<button type="button" class="mini-btn ${active?'reject':'approve'}" data-toggle-user="${esc(u.id)}" data-next-active="${active?'false':'true'}">${active?'ปิดใช้งาน':'เปิดใช้งาน'}</button>`}</td>
      <td>
        <button type="button" class="mini-btn approve" data-save-user="${esc(u.id)}">บันทึก</button>
        <button type="button" class="mini-btn" data-reset-pass="${esc(u.id)}">รีเซ็ตรหัส</button>
      </td>
    </tr>`;
  }).join('');
}

async function saveUserRow(userId){
  const row = document.querySelector(`tr[data-user-row="${userId}"]`);
  if (!row) return;
  const role = row.querySelector('[data-u-role]').value;
  const noDept = role === 'ADMIN' || role === 'ASSISTANT';
  const department = noDept ? null : (row.querySelector('[data-u-dept]').value || null);
  const employee_code = row.querySelector('[data-u-code]').value.trim() || null;
  if (!noDept && !department){ toast('SUPERVISOR / USER ต้องระบุแผนก'); return; }
  const btn = row.querySelector('[data-save-user]');
  const label = btn.textContent; btn.textContent = '...'; btn.disabled = true;
  try{
    const { error } = await sb.from('profiles').update({ role, department, employee_code }).eq('id', userId);
    if (error) throw error;
    await refreshUsers(); renderUsersTable();
    toast('บันทึกแล้ว', 'ok');
  }catch(err){
    toast('บันทึกไม่สำเร็จ: ' + mapDbError(err));
    btn.textContent = label; btn.disabled = false;
  }
}

async function toggleUserActive(userId, next){
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

async function createUserFromForm(){
  const hint = document.getElementById('addUserHint');
  const email = document.getElementById('nuEmail').value.trim();
  const full_name = document.getElementById('nuName').value.trim();
  const password = document.getElementById('nuPass').value;
  const role = document.getElementById('nuRole').value;
  const department = document.getElementById('nuDept').value || null;
  if (!email || !full_name || !password){ hint.textContent = 'กรอก อีเมล / ชื่อ / รหัสผ่าน ให้ครบ'; return; }
  if (password.length < 8){ hint.textContent = 'รหัสผ่านต้องอย่างน้อย 8 ตัว'; return; }
  if ((role === 'SUPERVISOR' || role === 'USER') && !department){ hint.textContent = 'SUPERVISOR / USER ต้องระบุแผนก'; return; }
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
      body: JSON.stringify({ action: 'create', email, password, full_name, role, department }),
    });
    const out = await res.json().catch(()=>({}));
    if (!res.ok || out.error) throw new Error(out.error || ('HTTP ' + res.status));
    hint.textContent = `สร้างบัญชี ${email} แล้ว`;
    ['nuEmail','nuName','nuPass'].forEach(id=>{ document.getElementById(id).value = ''; });
    await refreshUsers(); renderUsersTable();
    setTimeout(()=>{ document.getElementById('addUserForm').hidden = true; hint.textContent = ''; }, 1400);
  }catch(err){ hint.textContent = 'ไม่สำเร็จ: ' + err.message; }
}

// ---------- view state: loading skeleton / load-error card ----------
function isFiltered(){ return dateRange!=='all' || deptFilter!=='ALL' || !!searchTerm; }

function clearFilters(){
  dateRange = 'all'; deptFilter = 'ALL'; searchTerm = '';
  const s = document.getElementById('searchInput'); if (s) s.value = '';
  document.querySelectorAll('#rangeChips .chip').forEach(c=>c.setAttribute('aria-pressed', c.dataset.range==='all'));
  document.querySelectorAll('#deptChips .chip').forEach(c=>c.setAttribute('aria-pressed', c.dataset.dept==='ALL'));
  render();
}

function skeletonHTML(){
  const b = n => Array(n).fill('<div class="sk sk-row"></div>').join('');
  if (activeView==='dashboard')
    return `<div class="sk sk-strip"></div>
      <div class="sk-cards"><div class="sk sk-card"></div><div class="sk sk-card"></div><div class="sk sk-card"></div></div>
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
  const closed = filteredJobs();
  updatePendingBadges();
  if (activeView==='dashboard'){
    renderActionStrip(); renderScopeLine(closed); renderSideCards(closed); renderDayChart(); renderDashJobs(closed);
  } else if (activeView==='queue'){
    renderQueue();
  } else if (activeView==='details'){
    renderDetailsTable(closed);
  } else if (activeView==='employees'){
    renderEmployeesTable(closed);
  } else if (activeView==='users'){
    renderUsersTable();
  }
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
async function refreshUsers(){
  try{
    const { data, error } = await sb.from('profiles').select('*')
      .order('active', { ascending: false }).order('full_name');
    if (error) throw error;
    users = data || [];
  }catch(e){ /* admin-only view; ignore errors for non-critical panel */ }
}
async function refreshAll(){
  document.getElementById('syncText').textContent = 'กำลังโหลดข้อมูล...';
  loadError = null;
  if (firstLoad) render();                        // paints the skeleton
  const [jobsRes] = await Promise.allSettled([refreshJobs(), refreshRoster(), refreshUsers()]);
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
    .on('postgres_changes', {event:'*', schema:'public', table:'employees'}, softRefresh(refreshRoster))
    .subscribe();
}

// ---------- boot ----------
render();
showScreen('login');
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user){
    await afterLogin(session.user);
  }
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT'){ showScreen('login'); }
  });
})();
