// ===================== SUPABASE INIT =====================

const DEPT_KEYS = ['INB','OUT','INV'];
const DEPT_PLAIN = { INB:'ขาเข้า', OUT:'ขาออก', INV:'สต๊อก' };
const STATUS_LABEL = { pending:'รออนุมัติ', approved:'อนุมัติแล้ว', rejected:'ไม่อนุมัติ', open:'กำลังทำงาน' };
const DEPT_SUB   = { INB:'รับรถเข้าคลัง', OUT:'ส่งรถออกคลัง', INV:'จัดการของ/แพ็คของ' };
const DEPT_ICON  = { INB:'inbound', OUT:'outbound', INV:'inventory' };

// Fallback task list, used only until the `tasks` table has rows for a department.
const FALLBACK_TASKS = {
  INB: [
    {id:'inb_unload',      label:'โหลดรถลงจากตู้คอนเทนเนอร์',  sub:'นับเป็นจำนวนตู้',   unit:'containers', unitLabel:'จำนวนตู้', vehiclesPerContainer:56, icon:'truck'},
    {id:'inb_palletdown',  label:'ยกรถลงจากแท่นพาเลท',        sub:'นับเป็นจำนวนคัน',   unit:'vehicles',   unitLabel:'จำนวนคัน', icon:'pallet'},
    {id:'inb_putaway',     label:'เก็บรถเข้าที่จอด',           sub:'หลังตรวจสอบเสร็จแล้ว · นับเป็นคัน', unit:'vehicles', unitLabel:'จำนวนคัน', icon:'parking'},
  ],
  OUT: [
    {id:'out_precheck',  label:'หารถ + เขียนชื่อร้าน',       sub:'ตามใบงาน · นับเป็นคัน', unit:'vehicles', unitLabel:'จำนวนคัน', icon:'search'},
    {id:'out_push',      label:'เข็นรถออกจากคลัง',           sub:'นับเป็นจำนวนคัน',       unit:'vehicles', unitLabel:'จำนวนคัน', icon:'scooter'},
    {id:'out_qccheck',   label:'โหลดรถขึ้นรถขนส่ง',          sub:'พร้อมเช็คว่ามีปัญหาไหม', unit:'vehicles', unitLabel:'จำนวนคันที่โหลด', hasIssue:true, icon:'qcCheck'},
  ],
  INV: [
    {id:'inv_packfree_onvehicle', label:'แพ็คของแถมติดรถ',            sub:'นับเป็นจำนวนชิ้น', unit:'pieces', unitLabel:'จำนวนชิ้น', icon:'gift'},
    {id:'inv_packfree_set',       label:'จัดชุดของแถม',                sub:'เช่น ชุดชิวหน้า · นับเป็นชิ้น', unit:'pieces', unitLabel:'จำนวนชิ้น', icon:'toolbox'},
    {id:'inv_packship',           label:'แพ็คของส่งออก',               sub:'เข็นไปหน้าจุดขึ้นรถ · นับเป็นกล่อง', unit:'boxes',  unitLabel:'จำนวนกล่อง', icon:'package'},
  ],
};
const ICON_BY_TASK_ID = {}; // id -> icon key, used to decorate DB-sourced tasks
DEPT_KEYS.forEach(d => FALLBACK_TASKS[d].forEach(t => ICON_BY_TASK_ID[t.id] = t.icon));

let TASKS = { INB:[], OUT:[], INV:[] }; // populated at load, DB-preferred with fallback
const ALL_TASKS = () => DEPT_KEYS.flatMap(d => TASKS[d]);
const taskById = id => ALL_TASKS().find(t=>t.id===id);
const unitShort = u => ({containers:'ตู้', vehicles:'คัน', pieces:'ชิ้น', boxes:'กล่อง'})[u] || u;

const ICONS = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  bolt:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M12 20V4M20 20v-7"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15.8 14.2c2.7.4 4.7 2.5 4.7 5.8"/></svg>',
  chev:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  back:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L19 7"/></svg>',
  checksm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L19 7"/></svg>',
  x:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  logout:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h9"/><path d="M20 12H9M20 12l-3.5-3.5M20 12l-3.5 3.5"/></svg>',
  key:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M17 6l2 2M15 8l2 2"/></svg>',
  box:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z"/><path d="M3 7.5 12 12l9-4.5"/><path d="M12 12v9"/></svg>',
  trophy:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 5H4a3 3 0 0 0 3 4"/><path d="M17 5h3a3 3 0 0 1-3 4"/><path d="M9 20h6"/><path d="M12 14v3"/><path d="M9 20c0-2 1.3-3 3-3s3 1 3 3"/></svg>',
  inbound:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><path d="M8 10l4 4 4-4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
  outbound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14V3"/><path d="M8 7l4-4 4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
  inventory:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z"/><path d="M3 7.5 12 12l9-4.5"/><path d="M12 12v9"/></svg>',
  truck:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="7" width="12" height="9"/><path d="M13.5 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>',
  pallet:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="6" rx="1"/><path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9"/><path d="M3 19h18"/></svg>',
  parking:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 16V7h3.5a2.5 2.5 0 0 1 0 5H9"/></svg>',
  search:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  scooter:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="18" r="2.3"/><circle cx="18" cy="18" r="2.3"/><path d="M5.5 18h6l2-6h4"/><path d="M11.5 12 9 6H6"/><path d="M15 9h3"/></svg>',
  qcCheck:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v2H9z"/><path d="M9 12l2.2 2.2L15.5 10"/></svg>',
  gift:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="4"/><rect x="4.5" y="13" width="15" height="8"/><path d="M12 9v12"/><path d="M12 9c-1.5-4-6-4-6-1s3 1 6 1z"/><path d="M12 9c1.5-4 6-4 6-1s-3 1-6 1z"/></svg>',
  toolbox:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="8" width="19" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M2.5 13h19"/><path d="M10.5 13v2h3v-2"/></svg>',
  package:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z"/><path d="M3 7.5 12 12l9-4.5"/><path d="M12 12v9"/></svg>',
};
document.getElementById('backBtn').innerHTML = ICONS.back;
document.querySelector('.ok-circle').innerHTML = ICONS.check;
document.getElementById('logoutBtn').innerHTML = ICONS.logout;
document.getElementById('openMatrixChev').innerHTML = ICONS.chev;
document.getElementById('loginLogo').innerHTML = ICONS.box;
document.getElementById('matrixTrophyIcon').innerHTML = ICONS.trophy;

