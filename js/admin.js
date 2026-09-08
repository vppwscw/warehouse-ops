// ===================== SUPABASE INIT =====================

const DEPT_KEYS = ['INB','OUT','INV'];
const DEPT_PLAIN = { INB:'INBOUND', OUT:'OUTBOUND', INV:'INVENTORY' };
const WH_KEYS = ['A','B'];
const WH_PLAIN = { A:'คลัง A', B:'คลัง B' };
const ROLE_LABEL = { ADMIN:'ผู้ดูแลระบบ', ASSISTANT:'ผู้ช่วยผู้จัดการ', SUPERVISOR:'หัวหน้างาน', USER:'พนักงาน' };
const STATUS_LABEL = { pending:'รออนุมัติ', approved:'อนุมัติแล้ว', rejected:'ไม่อนุมัติ', open:'กำลังทำงาน' };
const ADMIN_USERS_FN = SUPABASE_URL + '/functions/v1/admin-users';
const ROLE_ORDER = ['USER','SUPERVISOR','ASSISTANT','ADMIN'];
// Users-view display order: most-privileged first, active before inactive, then name.
const ROLE_RANK = { ADMIN:0, SUPERVISOR:1, ASSISTANT:2, USER:3 };

// POST to the admin-users Edge Function with the caller's session token.
async function callAdminFn(payload){
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
  return out;
}

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
  matrix:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="6" height="6" rx="1.4"/><rect x="14.5" y="3.5" width="6" height="6" rx="1.4"/><rect x="3.5" y="14.5" width="6" height="6" rx="1.4"/><rect x="14.5" y="14.5" width="6" height="6" rx="1.4"/></svg>',
};

let profile = null, currentUser = null;
let jobs = [], roster = [], users = [], allEmployees = [], taskList = [], scopes = [];
let userEmails = {};   // { profileId: email } — pulled from auth.users via the Edge Function
let realtimeChannel = null;
let dateRange = 'today', deptFilter = 'ALL', whFilter = 'ALL', searchTerm = '', activeView = 'dashboard';
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

// Which app(s) this account may open. An explicit profiles.apps wins; otherwise
// the role default. 'erp' = admin.html, 'mobile' = index.html.
function allowedApps(p){
  if (p && Array.isArray(p.apps) && p.apps.length) return p.apps;
  if (!p) return [];
  if (p.role === 'ADMIN') return ['erp','mobile'];
  if (p.role === 'ASSISTANT') return ['erp'];
  return ['mobile'];
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
  if (!allowedApps(profile).includes('erp')){
    document.getElementById('deniedText').textContent = 'บัญชีนี้ไม่มีสิทธิ์ใช้ Skill Matrix';
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
        byDept[t.department].push({ id:t.id, label:t.name, department:t.department,
          unit: t.unit_label ? 'custom' : 'vehicles', unitLabel: t.unit_label || 'จำนวน' });
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
  {id:'tasks',      label:'ชนิดงาน',      short:'ชนิด',   icon:'box',   title:'ชนิดงาน', sub:'ชนิดงานทั้งหมดของแต่ละฝั่ง — ปิดใช้งานหรือลบถาวรได้'},
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
document.getElementById('loginLockIcon').innerHTML = ICONS.matrix;
document.getElementById('deniedLockIcon').innerHTML = ICONS.lock;
document.getElementById('brandMark').innerHTML = ICONS.matrix;

function goView(id){
  activeView = id;
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
  const whChip = e.target.closest('#whChips [data-wh]');
  if (whChip){
    document.querySelectorAll('#whChips .chip').forEach(c=>c.setAttribute('aria-pressed','false'));
    whChip.setAttribute('aria-pressed','true');
    whFilter = whChip.dataset.wh; render(); return;
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
  if (e.target.closest('#exportCsvBtn')){ exportJobsCsv(); return; }

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
  if (e.target.closest('#createUserBtn')){ createUserFromForm(); return; }

  const empToggle = e.target.closest('[data-emp-toggle]');
  if (empToggle){ toggleEmpActive(empToggle.dataset.empToggle, empToggle.dataset.next === 'true'); return; }
  const empDel = e.target.closest('[data-emp-del]');
  if (empDel){ deleteEmp(empDel.dataset.empDel); return; }
  if (e.target.closest('#toggleAddEmpBtn')){ const f = document.getElementById('addEmpForm'); f.hidden = !f.hidden; return; }
  if (e.target.closest('#cancelAddEmpBtn')){ document.getElementById('addEmpForm').hidden = true; return; }
  if (e.target.closest('#createEmpBtn')){ createEmpFromForm(); return; }
});
document.getElementById('searchInput').addEventListener('input', e=>{ searchTerm = e.target.value.trim().toLowerCase(); render(); });

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
  let fromStr = null;
  if (dateRange==='today') fromStr = todayStr;
  else if (dateRange==='week') fromStr = daysAgoISO(6);
  else if (dateRange==='month') fromStr = daysAgoISO(29);

  return jobs.filter(j=>{
    const d = j.details || {};
    if (fromStr && d.date < fromStr) return false;
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
      DEPT_PLAIN[j.department]||j.department||'',
      task ? task.label : (j.task_id||''),
      (j.crew||[]).join(' / '),
      d.start||'', d.end||'', (d.mins==null?'':num(d.mins)),
      qty, unit,
      (task && task.hasIssue && d.hasIssue) ? num(d.issueCount) : '',
      STATUS_LABEL[j.status||'approved'] || j.status || '',
    ].map(csvCell).join(','));
  });
  const scope = deptFilter==='ALL' ? 'ทุกฝั่ง' : (DEPT_PLAIN[deptFilter]||deptFilter);
  const whScope = whFilter==='ALL' ? 'ทุกคลัง' : (WH_PLAIN[whFilter]||whFilter);
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `warehouse-jobs_${whScope}_${scope}_${dateRange}_${todayISO()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast(`ส่งออก ${rows.length} รายการ`, 'ok');
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
  const byName = new Map(); // name -> department (roster wins, else first job's dept)
  roster.forEach(r=>{ if (inDept(r.department) && inWh(r.warehouse)) byName.set(r.name, r.department); });
  jobs.forEach(j=>{
    if (!inDept(j.department) || !inWh(j.warehouse)) return;
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
  const depts = deptFilter==='ALL' ? DEPT_KEYS : [deptFilter];
  const dots = depts.map(d=>`<span class="legend-dot" style="background:var(--${d.toLowerCase()})"></span>`).join('');
  const deptTxt = deptFilter==='ALL' ? 'ทุกฝั่ง' : DEPT_PLAIN[deptFilter];
  const whTxt = whFilter==='ALL' ? 'ทุกคลัง' : WH_PLAIN[whFilter];
  let s = `${dots} กำลังดู · <b>${esc(whTxt)}</b> · <b>${esc(deptTxt)}</b> · <b>${esc(rangeLabel())}</b> · ${closed.length} งาน`;
  if (searchTerm) s += ` · ค้นหา "${esc(searchTerm)}"`;
  el.innerHTML = s;
}

// per-department 7-day job counts, for the card sparklines
function daySeries(dept){
  const days = [...Array(7)].map((_,i)=>daysAgoISO(6-i));
  const inWh = j => whFilter==='ALL' || j.warehouse===whFilter;
  return days.map(dt => jobs.filter(j => (j.details&&j.details.date)===dt && j.department===dept && inWh(j)).length);
}

// One card per side (เข้า/ออก/สต๊อก): job count + unit output + trend.
// Replaces the old dept bar list + unit-cards split panel.
function renderSideCards(closed){
  const sums = { INB:{containers:0,vehicles:0}, OUT:{vehicles:0,issue:0}, INV:{pieces:0,boxes:0} };
  const customByDept = { INB:{}, OUT:{}, INV:{} }; // dept -> { unitLabel: qty }
  closed.forEach(j=>{
    const task = taskById(j.task_id); const d = j.details||{}; if (!task) return;
    if (task.unit==='custom'){
      const bag = customByDept[j.department] || (customByDept[j.department] = {});
      bag[task.unitLabel] = (bag[task.unitLabel] || 0) + num(d.qty);
      if (task.hasIssue && d.hasIssue && j.department==='OUT') sums.OUT.issue += num(d.issueCount);
      return;
    }
    if (task.unit==='containers'){ sums.INB.containers += num(d.containers); sums.INB.vehicles += num(d.vehicles) || (num(d.containers)*(task.vehiclesPerContainer||56)); }
    else if (j.department==='INB') sums.INB.vehicles += num(d.qty);
    else if (j.department==='OUT'){ sums.OUT.vehicles += num(d.qty); if (task.hasIssue && d.hasIssue) sums.OUT.issue += num(d.issueCount); }
    else if (task.unit==='boxes') sums.INV.boxes += num(d.qty);
    else if (task.unit==='pieces') sums.INV.pieces += num(d.qty);
  });
  const customLines = dept => Object.entries(customByDept[dept]||{})
    .map(([lab,q])=>`${num(q)} ${esc(lab)}`).join('<br>');
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
    const cl = customLines(dept);
    const onlyCustom = !!cl && !num(sums.INB.containers) && !num(sums.INB.vehicles)
      && !num(sums.OUT.vehicles) && !num(sums.INV.pieces) && !num(sums.INV.boxes);
    if (dept==='INB'){
      if (num(sums.INB.containers)){
        unit = `<span class="approx">${num(sums.INB.containers)} ตู้ ${inbDerived?'≈':'·'} ${num(sums.INB.vehicles)} คัน</span>`;
        if (inbDerived) cvt = '(56 คัน/ตู้ — ประมาณ)';
      } else {
        unit = onlyCustom ? '' : `${num(sums.INB.vehicles)} คัน`;
      }
    } else if (dept==='OUT'){
      unit = onlyCustom ? '' : `${num(sums.OUT.vehicles)} คัน`;
    } else {
      unit = onlyCustom ? '' : `${num(sums.INV.pieces)} ชิ้น<br>${num(sums.INV.boxes)} กล่อง`;
    }
    if (cl) unit += (unit ? '<br>' : '') + cl;
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
  const counts = days.map(d=> jobs.filter(j=> (j.details&&j.details.date)===d && matchScope(j)).length);
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
    <td><span class="wh-tag">${esc(WH_PLAIN[j.warehouse]||j.warehouse||'–')}</span></td>
    <td><span class="badge ${esc(j.department)}"><span class="dot"></span>${DEPT_PLAIN[j.department]||esc(j.department)}</span></td>
    <td class="td-task">${esc(task?task.label:j.task_id)}</td>
    <td>${esc((j.crew||[]).join(', '))}</td>
    <td class="mono">${esc(d.start||'–')}–${esc(d.end||'–')}</td>
    <td class="mono">${d.mins == null ? '–' : num(d.mins)}</td>
    <td class="mono">${esc(formatResult(d,task))}</td>
    <td><span class="status-badge ${esc(status)}">${STATUS_LABEL[status]||esc(status)}</span></td>
    <td>${[
      canAct ? `<button type="button" class="mini-btn approve" data-approve-job="${esc(j.id)}">อนุมัติ</button>` : '',
      canAct ? `<button type="button" class="mini-btn reject" data-reject-job="${esc(j.id)}">ไม่อนุมัติ</button>` : '',
      isReadOnly() ? '' : `<button type="button" class="mini-btn reject" data-del-job="${esc(j.id)}">ลบ</button>`,
    ].filter(Boolean).join(' ') || '–'}</td>
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
    { danger:true, yes:'ลบถาวร' });
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
          <span class="wh-tag">${esc(WH_PLAIN[j.warehouse]||j.warehouse||'–')}</span>
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
  const okGo = await confirmModal(`อนุมัติงานฝั่ง ${DEPT_PLAIN[dept]} ทั้งหมด ${list.length} งาน?`, { yes:'อนุมัติทั้งหมด' });
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
  if (bar) bar.hidden = ro;
  if (wrap) wrap.hidden = ro;
  if (ro){ const f = document.getElementById('addEmpForm'); if (f) f.hidden = true; return; }
  const neDept = document.getElementById('neDept');
  if (neDept && !neDept.options.length) neDept.innerHTML = deptOptions(DEPT_KEYS[0]);
  const neWh = document.getElementById('neWh');
  if (neWh && !neWh.options.length) neWh.innerHTML = WH_KEYS.map(w=>`<option value="${w}">${WH_PLAIN[w]}</option>`).join('');
  const tb = document.querySelector('#empRosterTable tbody');
  if (!tb) return;
  const list = allEmployees.filter(em => whFilter==='ALL' || em.warehouse===whFilter);
  if (!list.length){ tb.innerHTML = emptyRow(5, 'ยังไม่มีพนักงานในรายชื่อ — กด ＋ เพิ่มพนักงาน'); return; }
  tb.innerHTML = list.map(em=>{
    const on = em.active !== false;
    return `<tr class="${on?'':'row-inactive'}">
      <td>${esc(em.name)}</td>
      <td><span class="wh-tag">${esc(WH_PLAIN[em.warehouse]||em.warehouse||'–')}</span></td>
      <td><span class="badge ${esc(em.department)}"><span class="dot"></span>${DEPT_PLAIN[em.department]||esc(em.department)}</span></td>
      <td><span class="status-badge ${on?'approved':'rejected'}">${on?'ใช้งาน':'ปิดใช้งาน'}</span></td>
      <td>
        <button type="button" class="mini-btn ${on?'reject':'approve'}" data-emp-toggle="${esc(em.id)}" data-next="${on?'false':'true'}">${on?'ปิดใช้งาน':'เปิดใช้งาน'}</button>
        <button type="button" class="mini-btn reject" data-emp-del="${esc(em.id)}">ลบถาวร</button>
      </td>
    </tr>`;
  }).join('');
}

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
  const cols = ro ? 4 : 5;
  const tb = document.querySelector('#tasksTable tbody');
  if (!tb) return;
  const list = taskList.filter(t => whFilter==='ALL' || t.warehouse===whFilter);
  if (!list.length){ tb.innerHTML = `<tr><td colspan="${cols}" class="empty-note">ยังไม่มีชนิดงาน${whFilter!=='ALL'?'ในคลังนี้':''} — หัวหน้างานเพิ่มได้จากแอปมือถือ</td></tr>`; return; }
  tb.innerHTML = list.map(t=>{
    const on = t.active !== false;
    const linked = jobs.reduce((n,j)=> n + (j.task_id===t.id ? ((j.rowIds&&j.rowIds.length)||1) : 0), 0);
    return `<tr class="${on?'':'row-inactive'}">
      <td>${esc(t.name)}${t.unit_label ? ` <span style="color:var(--ink-dim);font-size:12px;">· ${esc(t.unit_label)}</span>` : ''}</td>
      <td><span class="wh-tag">${esc(WH_PLAIN[t.warehouse]||t.warehouse||'–')}</span></td>
      <td><span class="badge ${esc(t.department)}"><span class="dot"></span>${DEPT_PLAIN[t.department]||esc(t.department)}</span></td>
      <td class="mono">${linked || ''}</td>
      ${ro ? '' : `<td>
        <button type="button" class="mini-btn ${on?'reject':'approve'}" data-task-toggle="${esc(t.id)}" data-next="${on?'false':'true'}">${on?'ปิดใช้งาน':'เปิดใช้งาน'}</button>
        <button type="button" class="mini-btn reject" data-task-del="${esc(t.id)}">ลบถาวร</button>
      </td>`}
    </tr>`;
  }).join('');
}
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
    setTimeout(()=>{ document.getElementById('addEmpForm').hidden = true; hint.textContent = ''; }, 1200);
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
  return DEPT_KEYS.map(d=>`<option value="${d}" ${sel===d?'selected':''}>${DEPT_PLAIN[d]}</option>`).join('');
}
// A SUPERVISOR / USER may cover more than one department (profiles.departments).
function userDepts(u){
  if (Array.isArray(u.departments) && u.departments.length) return u.departments;
  return u.department ? [u.department] : [];
}
function deptCheckboxes(selected, cls){
  const set = new Set(selected || []);
  return `<span class="dept-cb-row">` + DEPT_KEYS.map(d=>
    `<label class="dept-cb"><input type="checkbox" class="${cls}" value="${d}" ${set.has(d)?'checked':''}> ${esc(DEPT_PLAIN[d]||d)}</label>`
  ).join('') + `</span>`;
}

// ---------- staff_scope: the (warehouse × department) grant grid ----------
function userScopePairs(uid){
  return scopes.filter(s=>s.profile_id===uid).map(s=>({ warehouse:s.warehouse, department:s.department }));
}
function scopeGridHTML(pairs, cls){
  const set = new Set((pairs||[]).map(p=>p.warehouse+':'+p.department));
  return `<table class="scope-grid"><thead><tr><th></th>${WH_KEYS.map(w=>`<th title="${esc(WH_PLAIN[w])}">${esc(w)}</th>`).join('')}</tr></thead><tbody>`
    + DEPT_KEYS.map(d=>`<tr><th title="${esc(DEPT_PLAIN[d])}">${esc(d)}</th>` + WH_KEYS.map(w=>
        `<td><input type="checkbox" class="${cls}" data-wh="${w}" data-dept="${d}"${set.has(w+':'+d)?' checked':''}></td>`
      ).join('') + `</tr>`).join('')
    + `</tbody></table>`;
}
function readScopeGrid(root, cls){
  return [...root.querySelectorAll('.'+cls+':checked')].map(c=>({ warehouse:c.dataset.wh, department:c.dataset.dept }));
}
function scopeSummary(pairs){
  if (!pairs.length) return '<span class="td-sub">ยังไม่กำหนด</span>';
  return WH_KEYS.filter(w=>pairs.some(p=>p.warehouse===w)).map(w=>{
    const ds = DEPT_KEYS.filter(d=>pairs.some(p=>p.warehouse===w && p.department===d));
    return `<span class="scope-sum"><b>${esc(WH_PLAIN[w])}</b> ` + ds.map(d=>esc(DEPT_PLAIN[d])).join(', ') + `</span>`;
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
function appCheckboxes(selected, cls){
  const set = new Set(selected || []);
  return `<span class="dept-cb-row">` + ['erp','mobile'].map(a=>
    `<label class="dept-cb"><input type="checkbox" class="${cls}" value="${a}" ${set.has(a)?'checked':''}> ${APP_LABEL[a]}</label>`
  ).join('') + `</span>`;
}

// Users-view sort: active first, then most-privileged role, then name (Thai).
function sortedUsers(){
  return users.slice().sort((a,b)=>
    ((a.active!==false?0:1) - (b.active!==false?0:1))
    || ((ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9))
    || String(a.full_name||'').localeCompare(String(b.full_name||''), 'th'));
}

function renderUsersTable(){
  const wrap = document.getElementById('usersList');
  if (!wrap) return;
  const ro = isReadOnly();
  const bar = document.getElementById('userAdminBar');
  if (bar) bar.hidden = ro;
  if (ro){ const f = document.getElementById('addUserForm'); if (f) f.hidden = true; }
  const note = document.getElementById('usersViewNote');
  if (note) note.textContent = ro
    ? 'รายชื่อผู้ใช้งานในระบบ (อ่านอย่างเดียว)'
    : 'เพิ่มบัญชี / แก้สิทธิ์-แผนก-รหัสพนักงาน / ปิดใช้งาน หรือ ลบถาวรได้จากที่นี่ · บัญชีที่มีประวัติงานลบถาวรไม่ได้ ให้ปิดใช้งานแทน';
  const nuRole = document.getElementById('nuRole');
  if (!ro && nuRole && !nuRole.options.length){
    nuRole.innerHTML = roleOptions('USER');
    const grid = document.getElementById('nuScopeGrid');
    if (grid) grid.innerHTML = scopeGridHTML([], 'nu-scope-cb');
    const acbs = document.getElementById('nuAppCbs');
    if (acbs) acbs.innerHTML = ['erp','mobile'].map(a=>
      `<label class="dept-cb"><input type="checkbox" class="nu-app-cb" value="${a}"> ${APP_LABEL[a]}</label>`).join('');
  }

  if (users.length===0){ wrap.innerHTML = `<p class="empty-note">ไม่พบข้อมูลผู้ใช้งาน</p>`; return; }

  const q = searchTerm;
  let list = sortedUsers();
  if (q) list = list.filter(u=>
    (u.full_name||'').toLowerCase().includes(q)
    || (userEmails[u.id]||'').toLowerCase().includes(q)
    || (u.employee_code||'').toLowerCase().includes(q)
    || (ROLE_LABEL[u.role]||'').toLowerCase().includes(q));
  if (list.length===0){ wrap.innerHTML = `<p class="empty-note">ไม่พบผู้ใช้ที่ตรงกับ "${esc(q)}"</p>`; return; }

  wrap.innerHTML = list.map(u=>{
    const active = u.active !== false;
    const isSelf = currentUser && u.id === currentUser.id;
    const pairs = userScopePairs(u.id);
    const scoped = u.role === 'SUPERVISOR' || u.role === 'ASSISTANT';
    const email = userEmails[u.id] || '';
    const statusBadge = `<span class="status-badge ${active?'approved':'rejected'}">${active?'ใช้งาน':'ปิดใช้งาน'}</span>`;
    const effApps = allowedApps(u);
    const head = `
      <div class="uc-top">
        <div class="uc-title">
          <span class="uc-name">${esc(u.full_name||'–')}</span>
          <span class="badge role">${ROLE_LABEL[u.role]||esc(u.role)}</span>
          ${statusBadge}
        </div>
        <div class="uc-sub">
          <span class="uc-email">${email ? esc(email) : '<span class="td-sub">ไม่พบอีเมล</span>'}</span>
          ${u.employee_code ? `<span class="uc-code-tag">รหัส ${esc(u.employee_code)}</span>` : ''}
        </div>
      </div>`;

    if (ro){
      const deptBadge = u.role === 'ADMIN'
        ? '<span class="td-sub">ทุกคลัง · ทุกแผนก</span>'
        : scoped ? scopeSummary(pairs)
        : (userDepts(u).length
            ? userDepts(u).map(d=>`<span class="badge ${esc(d)}"><span class="dot"></span>${DEPT_PLAIN[d]||esc(d)}</span>`).join(' ')
            : '<span class="td-sub">–</span>');
      const appsBadge = (Array.isArray(u.apps) && u.apps.length)
        ? effApps.map(a=>`<span class="badge role">${APP_LABEL[a]||esc(a)}</span>`).join(' ')
        : `<span class="td-sub">${effApps.map(a=>APP_LABEL[a]||a).join(' + ')} (ตาม role)</span>`;
      return `<article class="user-card ${active?'':'row-inactive'}">
        ${head}
        <div class="uc-fields">
          <div class="uc-field"><span class="uc-lbl">คลัง × แผนก</span><div>${deptBadge}</div></div>
          <div class="uc-field"><span class="uc-lbl">ระบบที่ใช้ได้</span><div>${appsBadge}</div></div>
        </div>
      </article>`;
    }

    const scopeCell = scoped ? scopeGridHTML(pairs, 'u-scope-cb')
      : u.role === 'ADMIN' ? '<span class="td-sub">ทุกคลัง · ทุกแผนก</span>'
      : deptCheckboxes(userDepts(u), 'u-dept-cb');
    return `<article class="user-card ${active?'':'row-inactive'}" data-user-row="${esc(u.id)}">
      ${head}
      <div class="uc-fields">
        <div class="uc-field">
          <span class="uc-lbl">สิทธิ์</span>
          <select class="mini-select" data-u-role ${isSelf?'disabled title="เปลี่ยนสิทธิ์ตัวเองไม่ได้"':''}>${roleOptions(u.role)}</select>
        </div>
        <div class="uc-field">
          <span class="uc-lbl">คลัง × แผนก</span>
          <div class="scope-cell">${scopeCell}</div>
        </div>
        <div class="uc-field">
          <span class="uc-lbl">ระบบที่ใช้ได้</span>
          ${appCheckboxes(effApps, 'u-app-cb')}
        </div>
        <div class="uc-field">
          <span class="uc-lbl">รหัสพนักงาน</span>
          <input type="text" class="code-input" data-u-code value="${esc(u.employee_code||'')}" placeholder="รหัส">
        </div>
      </div>
      <div class="uc-btns">
        <button type="button" class="mini-btn approve" data-save-user="${esc(u.id)}">บันทึก</button>
        <button type="button" class="mini-btn" data-reset-pass="${esc(u.id)}">รีเซ็ตรหัส</button>
        ${isSelf ? ''
          : `<button type="button" class="mini-btn ${active?'reject':'approve'}" data-toggle-user="${esc(u.id)}" data-next-active="${active?'false':'true'}">${active?'ปิดใช้งาน':'เปิดใช้งาน'}</button>`}
        ${isSelf || u.role === 'ADMIN' ? ''
          : `<button type="button" class="mini-btn reject" data-del-user="${esc(u.id)}">ลบถาวร</button>`}
      </div>
    </article>`;
  }).join('');
}

async function saveUserRow(userId){
  const row = document.querySelector(`[data-user-row="${userId}"]`);
  if (!row) return;
  const role = row.querySelector('[data-u-role]').value;
  const scoped = role === 'SUPERVISOR' || role === 'ASSISTANT';
  const employee_code = row.querySelector('[data-u-code]').value.trim() || null;

  let desiredScope = [];
  let departments = null;
  if (scoped){
    desiredScope = readScopeGrid(row, 'u-scope-cb');
    if (!desiredScope.length){ toast('SUPERVISOR / ASSISTANT ต้องเลือกคลัง × แผนก อย่างน้อย 1 ช่อง'); return; }
    departments = [...new Set(desiredScope.map(p=>p.department))];
  } else if (role === 'USER'){
    departments = [...row.querySelectorAll('.u-dept-cb:checked')].map(c=>c.value);
    if (!departments.length){ toast('USER ต้องเลือกอย่างน้อย 1 ฝั่ง'); return; }
  }
  const department = departments && departments.length ? departments[0] : null;

  const appsChecked = [...row.querySelectorAll('.u-app-cb:checked')].map(c=>c.value);
  if (!appsChecked.length){ toast('เลือกระบบที่ใช้ได้อย่างน้อย 1 ระบบ (Skill Matrix / มือถือ)'); return; }
  const apps = appsChecked;

  const btn = row.querySelector('[data-save-user]');
  const label = btn.textContent; btn.textContent = '...'; btn.disabled = true;
  try{
    const { error } = await sb.from('profiles').update({ role, department, departments, employee_code, apps }).eq('id', userId);
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

async function deleteUserAccount(userId){
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

async function createUserFromForm(){
  const hint = document.getElementById('addUserHint');
  const email = document.getElementById('nuEmail').value.trim();
  const full_name = document.getElementById('nuName').value.trim();
  const password = document.getElementById('nuPass').value;
  const role = document.getElementById('nuRole').value;
  const scoped = role === 'SUPERVISOR' || role === 'ASSISTANT';
  const grid = document.getElementById('nuScopeGrid');
  const scope = readScopeGrid(grid, 'nu-scope-cb');
  const apps = [...document.querySelectorAll('#nuAppCbs .nu-app-cb:checked')].map(c=>c.value);
  if (!email || !full_name || !password){ hint.textContent = 'กรอก อีเมล / ชื่อ / รหัสผ่าน ให้ครบ'; return; }
  if (password.length < 8){ hint.textContent = 'รหัสผ่านต้องอย่างน้อย 8 ตัว'; return; }
  if (scoped && !scope.length){ hint.textContent = 'SUPERVISOR / ASSISTANT ต้องเลือกคลัง × แผนก อย่างน้อย 1 ช่อง'; return; }
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
      body: JSON.stringify({ action: 'create', email, password, full_name, role, scope, apps }),
    });
    const out = await res.json().catch(()=>({}));
    if (!res.ok || out.error) throw new Error(out.error || ('HTTP ' + res.status));
    hint.textContent = `สร้างบัญชี ${email} แล้ว`;
    ['nuEmail','nuName','nuPass'].forEach(id=>{ document.getElementById(id).value = ''; });
    document.querySelectorAll('#nuScopeGrid .nu-scope-cb:checked, #nuAppCbs .nu-app-cb:checked').forEach(c=>{ c.checked = false; });
    await Promise.all([refreshUsers(), refreshScopes(), refreshUserEmails()]); renderUsersTable();
    setTimeout(()=>{ document.getElementById('addUserForm').hidden = true; hint.textContent = ''; }, 1400);
  }catch(err){ hint.textContent = 'ไม่สำเร็จ: ' + err.message; }
}

// ---------- view state: loading skeleton / load-error card ----------
function isFiltered(){ return dateRange!=='all' || deptFilter!=='ALL' || whFilter!=='ALL' || !!searchTerm; }

function clearFilters(){
  dateRange = 'all'; deptFilter = 'ALL'; whFilter = 'ALL'; searchTerm = '';
  const s = document.getElementById('searchInput'); if (s) s.value = '';
  document.querySelectorAll('#rangeChips .chip').forEach(c=>c.setAttribute('aria-pressed', c.dataset.range==='all'));
  document.querySelectorAll('#deptChips .chip').forEach(c=>c.setAttribute('aria-pressed', c.dataset.dept==='ALL'));
  document.querySelectorAll('#whChips .chip').forEach(c=>c.setAttribute('aria-pressed', c.dataset.wh==='ALL'));
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
    renderEmpRoster();
    renderEmployeesTable(closed);
  } else if (activeView==='tasks'){
    renderTasksAdmin();
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
// Emails aren't in `profiles` — the Edge Function reads them from auth.users.
async function refreshUserEmails(){
  if (isReadOnly()) return;                 // ASSISTANT can't call the admin function
  try{
    const out = await callAdminFn({ action: 'list' });
    const map = {};
    (out.users || []).forEach(u=>{ map[u.id] = u.email || ''; });
    userEmails = map;
  }catch(e){ /* non-critical — the view just shows "–" for email */ }
}
async function refreshAll(){
  document.getElementById('syncText').textContent = 'กำลังโหลดข้อมูล...';
  loadError = null;
  if (firstLoad) render();                        // paints the skeleton
  const [jobsRes] = await Promise.allSettled([refreshJobs(), refreshRoster(), refreshUsers(), refreshScopes(), refreshUserEmails(), refreshEmployeesAll(), refreshTasksAdmin()]);
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