const nowBkk = () => new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Bangkok'}));
const todayISO = () => nowBkk().toLocaleDateString('sv-SE');
const timeNowHHMM = () => { const d=nowBkk(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); };
function minutesBetween(start,end){
  const [sh,sm]=start.split(':').map(Number), [eh,em]=end.split(':').map(Number);
  let d=(eh*60+em)-(sh*60+sm); if(d<0) d+=24*60; return d;
}

let roster = [];   // employees rows for the visible department(s)
let jobs = [];      // grouped job entries for the visible department(s)
let profile = null; // {id, full_name, department, role}
let currentUser = null;
let realtimeChannel = null;

const isAdmin = () => !!profile && profile.role === 'ADMIN';
const isWorker = () => !!profile && profile.role === 'USER';
const isSupervisorRole = () => !!profile && profile.role === 'SUPERVISOR';
const inScope = d => isAdmin() || d === profile.department;
const visibleDepts = () => isAdmin() ? DEPT_KEYS : DEPT_KEYS.filter(d=>d===profile.department);

let myOpenJob = null; // USER role: the job row they currently have open, if any
let workerStep = 'list'; // USER role: 'list' (task list or active job) | 'success' (just closed)
let supervisorPending = []; // SUPERVISOR role: pending jobs in their department
let deptTasks = []; // SUPERVISOR role: raw tasks rows (active + inactive) for their department

let oDeptVal = null, oTaskVal = null, crew = [];
let doneFieldsBuiltForTask = null;
let deptFilter='ALL', empFilter='', searchTerm='', dateRange='today';
let openMatrixEmp = null;
let openRosterDept = null;
let activeTab = 'new';
let activeStep = 1;

// ================= AUTH =================
function mapAuthError(err){
  const msg = (err && err.message) || '';
  if (/invalid login credentials/i.test(msg)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (/email not confirmed/i.test(msg)) return 'บัญชียังไม่ได้ยืนยันอีเมล';
  return 'เข้าสู่ระบบไม่สำเร็จ: ' + (msg || 'unknown error');
}
function showLogin(){ document.getElementById('loginOverlay').style.display='flex'; }
function hideLogin(){ document.getElementById('loginOverlay').style.display='none'; }
const ROLE_SHORT = { SUPERVISOR:'หัวหน้างาน', USER:'พนักงาน' };
function refreshRoleBadge(){
  const label = isAdmin() ? 'ผู้ดูแลระบบ' : `${DEPT_PLAIN[profile.department]} · ${ROLE_SHORT[profile.role]||''} · ${profile.full_name||''}`;
  document.getElementById('roleBadge').textContent = label;
}

async function loadProfile(user){
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (error || !data) throw error || new Error('no-profile');
  return data;
}

async function afterLogin(user){
  currentUser = user;
  try{
    profile = await loadProfile(user);
  }catch(e){
    document.getElementById('loginHint').textContent = 'ไม่พบข้อมูลผู้ใช้งานนี้ในระบบ กรุณาติดต่อผู้ดูแลระบบ';
    await sb.auth.signOut();
    return;
  }
  if (profile.active === false){
    document.getElementById('loginHint').textContent = 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ';
    await sb.auth.signOut();
    profile = null;
    return;
  }
  hideLogin();
  refreshRoleBadge();
  buildNav();
  await loadTasksFromDb();
  if (isWorker()) await refreshMyOpenJob();
  wireRealtime();
  goTab(isSupervisorRole() ? 'approve' : 'new');
  await refreshAll();
}

async function refreshMyOpenJob(){
  try{
    const { data, error } = await sb.from('jobs').select('*')
      .eq('created_by', currentUser.id).eq('status', 'open')
      .order('created_at', { ascending:false }).limit(1);
    if (error) throw error;
    myOpenJob = (data && data[0]) || null;
  }catch(e){ myOpenJob = null; }
}

function logout(){
  sb.auth.signOut();
  profile = null; currentUser = null;
  jobs = []; roster = []; myOpenJob = null; workerStep = 'list';
  if (realtimeChannel){ sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  document.getElementById('loginEmail').value='';
  document.getElementById('loginPass').value='';
  document.getElementById('loginHint').textContent='';
  showLogin();
}
document.getElementById('logoutBtn').addEventListener('click', ()=> logout());

document.getElementById('changePwBtn').innerHTML = ICONS.key;
async function changeOwnPassword(){
  if (!currentUser){ return; }
  const np = prompt('ตั้งรหัสผ่านใหม่ของคุณ (อย่างน้อย 8 ตัว):');
  if (np === null) return;
  if (np.length < 8){ alert('รหัสผ่านต้องอย่างน้อย 8 ตัว'); return; }
  const np2 = prompt('พิมพ์รหัสผ่านใหม่อีกครั้งเพื่อยืนยัน:');
  if (np2 === null) return;
  if (np !== np2){ alert('รหัสผ่านสองครั้งไม่ตรงกัน'); return; }
  try{
    const { error } = await sb.auth.updateUser({ password: np });
    if (error) throw error;
    alert('เปลี่ยนรหัสผ่านเรียบร้อย ครั้งต่อไปใช้รหัสใหม่');
  }catch(err){ alert('เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + (err.message || err)); }
}
document.getElementById('changePwBtn').addEventListener('click', changeOwnPassword);

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
document.getElementById('loginEmail').addEventListener('keydown', e=>{ if (e.key==='Enter') document.getElementById('loginPass').focus(); });
document.getElementById('loginPass').addEventListener('keydown', e=>{ if (e.key==='Enter') document.getElementById('loginSubmitBtn').click(); });

// ================= TASKS from DB (with fallback) =================
async function loadTasksFromDb(){
  TASKS = { INB:[...FALLBACK_TASKS.INB], OUT:[...FALLBACK_TASKS.OUT], INV:[...FALLBACK_TASKS.INV] };
  try{
    const { data, error } = await sb.from('tasks').select('*').eq('active', true);
    if (error) throw error;
    if (data && data.length){
      const byDept = { INB:[], OUT:[], INV:[] };
      data.forEach(t=>{
        byDept[t.department] = byDept[t.department] || [];
        byDept[t.department].push({
          id: t.id, dept: t.department, label: t.name, sub:'', unit:'vehicles', unitLabel:'จำนวน',
          icon: ICON_BY_TASK_ID[t.id] || 'box',
        });
      });
      DEPT_KEYS.forEach(d=>{ if (byDept[d] && byDept[d].length) TASKS[d] = byDept[d]; });
    }
  }catch(e){ /* keep fallback */ }
  DEPT_KEYS.forEach(d => TASKS[d].forEach(t => t.dept = d));
}

// ================= NAV (role-dependent, built after login) =================
function navForRole(){
  if (isAdmin()) return [
    {id:'new', label:'เริ่มงาน', icon:'bolt'},
    {id:'history', label:'ประวัติ', icon:'chart'},
    {id:'manage', label:'คนงาน', icon:'users'},
  ];
  if (isWorker()) return [
    {id:'new', label:'งานของฉัน', icon:'bolt'},
    {id:'history', label:'ประวัติ', icon:'chart'},
  ];
  // SUPERVISOR: approve their department's pending jobs + manage its task types
  return [
    {id:'approve', label:'อนุมัติงาน', icon:'check'},
    {id:'tasks', label:'ชนิดงาน', icon:'box'},
    {id:'history', label:'ประวัติ', icon:'chart'},
  ];
}
function buildNav(){
  document.getElementById('bottomNav').innerHTML = navForRole().map((n,i)=>`
    <button type="button" class="nav-btn" data-nav="${n.id}" aria-selected="${i===0}">
      <span class="n-icon">${ICONS[n.icon]}</span>
      <span class="n-label">${n.label}</span>
    </button>`).join('');
}
buildNav();

const TAB_TITLE = { new:'เริ่มงาน', history:'ประวัติ', manage:'รายชื่อคนงาน', approve:'อนุมัติงาน', tasks:'ชนิดงาน' };

let historySub = 'list';
function goTab(tab){
  activeTab = tab;
  if (tab==='new'){
    if (isAdmin()){ activeStep = 1; renderStep1(); }
    else if (isWorker()){ renderWorkerHome(); }
  }
  if (tab==='history'){ historySub = 'list'; refreshJobs().then(renderHistory); }
  if (tab==='approve') refreshPendingApprovals().then(renderApproveQueue);
  if (tab==='tasks') refreshDeptTasks().then(renderTaskManager);
  document.querySelectorAll('.nav-btn').forEach(b=>b.setAttribute('aria-selected', b.dataset.nav===tab));
  renderScreens();
}
function renderScreens(){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  let screenId, title, showBack=false;
  if (activeTab==='new'){
    if (isAdmin()){
      if (activeStep===1){ screenId='screen-step1'; title='เริ่มงาน'; }
      else if (activeStep===2){ screenId='screen-step2'; title=DEPT_PLAIN[oDeptVal]; showBack=isAdmin(); }
      else if (activeStep===3){ screenId='screen-step3'; title=taskById(oTaskVal)?.label || 'เลือกคน'; showBack=true; }
      else if (activeStep===4){ screenId='screen-success'; title='เริ่มงาน'; }
    } else if (isWorker()){
      if (workerStep==='success'){ screenId='screen-worker-success'; title='งานของฉัน'; }
      else { screenId = myOpenJob ? 'screen-worker-active' : 'screen-worker-tasks'; title = myOpenJob ? 'กำลังทำงาน' : 'งานของฉัน'; }
    } else {
      // SUPERVISOR has no 'new' tab (lands on 'approve' instead) — this only
      // fires pre-login, while the login overlay covers the screen anyway
      screenId = 'screen-step1'; title = 'เริ่มงาน';
    }
  } else if (activeTab==='history'){
    if (historySub==='matrix'){ screenId='screen-matrix'; title='ใครทำอะไรได้บ้าง'; showBack=true; }
    else { screenId='screen-history'; title='ประวัติ'; }
  } else {
    screenId = 'screen-'+activeTab;
    title = TAB_TITLE[activeTab];
  }
  document.getElementById(screenId).classList.add('active');
  document.getElementById('topbarTitle').textContent = title;
  document.getElementById('backBtn').hidden = !showBack;
  document.getElementById('contentArea').scrollTop = 0;
}
document.getElementById('backBtn').addEventListener('click', ()=>{
  if (activeTab==='new' && activeStep>1){ activeStep -= 1; if(activeStep===2) renderStep2(); if(activeStep===1) renderStep1(); renderScreens(); }
  else if (activeTab==='history' && historySub==='matrix'){ historySub='list'; renderScreens(); }
});

// ================= STEP 1 =================
function renderStep1(){
  document.getElementById('deptTiles').innerHTML = DEPT_KEYS.map(d=>`
    <button type="button" class="tile ${d}" data-pick-dept="${d}">
      <span class="t-icon">${ICONS[DEPT_ICON[d]]}</span>
      <span><span class="t-name">${DEPT_PLAIN[d]}</span><span class="t-sub">${DEPT_SUB[d]}</span></span>
      <span class="t-chev">${ICONS.chev}</span>
    </button>`).join('');
}

// ================= STEP 2 =================
function renderStep2(){
  document.getElementById('step2Title').textContent = `งานฝั่ง${DEPT_PLAIN[oDeptVal]} — เลือกงาน`;
  document.getElementById('jobChoiceList').innerHTML = (TASKS[oDeptVal]||[]).map(t=>`
    <button type="button" class="job-choice" data-pick-task="${t.id}">
      <span class="jc-icon badge ${oDeptVal}" style="width:40px;height:40px;border-radius:11px;">${ICONS[t.icon]||ICONS.box}</span>
      <span><span class="jc-name">${t.label}</span><br><span class="jc-sub">${t.sub||''}</span></span>
      <span class="t-chev">${ICONS.chev}</span>
    </button>`).join('');
}

// ================= STEP 3 =================
function renderStep3(){
  const task = taskById(oTaskVal);
  document.getElementById('step3Title').textContent = task ? task.label : 'ใครทำงานนี้บ้าง?';
  const list = roster.filter(r=>r.department===oDeptVal);
  const box = document.getElementById('empCheckList');
  if (list.length===0){
    box.innerHTML = `<div class="empty-roster-inline">ยังไม่มีรายชื่อคนงานฝั่ง${DEPT_PLAIN[oDeptVal]}<br>ไปเพิ่มที่แถบ "คนงาน" ด้านล่างก่อน</div>`;
  } else {
    box.innerHTML = list.map(r=>`
      <button type="button" class="emp-check" data-pick-emp="${r.id}" aria-pressed="${crew.includes(String(r.id))}">
        <span class="ec-box">${crew.includes(String(r.id)) ? ICONS.checksm : ''}</span>
        <span class="ec-name">${r.name}</span>
      </button>`).join('');
  }
  document.getElementById('d-date').value = document.getElementById('d-date').value || todayISO();
  document.getElementById('d-start').value = document.getElementById('d-start').value || timeNowHHMM();
  document.getElementById('d-end').value = document.getElementById('d-end').value || timeNowHHMM();
  if (task && doneFieldsBuiltForTask !== oTaskVal) renderDoneFields();
}

// ================= RESULT-FIELD BUILDER =================
function buildResultFieldsHTML(task, prefix){
  let fields = `<div class="field" style="margin-bottom:14px;">
      <label>${task.unitLabel}</label>
      <div class="stepper">
        <button type="button" data-step="-1" data-target="${prefix}-unit">−</button>
        <input id="${prefix}-unit" type="number" min="0" value="0" inputmode="numeric">
        <button type="button" data-step="1" data-target="${prefix}-unit">+</button>
      </div>
    </div>`;
  if (task.unit==='containers'){
    fields += `<div class="field" style="margin-bottom:6px;">
      <label>จำนวนคัน</label>
      <div class="stepper">
        <button type="button" data-step="-1" data-target="${prefix}-vehicles">−</button>
        <input id="${prefix}-vehicles" type="number" min="0" value="0" inputmode="numeric">
        <button type="button" data-step="1" data-target="${prefix}-vehicles">+</button>
      </div>
    </div>
    <p class="hint" style="text-align:left;margin:0 0 14px;">ปกติ 1 ตู้ = ${task.vehiclesPerContainer} คัน ระบบใส่ให้อัตโนมัติ แก้เลขคันเองได้ถ้านับได้ไม่เท่ากัน</p>`;
  }
  let issueBlock = '';
  if (task.hasIssue){
    const wrapId = `${prefix}-issueCountWrap`;
    issueBlock = `
      <div class="field" style="margin-bottom:6px;">
        <label>รถมีปัญหาไหม</label>
        <div class="issue-toggle">
          <label><input type="radio" name="issue-${prefix}" value="no" data-issue-choice="no" data-issue-wrap="${wrapId}" checked> ไม่มี</label>
          <label><input type="radio" name="issue-${prefix}" value="yes" data-issue-choice="yes" data-issue-wrap="${wrapId}"> มี</label>
        </div>
      </div>
      <div class="field" id="${wrapId}" style="display:none;margin-bottom:14px;">
        <label>จำนวนคันที่มีปัญหา</label>
        <div class="stepper">
          <button type="button" data-step="-1" data-target="${prefix}-issue">−</button>
          <input id="${prefix}-issue" type="number" min="0" value="0" inputmode="numeric">
          <button type="button" data-step="1" data-target="${prefix}-issue">+</button>
        </div>
      </div>`;
  }
  return fields + issueBlock;
}
function wireContainerAutofill(task, prefix){
  if (task.unit!=='containers') return;
  let touched=false;
  const unitEl = document.getElementById(prefix+'-unit');
  const vehEl = document.getElementById(prefix+'-vehicles');
  vehEl.addEventListener('input', ()=>{ touched=true; });
  unitEl.addEventListener('input', (e)=>{
    if (!touched) vehEl.value = (Number(e.target.value)||0) * task.vehiclesPerContainer;
  });
}
function renderDoneFields(){
  const task = taskById(oTaskVal);
  if (!task) return;
  document.getElementById('doneResultFields').innerHTML = buildResultFieldsHTML(task, 'd');
  wireContainerAutofill(task, 'd');
  doneFieldsBuiltForTask = oTaskVal;
}

// ================= USER role: open/close one job at a time =================
function renderWorkerHome(){
  workerStep = 'list';
  if (myOpenJob) renderActiveJobCard(); else renderWorkerTaskList();
}
function renderWorkerTaskList(){
  const list = TASKS[profile.department] || [];
  const box = document.getElementById('workerTaskList');
  if (list.length===0){ box.innerHTML = `<div class="empty-roster-inline">ยังไม่มีชนิดงานของฝั่ง${DEPT_PLAIN[profile.department]}<br>ติดต่อหัวหน้างานให้เพิ่มชนิดงานก่อน</div>`; return; }
  box.innerHTML = list.map(t=>`
    <button type="button" class="job-choice" data-open-task="${t.id}">
      <span class="jc-icon badge ${profile.department}" style="width:40px;height:40px;border-radius:11px;">${ICONS[t.icon]||ICONS.box}</span>
      <span><span class="jc-name">${t.label}</span><br><span class="jc-sub">${t.sub||''}</span></span>
      <span class="t-chev">${ICONS.chev}</span>
    </button>`).join('');
}
function renderActiveJobCard(){
  const task = taskById(myOpenJob.task_id);
  const startedLocal = myOpenJob.started_at
    ? new Date(myOpenJob.started_at).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'})
    : (myOpenJob.details&&myOpenJob.details.start) || '–';
  document.getElementById('activeJobCard').innerHTML = `
    <div class="active-job-name">${task?task.label:myOpenJob.task_id}</div>
    <div class="active-job-meta">เริ่มงานเวลา ${startedLocal} น.</div>
  `;
  document.getElementById('workerDoneFields').innerHTML = task ? buildResultFieldsHTML(task, 'w') : '';
  if (task) wireContainerAutofill(task, 'w');
  document.getElementById('workerCloseHint').textContent = '';
}
async function openWorkerJob(taskId){
  const { data, error } = await sb.from('jobs').insert({
    department: profile.department, task_id: taskId, employee_name: profile.full_name,
    created_by: currentUser.id, status: 'open', started_at: new Date().toISOString(),
    details: { date: todayISO(), start: timeNowHHMM() },
  }).select().single();
  if (error){ alert('เปิดงานไม่สำเร็จ: ' + mapDbError(error)); return; }
  myOpenJob = data;
  renderActiveJobCard();
  renderScreens();
}
function showWorkerSuccess(taskLabel){
  document.getElementById('workerSuccessSub').textContent = taskLabel;
  workerStep = 'success';
  renderScreens();
  setTimeout(()=>{ renderWorkerHome(); renderScreens(); }, 1100);
}
document.getElementById('workerCloseBtn').addEventListener('click', async ()=>{
  if (!myOpenJob) return;
  const hint = document.getElementById('workerCloseHint');
  const task = taskById(myOpenJob.task_id);
  if (!task){ hint.textContent = 'ไม่พบชนิดงานนี้แล้ว ติดต่อหัวหน้างาน'; return; }
  const start = (myOpenJob.details&&myOpenJob.details.start) || timeNowHHMM();
  const end = timeNowHHMM();
  const unitVal = Number(document.getElementById('w-unit').value)||0;
  const details = { ...(myOpenJob.details||{}), end, mins: minutesBetween(start,end), qty: unitVal };
  if (task.unit==='containers'){
    details.containers = unitVal;
    details.vehicles = Number(document.getElementById('w-vehicles').value) || (unitVal*task.vehiclesPerContainer);
    details.qty = details.vehicles;
  }
  if (task.hasIssue){
    const issueYes = document.querySelector('input[name="issue-w"]:checked')?.value==='yes';
    details.hasIssue = issueYes;
    details.issueCount = issueYes ? (Number(document.getElementById('w-issue').value)||0) : 0;
  }
  hint.textContent = 'กำลังบันทึก...';
  try{
    const { error } = await sb.from('jobs').update({
      status: 'pending', ended_at: new Date().toISOString(), details,
    }).eq('id', myOpenJob.id);
    if (error) throw error;
    hint.textContent = '';
    myOpenJob = null;
    await refreshJobs();
    showWorkerSuccess(task.label);
  }catch(err){
    hint.textContent = '';
    alert('ปิดงานไม่สำเร็จ: ' + mapDbError(err));
  }
});

// ================= SUPERVISOR role: approvals =================
async function refreshPendingApprovals(){
  try{
    const { data, error } = await sb.from('jobs')
      .select('*, requester:profiles!jobs_created_by_fkey(employee_code,full_name)')
      .eq('department', profile.department).eq('status', 'pending')
      .order('created_at', { ascending:true });
    if (error) throw error;
    supervisorPending = data || [];
  }catch(e){ supervisorPending = []; }
}
function renderApproveQueue(){
  const box = document.getElementById('approveList');
  const empty = document.getElementById('approveEmpty');
  if (!box) return;
  if (supervisorPending.length===0){ box.innerHTML=''; empty.hidden=false; return; }
  empty.hidden = true;
  box.innerHTML = supervisorPending.map(j=>{
    const task = taskById(j.task_id); const d = j.details||{};
    const code = j.requester && j.requester.employee_code;
    return `<div class="hist-card">
      <div class="hist-top"><div>
        <div class="hist-task">${task?task.label:j.task_id}</div>
        <div class="hist-crew">${j.employee_name||''}${code ? ` · รหัส ${code}` : ''}</div>
      </div></div>
      <div class="hist-meta">
        <span>${d.date||''}</span>
        <span>${d.start||''}–${d.end||'–'} (${d.mins ?? '–'} นาที)</span>
        <span class="hist-result">${formatResult(d, task)}</span>
      </div>
      <div class="approve-actions">
        <button type="button" class="mini-btn approve" data-approve-job="${j.id}">อนุมัติ</button>
        <button type="button" class="mini-btn reject" data-reject-job="${j.id}">ไม่อนุมัติ</button>
      </div>
    </div>`;
  }).join('');
}
async function setJobStatusSupervisor(jobId, status){
  try{
    const { error } = await sb.from('jobs').update({
      status, approved_by: currentUser.id, approved_at: new Date().toISOString(),
    }).eq('id', jobId);
    if (error) throw error;
    await refreshPendingApprovals(); renderApproveQueue();
    await refreshJobs(); render();
  }catch(err){ alert('ทำรายการไม่สำเร็จ: ' + mapDbError(err)); }
}

// ================= SUPERVISOR role: task types =================
async function refreshDeptTasks(){
  try{
    const { data, error } = await sb.from('tasks').select('*')
      .eq('department', profile.department).order('name');
    if (error) throw error;
    deptTasks = data || [];
  }catch(e){ deptTasks = []; }
}
function renderTaskManager(){
  const box = document.getElementById('taskMgmtList');
  if (!box) return;
  if (deptTasks.length===0){ box.innerHTML = `<div class="empty-roster-inline">ยังไม่มีชนิดงานของแผนกนี้</div>`; return; }
  box.innerHTML = deptTasks.map(t=>`
    <div class="task-row">
      <span class="t-name ${t.active?'':'t-inactive'}">${t.name}</span>
      <button type="button" class="mini-btn ${t.active?'reject':'approve'}" data-toggle-task="${t.id}" data-next-active="${t.active?'false':'true'}">
        ${t.active?'ปิดใช้งาน':'เปิดใช้งาน'}
      </button>
    </div>`).join('');
}
function openAddTaskModal(){
  document.getElementById('t-name').value='';
  document.getElementById('taskHint').textContent='';
  document.getElementById('addTaskBackdrop').classList.add('open');
  document.getElementById('addTaskModal').classList.add('open');
  setTimeout(()=>document.getElementById('t-name').focus(), 50);
}
function closeAddTaskModal(){
  document.getElementById('addTaskBackdrop').classList.remove('open');
  document.getElementById('addTaskModal').classList.remove('open');
}
document.getElementById('taskSubmitBtn').addEventListener('click', async ()=>{
  const name = document.getElementById('t-name').value.trim();
  const hint = document.getElementById('taskHint');
  if (!name){ hint.textContent = 'พิมพ์ชื่องานก่อน'; return; }
  if (deptTasks.some(t=>t.name===name)){ hint.textContent = `"${name}" มีอยู่แล้ว`; return; }
  hint.textContent = 'กำลังเพิ่ม...';
  try{
    const id = profile.department.toLowerCase() + '_' + Date.now();
    const { error } = await sb.from('tasks').insert({ id, department: profile.department, name, active: true });
    if (error) throw error;
    hint.textContent = `เพิ่ม "${name}" แล้ว`;
    await refreshDeptTasks(); renderTaskManager();
    await loadTasksFromDb();
    setTimeout(closeAddTaskModal, 500);
  }catch(err){ hint.textContent = 'เพิ่มไม่สำเร็จ: ' + mapDbError(err); }
});

// ================= EVENT DELEGATION =================
document.addEventListener('click', async (e)=>{
  const navBtn = e.target.closest('[data-nav]');
  if (navBtn){ goTab(navBtn.dataset.nav); return; }

  const pickDept = e.target.closest('[data-pick-dept]');
  if (pickDept){ oDeptVal = pickDept.dataset.pickDept; oTaskVal=null; crew=[]; activeStep=2; renderStep2(); renderScreens(); return; }

  const openTask = e.target.closest('[data-open-task]');
  if (openTask){ await openWorkerJob(openTask.dataset.openTask); return; }

  const pickTask = e.target.closest('[data-pick-task]');
  if (pickTask){
    oTaskVal = pickTask.dataset.pickTask; activeStep=3;
    doneFieldsBuiltForTask = null;
    renderStep3(); renderScreens(); return;
  }

  const pickEmp = e.target.closest('[data-pick-emp]');
  if (pickEmp){
    const id = pickEmp.dataset.pickEmp;
    crew = crew.includes(id) ? crew.filter(n=>n!==id) : [...crew, id];
    renderStep3();
    return;
  }

  const deptChip = e.target.closest('#deptFilterChips [data-dept]');
  if (deptChip){
    document.querySelectorAll('#deptFilterChips .chip').forEach(c=>c.setAttribute('aria-pressed','false'));
    deptChip.setAttribute('aria-pressed','true');
    deptFilter = deptChip.dataset.dept; render();
    return;
  }

  const rangeChip = e.target.closest('#dateFilterChips [data-range]');
  if (rangeChip){
    document.querySelectorAll('#dateFilterChips .chip').forEach(c=>c.setAttribute('aria-pressed','false'));
    rangeChip.setAttribute('aria-pressed','true');
    dateRange = rangeChip.dataset.range; render();
    return;
  }

  if (e.target.closest('#openMatrixBtn')){ historySub='matrix'; renderScreens(); return; }
  if (e.target.closest('#toggleMoreFiltersLink')){
    const panel = document.getElementById('moreFiltersPanel');
    panel.hidden = !panel.hidden;
    return;
  }

  const stepBtn = e.target.closest('[data-step]');
  if (stepBtn){
    const input = document.getElementById(stepBtn.dataset.target);
    const step = Number(stepBtn.dataset.step);
    const cur = Number(input.value)||0;
    input.value = Math.max(0, cur+step);
    input.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }

  const issueChoice = e.target.closest('[data-issue-choice]');
  if (issueChoice){
    const wrap = document.getElementById(issueChoice.dataset.issueWrap || 'issueCountWrap');
    wrap.style.display = issueChoice.dataset.issueChoice==='yes' ? '' : 'none';
    return;
  }

  const rosterDel = e.target.closest('[data-roster-del]');
  if (rosterDel){
    const id = rosterDel.dataset.rosterDel;
    try{ await sb.from('employees').update({active:false}).eq('id', id); await refreshRoster(); render(); }catch(err){}
    return;
  }

  const matrixHead = e.target.closest('[data-matrix-emp]');
  if (matrixHead){
    const emp = matrixHead.dataset.matrixEmp;
    openMatrixEmp = (openMatrixEmp===emp) ? null : emp;
    renderMatrix();
    return;
  }

  if (e.target.closest('#toggleAddEmpLink')){ openAddEmpModal(); return; }
  if (e.target.closest('#addEmpBackdrop') || e.target.closest('[data-modal-close]')){ closeAddEmpModal(); return; }

  const rosterHead = e.target.closest('[data-roster-dept]');
  if (rosterHead){
    const d = rosterHead.dataset.rosterDept;
    openRosterDept = (openRosterDept===d) ? null : d;
    renderRosterManager();
    return;
  }

  const approveBtn = e.target.closest('[data-approve-job]');
  if (approveBtn){ setJobStatusSupervisor(approveBtn.dataset.approveJob, 'approved'); return; }
  const rejectBtn = e.target.closest('[data-reject-job]');
  if (rejectBtn){ setJobStatusSupervisor(rejectBtn.dataset.rejectJob, 'rejected'); return; }

  if (e.target.closest('#toggleAddTaskLink')){ openAddTaskModal(); return; }
  if (e.target.closest('#addTaskBackdrop')){ closeAddTaskModal(); return; }

  const toggleTask = e.target.closest('[data-toggle-task]');
  if (toggleTask){
    const id = toggleTask.dataset.toggleTask;
    const nextActive = toggleTask.dataset.nextActive === 'true';
    try{
      await sb.from('tasks').update({ active: nextActive }).eq('id', id);
      await refreshDeptTasks(); renderTaskManager();
      await loadTasksFromDb();
    }catch(err){ alert('ทำรายการไม่สำเร็จ: ' + mapDbError(err)); }
    return;
  }
});

document.getElementById('openSubmitBtn').addEventListener('click', async ()=>{
  const hint = document.getElementById('openHint');
  if (crew.length===0){ hint.textContent='แตะเลือกคนอย่างน้อย 1 คนก่อน'; return; }
  const task = taskById(oTaskVal);
  const crewMembers = crew.map(id => roster.find(r=>r.id==id)).filter(Boolean);
  const crewNames = crewMembers.map(m=>m.name);

  const date = document.getElementById('d-date').value || todayISO();
  const start = document.getElementById('d-start').value || timeNowHHMM();
  const end = document.getElementById('d-end').value || timeNowHHMM();
  const unitVal = Number(document.getElementById('d-unit').value)||0;
  const details = {
    date, start, end, mins: minutesBetween(start, end), qty: unitVal, crew: crewNames,
  };
  if (task.unit==='containers'){
    details.containers = unitVal;
    details.vehicles = Number(document.getElementById('d-vehicles').value) || (unitVal*task.vehiclesPerContainer);
    details.qty = details.vehicles;
  }
  if (task.hasIssue){
    const issueYes = document.querySelector('input[name="issue-d"]:checked')?.value==='yes';
    details.hasIssue = issueYes;
    details.issueCount = issueYes ? (Number(document.getElementById('d-issue').value)||0) : 0;
  }

  hint.textContent = 'กำลังบันทึก...';
  try{
    // Schema stores one employee per job row, so a multi-person crew is
    // logged as one row per teammate, sharing the same task/details/crew list.
    const rows = crewMembers.map(m => ({
      department: oDeptVal, task_id: oTaskVal, employee_id: m.id, employee_name: m.name,
      details, created_by: currentUser.id,
    }));
    const { error } = await sb.from('jobs').insert(rows);
    if (error) throw error;
    hint.textContent = '';
    await refreshJobs();
    showSuccess(task?.label||'', crewMembers.length);
  } catch(err){
    hint.textContent = '';
    alert('บันทึกไม่สำเร็จ: ' + mapDbError(err));
  }
});

function mapDbError(err){
  if (!err) return 'unknown error';
  if (err.code === '42501' || /row-level security/i.test(err.message||'')) return 'ไม่มีสิทธิ์บันทึกข้อมูลของแผนกนี้';
  return err.message || err.code || 'unknown error';
}

function showSuccess(taskLabel, crewCount){
  document.getElementById('successText').textContent = 'บันทึกงานเรียบร้อย';
  document.getElementById('successSub').textContent = `${taskLabel} · ทีม ${crewCount} คน`;
  activeStep = 4; renderScreens();
  setTimeout(()=>{
    oTaskVal=null; crew=[]; doneFieldsBuiltForTask=null;
    if (!isAdmin()) oDeptVal = profile.department; else oDeptVal = null;
    document.getElementById('d-date').value=''; document.getElementById('d-start').value=''; document.getElementById('d-end').value='';
    document.getElementById('openHint').textContent='';
    goTab('history');
    render();
  }, 1100);
}

// ================= EMPLOYEE ROSTER =================
function renderRosterManager(){
  const cols = document.getElementById('rosterCols');
  cols.innerHTML = visibleDepts().map(d=>{
    const list = roster.filter(r=>r.department===d).sort((a,b)=>a.name.localeCompare(b.name,'th'));
    const isOpen = openRosterDept===d;
    const rows = list.length===0
      ? `<p class="empty-roster">ยังไม่มีคนงานฝั่งนี้</p>`
      : list.map(r=>`<div class="roster-row"><span class="rr-name"><span class="badge ${d}"><span class="dot"></span>${DEPT_PLAIN[d]}</span>${r.name}</span><button type="button" class="icon-btn" data-roster-del="${r.id}">${ICONS.x}</button></div>`).join('');
    return `<div class="matrix-emp ${isOpen?'open':''}">
      <div class="matrix-emp-head" data-roster-dept="${d}">
        <span class="name">${DEPT_PLAIN[d]}</span>
        <span class="total">${list.length} คน</span>
        <span class="t-chev chev">${ICONS.chev}</span>
      </div>
      <div class="matrix-emp-body">${rows}</div>
    </div>`;
  }).join('');
}

function openAddEmpModal(){
  document.getElementById('r-name').value='';
  document.getElementById('rosterHint').textContent='';
  document.getElementById('addEmpBackdrop').classList.add('open');
  document.getElementById('addEmpModal').classList.add('open');
  setTimeout(()=>document.getElementById('r-name').focus(), 50);
}
function closeAddEmpModal(){
  document.getElementById('addEmpBackdrop').classList.remove('open');
  document.getElementById('addEmpModal').classList.remove('open');
}
document.getElementById('rosterSubmitBtn').addEventListener('click', async ()=>{
  const name = document.getElementById('r-name').value.trim();
  const hint = document.getElementById('rosterHint');
  if(!name){ hint.textContent='พิมพ์ชื่อพนักงานก่อน'; return; }
  if (roster.some(r=>r.name===name)){ hint.textContent = `"${name}" มีอยู่ในรายชื่อแล้ว`; return; }
  hint.textContent = 'กำลังเพิ่ม...';
  try{
    const { error } = await sb.from('employees').insert({ name, department: isAdmin() ? (oDeptVal||profile.department||DEPT_KEYS[0]) : profile.department });
    if (error) throw error;
    hint.textContent = `เพิ่ม "${name}" แล้ว`;
    await refreshRoster(); render();
    setTimeout(closeAddEmpModal, 500);
  }catch(err){ hint.textContent = 'เพิ่มไม่สำเร็จ: ' + mapDbError(err); }
  document.getElementById('r-name').value='';
});

// ================= HISTORY FILTERS =================
document.getElementById('empFilter').addEventListener('change', e=>{ empFilter=e.target.value; render(); });
document.getElementById('searchBox').addEventListener('input', e=>{ searchTerm=e.target.value.toLowerCase(); render(); });

function formatResult(details, task){
  if (!task || !details) return '–';
  if (task.unit==='containers') return `${details.containers ?? details.qty ?? 0} ตู้ / ${details.vehicles ?? ((details.containers||0)*(task.vehiclesPerContainer||56))} คัน`;
  let s = `${details.qty ?? 0} ${unitShort(task.unit)}`;
  if (task.hasIssue && details.hasIssue) s += ` · มีปัญหา ${details.issueCount||0} คัน`;
  return s;
}

// Group raw job rows (one per employee) back into a single logical entry per submission.
function groupJobs(rows){
  const map = new Map();
  rows.forEach(r=>{
    const key = [r.department, r.task_id, (r.details&&r.details.date)||'', (r.details&&r.details.start)||'', r.created_at.slice(0,16)].join('|');
    if (!map.has(key)) map.set(key, { ...r, crewNames: new Set() });
    const g = map.get(key);
    if (r.employee_name) g.crewNames.add(r.employee_name);
  });
  return [...map.values()].map(g=>({...g, crew: (g.details && g.details.crew && g.details.crew.length) ? g.details.crew : [...g.crewNames]}));
}

// ================= SKILL MATRIX =================
function renderMatrix(){
  const scopedJobs = jobs.filter(j=>inScope(j.department));
  const rosterScoped = roster.filter(r=>inScope(r.department));
  const tasksScoped = ALL_TASKS().filter(t=>inScope(t.dept));
  const rosterNames = rosterScoped.map(r=>r.name);
  const logNames = scopedJobs.flatMap(j=>j.crew||[]);
  const emps = [...new Set([...rosterNames, ...logNames])].sort((a,b)=>a.localeCompare(b,'th'));
  const wrap = document.getElementById('matrixWrap');
  if (emps.length===0){ wrap.innerHTML = `<p class="empty-roster">ยังไม่มีข้อมูล</p>`; return; }

  wrap.innerHTML = emps.map(emp=>{
    const rows = tasksScoped.map(t=>{
      const n = scopedJobs.filter(j=>j.task_id===t.id && (j.crew||[]).includes(emp)).length;
      return {t, n};
    });
    const total = rows.reduce((s,r)=>s+r.n,0);
    const isOpen = openMatrixEmp===emp;
    const rowsHtml = rows.map(({t,n})=>`
      <div class="skill-row">
        <span style="display:inline-flex;align-items:center;gap:6px;"><span style="display:inline-flex;width:15px;height:15px;">${ICONS[t.icon]||ICONS.box}</span>${t.label}</span>
        <span class="skill-count" style="color:${n>0?'var(--'+t.dept.toLowerCase()+')':'var(--ink-faint)'}">${n||'–'}</span>
      </div>`).join('');
    return `
    <div class="matrix-emp ${isOpen?'open':''}">
      <div class="matrix-emp-head" data-matrix-emp="${emp}">
        <span class="name">${emp}</span>
        <span class="total">${total} ครั้ง</span>
        <span class="chev">${ICONS.chev}</span>
      </div>
      <div class="matrix-emp-body">${rowsHtml}</div>
    </div>`;
  }).join('');
}

// ================= HISTORY LIST =================
function renderHistory(){
  document.getElementById('dateFilterChips').style.display = '';
  const scopedJobs = jobs.filter(j=>inScope(j.department));
  const rosterScoped = roster.filter(r=>inScope(r.department));
  const rosterNames = rosterScoped.map(r=>r.name);
  const logNames = scopedJobs.flatMap(j=>j.crew||[]);
  const emps = [...new Set([...rosterNames, ...logNames])].sort((a,b)=>a.localeCompare(b,'th'));
  const ef = document.getElementById('empFilter');
  const prevVal = ef.value;
  ef.innerHTML = '<option value="">พนักงานทั้งหมด</option>' + emps.map(n=>`<option value="${n}">${n}</option>`).join('');
  ef.value = prevVal;

  const todayStr = todayISO();
  const weekAgoStr = new Date(nowBkk().getTime() - 6*86400000).toLocaleDateString('sv-SE');
  let filtered = scopedJobs.filter(j=>{
    const d = j.details || {};
    if (dateRange==='today' && d.date!==todayStr) return false;
    if (dateRange==='week' && d.date < weekAgoStr) return false;
    if (empFilter && !(j.crew||[]).includes(empFilter)) return false;
    if (searchTerm){
      const task = taskById(j.task_id);
      const hay = ((task?task.label:'')+' '+(j.crew||[]).join(' ')).toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }
    return true;
  }).sort((a,b)=> (b.details.date+(b.details.end||b.details.start||'')).localeCompare(a.details.date+(a.details.end||a.details.start||'')));

  const list = document.getElementById('historyList');
  const empty = document.getElementById('historyEmpty');
  if (filtered.length===0){ list.innerHTML=''; empty.hidden=false; return; }
  empty.hidden=true;
  list.innerHTML = filtered.map(j=>{
    const task = taskById(j.task_id);
    const d = j.details || {};
    const issueBadge = (task && task.hasIssue && d.hasIssue) ? `<span class="badge issue">มีปัญหา</span>` : '';
    const status = j.status || 'approved';
    return `
    <div class="hist-card">
      <div class="hist-top">
        <div>
          <span class="badge ${j.department}"><span class="dot"></span>${DEPT_PLAIN[j.department]}</span>
          <span class="status-badge ${status}">${STATUS_LABEL[status]||status}</span>
          <div class="hist-task">${task?('<span style=\"display:inline-flex;vertical-align:-3px;width:15px;height:15px;margin-right:4px;\">'+(ICONS[task.icon]||ICONS.box)+'</span>'+task.label):j.task_id}</div>
          <div class="hist-crew">${(j.crew||[]).join(', ')}</div>
        </div>
      </div>
      <div class="hist-meta">
        <span>${d.date||''}</span>
        <span>${d.start||''}–${d.end||'–'} (${d.mins ?? '–'} นาที)</span>
        <span class="hist-result">${formatResult(d, task)}</span>
        ${issueBadge}
      </div>
    </div>`;
  }).join('');
}

// ================= MASTER RENDER =================
function render(){
  const scopedJobs = jobs.filter(j=>inScope(j.department));
  const rosterScoped = roster.filter(r=>inScope(r.department));
  document.getElementById('statRow').innerHTML = `
    <div class="stat-card"><div class="n num">${rosterScoped.length}</div><div class="l">คนงาน</div></div>
    <div class="stat-card"><div class="n num">${scopedJobs.length}</div><div class="l">เสร็จแล้ว</div></div>
    <div class="stat-card"><div class="n num">${scopedJobs.filter(j=>j.details && j.details.date===todayISO()).length}</div><div class="l">วันนี้</div></div>
  `;
  renderMatrix();
  renderHistory();
  renderRosterManager();
  if (activeTab==='new'){
    if (isAdmin()){
      if (activeStep===1) renderStep1();
      if (activeStep===2) renderStep2();
      if (activeStep===3) renderStep3();
    } else if (isWorker() && workerStep!=='success'){
      renderWorkerHome();
    }
  } else if (activeTab==='approve' && isSupervisorRole()){
    refreshPendingApprovals().then(renderApproveQueue);
  }
}

// ================= DATA REFRESH =================
async function refreshRoster(){
  try{
    let q = sb.from('employees').select('*').eq('active', true).order('name');
    const { data, error } = await q;
    if (error) throw error;
    roster = data || [];
  }catch(e){ /* leave roster as-is, RLS/network error */ }
}
async function refreshJobs(){
  try{
    const { data, error } = await sb.from('jobs').select('*').order('created_at', { ascending:false }).limit(1000);
    if (error) throw error;
    jobs = groupJobs(data || []);
  }catch(e){ /* leave jobs as-is */ }
}
async function refreshAll(){
  document.getElementById('liveStatus').innerHTML = '<span class="live-dot"></span>กำลังโหลด...';
  await Promise.all([refreshRoster(), refreshJobs()]);
  document.getElementById('liveStatus').innerHTML = '<span class="live-dot"></span>ซิงก์สด';
  render();
}

function wireRealtime(){
  if (realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb.channel('jobs-changes-'+ (currentUser?currentUser.id:'anon'))
    .on('postgres_changes', {event:'*', schema:'public', table:'jobs'}, () => refreshJobs().then(render))
    .on('postgres_changes', {event:'*', schema:'public', table:'employees'}, () => refreshRoster().then(render))
    .subscribe();
}

// ================= BOOT =================
goTab('new');
renderScreens();
document.getElementById('liveStatus').innerHTML = '<span class="live-dot"></span>รอเข้าสู่ระบบ';

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user){
    await afterLogin(session.user);
  } else {
    showLogin();
  }
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT'){ showLogin(); }
  });
})();
