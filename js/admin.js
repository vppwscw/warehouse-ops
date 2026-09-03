// ===================== SUPABASE INIT =====================

const DEPT_KEYS = ['INB','OUT','INV'];
const DEPT_PLAIN = { INB:'ขาเข้า', OUT:'ขาออก', INV:'สต๊อก' };
const DEPT_ICON  = { INB:'inbound', OUT:'outbound', INV:'inventory' };
const ROLE_LABEL = { ADMIN:'ผู้ดูแลระบบ', ASSISTANT:'ผู้ช่วยผู้จัดการ', SUPERVISOR:'หัวหน้างาน', USER:'พนักงาน' };
const STATUS_LABEL = { pending:'รออนุมัติ', approved:'อนุมัติแล้ว', rejected:'ไม่อนุมัติ', open:'กำลังทำงาน' };

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
  box:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z"/><path d="M3 7.5 12 12l9-4.5"/><path d="M12 12v9"/></svg>',
  inbound:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><path d="M8 10l4 4 4-4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
  outbound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14V3"/><path d="M8 7l4-4 4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
  inventory:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z"/><path d="M3 7.5 12 12l9-4.5"/><path d="M12 12v9"/></svg>',
};

let profile = null, currentUser = null;
let jobs = [], roster = [], users = [];
let realtimeChannel = null;
let dateRange = 'today', deptFilter = 'ALL', searchTerm = '', activeView = 'dashboard';

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
const NAV = [
  {id:'dashboard',  label:'ภาพรวม (Dashboard)', icon:'dash', title:'ภาพรวม', sub:'สรุปผลงานคลังสินค้าตามช่วงเวลาที่เลือก'},
  {id:'details',    label:'รายละเอียดทั้งหมด',   icon:'list', title:'รายละเอียดทั้งหมด', sub:'รายการงานทุกชิ้นตามตัวกรองที่เลือก'},
  {id:'employees',  label:'พนักงาน',             icon:'users', title:'พนักงาน', sub:'สรุปจำนวนงานที่ทำของพนักงานแต่ละคน'},
  {id:'users',      label:'ผู้ใช้งานระบบ',        icon:'lock', title:'ผู้ใช้งานระบบ', sub:'รายชื่อบัญชีผู้ใช้งาน (อ่านอย่างเดียว)'},
];
document.getElementById('navList').innerHTML = NAV.map(n=>`
  <button type="button" class="navbtn" data-view="${n.id}" aria-current="${n.id==='dashboard'}">
    <span class="nav-ic"></span><span>${n.label}</span>
  </button>`).join('');
document.querySelectorAll('.navbtn').forEach((btn,i)=>{ btn.querySelector('.nav-ic').innerHTML = ICONS[NAV[i].icon]; });
document.getElementById('loginLockIcon').innerHTML = ICONS.lock;
document.getElementById('deniedLockIcon').innerHTML = ICONS.lock;
document.getElementById('brandMark').innerHTML = ICONS.box;

function goView(id){
  activeView = id;
  document.querySelectorAll('.navbtn').forEach(b=>b.setAttribute('aria-current', b.dataset.view===id));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+id).classList.add('active');
  const n = NAV.find(x=>x.id===id);
  document.getElementById('pageTitle').textContent = n.title;
  document.getElementById('pageSub').textContent = n.sub;
  if (id==='users') renderUsersTable();
  render();
}
document.addEventListener('click', e=>{
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

  const approveBtn = e.target.closest('[data-approve-job]');
  if (approveBtn){ setJobStatus(approveBtn.dataset.approveJob, 'approved'); return; }
  const rejectBtn = e.target.closest('[data-reject-job]');
  if (rejectBtn){ setJobStatus(rejectBtn.dataset.rejectJob, 'rejected'); return; }

  const saveCodeBtn = e.target.closest('[data-save-code]');
  if (saveCodeBtn){ saveEmployeeCode(saveCodeBtn.dataset.saveCode); return; }
});
document.getElementById('searchInput').addEventListener('input', e=>{ searchTerm = e.target.value.trim().toLowerCase(); render(); });

// ---------- data grouping (jobs table stores one row per employee) ----------
function groupJobs(rows){
  const map = new Map();
  rows.forEach(r=>{
    const key = [r.department, r.task_id, (r.details&&r.details.date)||'', (r.details&&r.details.start)||'', (r.created_at||'').slice(0,16)].join('|');
    if (!map.has(key)) map.set(key, { ...r, crewNames: new Set() });
    const g = map.get(key);
    if (r.employee_name) g.crewNames.add(r.employee_name);
  });
  return [...map.values()].map(g=>({...g, crew: (g.details && g.details.crew && g.details.crew.length) ? g.details.crew : [...g.crewNames]}));
}

// ---------- filtering ----------
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
    if (searchTerm){
      const task = taskById(j.task_id);
      const hay = ((task?task.label:'')+' '+(j.crew||[]).join(' ')).toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }
    return true;
  });
}

function formatResult(details, task){
  if (!task || !details) return '–';
  if (task.unit==='containers') return `${details.containers ?? 0} ตู้ / ${details.vehicles ?? ((details.containers||0)*(task.vehiclesPerContainer||56))} คัน`;
  let s = `${details.qty ?? 0} ${task.unitLabel}`;
  if (task.hasIssue && details.hasIssue) s += ` · มีปัญหา ${details.issueCount||0} คัน`;
  return s;
}

// ---------- renderers ----------
function renderStats(closed){
  const totalMins = closed.reduce((s,j)=>s+((j.details&&j.details.mins)||0),0);
  const avgMins = closed.length ? Math.round(totalMins/closed.length) : 0;
  const rosterScoped = deptFilter==='ALL' ? roster : roster.filter(r=>r.department===deptFilter);
  const pendingCount = closed.filter(j=>(j.status||'approved')==='pending').length;
  document.getElementById('statGrid').innerHTML = `
    <div class="stat-tile accent"><div class="l">งานที่บันทึกแล้ว</div><div class="n num">${closed.length}<span class="unit">งาน</span></div></div>
    <div class="stat-tile"><div class="l">เวลาเฉลี่ยต่องาน</div><div class="n num">${avgMins}<span class="unit">นาที</span></div></div>
    <div class="stat-tile"><div class="l">พนักงานในขอบเขตนี้</div><div class="n num">${rosterScoped.length}<span class="unit">คน</span></div></div>
    <div class="stat-tile${pendingCount?' warn':''}"><div class="l">รออนุมัติ</div><div class="n num">${pendingCount}<span class="unit">งาน</span></div></div>
  `;
}

function renderDeptBars(closed){
  const counts = DEPT_KEYS.map(d=>({d, n: closed.filter(j=>j.department===d).length}));
  const max = Math.max(1, ...counts.map(c=>c.n));
  document.getElementById('deptBarList').innerHTML = counts.map(({d,n})=>`
    <div class="barrow">
      <span class="lbl"><span class="dot" style="background:var(--${d.toLowerCase()})"></span>${DEPT_PLAIN[d]}</span>
      <span class="track"><span class="fill" style="width:${(n/max*100).toFixed(1)}%;background:var(--${d.toLowerCase()})"></span></span>
      <span class="val num">${n}</span>
    </div>`).join('');
}

function renderUnitCards(closed){
  const sums = { INB:{containers:0,vehicles:0}, OUT:{vehicles:0,issue:0}, INV:{pieces:0,boxes:0} };
  closed.forEach(j=>{
    const task = taskById(j.task_id); const d = j.details||{}; if (!task) return;
    if (task.unit==='containers'){ sums.INB.containers += d.containers||0; sums.INB.vehicles += d.vehicles ?? ((d.containers||0)*(task.vehiclesPerContainer||56)); }
    else if (j.department==='INB') sums.INB.vehicles += d.qty||0;
    else if (j.department==='OUT'){ sums.OUT.vehicles += d.qty||0; if (task.hasIssue && d.hasIssue) sums.OUT.issue += d.issueCount||0; }
    else if (task.unit==='boxes') sums.INV.boxes += d.qty||0;
    else if (task.unit==='pieces') sums.INV.pieces += d.qty||0;
  });
  const cards = [
    {dept:'INB', ic:DEPT_ICON.INB, t1:'ขาเข้า', t2:`${sums.INB.containers} ตู้`, n:sums.INB.vehicles+' คัน'},
    {dept:'OUT', ic:DEPT_ICON.OUT, t1:'ขาออก', t2: sums.OUT.issue ? `พบปัญหา ${sums.OUT.issue} คัน` : 'ไม่พบปัญหา', n:sums.OUT.vehicles+' คัน'},
    {dept:'INV', ic:DEPT_ICON.INV, t1:'สต๊อก', t2:`${sums.INV.pieces} ชิ้น`, n:sums.INV.boxes+' กล่อง'},
  ];
  document.getElementById('unitCards').innerHTML = cards.map(c=>`
    <div class="unit-card">
      <span class="ic" style="background:var(--${c.dept.toLowerCase()}-bg);color:var(--${c.dept.toLowerCase()})">${ICONS[c.ic]}</span>
      <span class="txt"><span class="t1">${c.t1}</span><br><span class="t2">${c.t2}</span></span>
      <span class="n num">${c.n}</span>
    </div>`).join('');
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
}

function renderRecentTable(closed){
  const rows = [...closed].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')).slice(0,10);
  const tbody = document.querySelector('#recentTable tbody');
  if (rows.length===0){ tbody.innerHTML = `<tr><td colspan="6" class="empty-note">ยังไม่มีงานที่บันทึกในช่วงนี้</td></tr>`; return; }
  tbody.innerHTML = rows.map(j=>{
    const task = taskById(j.task_id); const d = j.details||{};
    const status = j.status || 'approved';
    return `<tr>
      <td class="mono">${d.date||''} ${d.end||''}</td>
      <td><span class="badge ${j.department}"><span class="dot"></span>${DEPT_PLAIN[j.department]}</span></td>
      <td class="td-task">${task?task.label:j.task_id}</td>
      <td>${(j.crew||[]).join(', ')}</td>
      <td class="mono">${formatResult(d,task)}</td>
      <td><span class="status-badge ${status}">${STATUS_LABEL[status]||status}</span></td>
    </tr>`;
  }).join('');
}

function renderDetailsTable(closed){
  const rows = [...closed].sort((a,b)=>((b.details&&b.details.date)+((b.details&&b.details.start)||'')).localeCompare((a.details&&a.details.date)+((a.details&&a.details.start)||'')));
  const tbody = document.querySelector('#detailsTable tbody');
  if (rows.length===0){ tbody.innerHTML = `<tr><td colspan="9" class="empty-note">ไม่พบรายการที่ตรงกับตัวกรอง</td></tr>`; return; }
  tbody.innerHTML = rows.map(j=>{
    const task = taskById(j.task_id); const d = j.details||{};
    const status = j.status || 'approved';
    const canAct = !isReadOnly() && status==='pending';
    return `<tr>
      <td class="mono">${d.date||''}</td>
      <td><span class="badge ${j.department}"><span class="dot"></span>${DEPT_PLAIN[j.department]}</span></td>
      <td class="td-task">${task?task.label:j.task_id}</td>
      <td>${(j.crew||[]).join(', ')}</td>
      <td class="mono">${d.start||'–'}–${d.end||'–'}</td>
      <td class="mono">${d.mins ?? '–'}</td>
      <td class="mono">${formatResult(d,task)}</td>
      <td><span class="status-badge ${status}">${STATUS_LABEL[status]||status}</span></td>
      <td>${canAct ? `
        <button type="button" class="mini-btn approve" data-approve-job="${j.id}">อนุมัติ</button>
        <button type="button" class="mini-btn reject" data-reject-job="${j.id}">ไม่อนุมัติ</button>
      ` : '–'}</td>
    </tr>`;
  }).join('');
}

async function setJobStatus(jobId, status){
  const { error } = await sb.from('jobs').update({
    status, approved_by: currentUser.id, approved_at: new Date().toISOString(),
  }).eq('id', jobId);
  if (error){ alert('ทำรายการไม่สำเร็จ: ' + mapDbError(error)); return; }
  await refreshJobs(); render();
}

function renderEmployeesTable(closed){
  const rosterScoped = (deptFilter==='ALL' ? roster : roster.filter(r=>r.department===deptFilter)).slice().sort((a,b)=>a.name.localeCompare(b.name,'th'));
  const tbody = document.querySelector('#employeesTable tbody');
  if (rosterScoped.length===0){ tbody.innerHTML = `<tr><td colspan="4" class="empty-note">ยังไม่มีพนักงานในขอบเขตนี้</td></tr>`; return; }
  tbody.innerHTML = rosterScoped.map(r=>{
    const inRange = closed.filter(j=>(j.crew||[]).includes(r.name)).length;
    const total = jobs.filter(j=>(j.crew||[]).includes(r.name)).length;
    const initials = r.name.trim().slice(0,1);
    return `<tr>
      <td><span class="emp-name-cell"><span class="emp-avatar">${initials}</span>${r.name}</span></td>
      <td><span class="badge ${r.department}"><span class="dot"></span>${DEPT_PLAIN[r.department]}</span></td>
      <td class="mono">${inRange}</td>
      <td class="mono">${total}</td>
    </tr>`;
  }).join('');
}

function renderUsersTable(){
  const tbody = document.querySelector('#usersTable tbody');
  if (!tbody) return;
  if (users.length===0){ tbody.innerHTML = `<tr><td colspan="5" class="empty-note">ไม่พบข้อมูลผู้ใช้งาน</td></tr>`; return; }
  tbody.innerHTML = users.map(u=>`
    <tr>
      <td>${u.full_name||'–'}</td>
      <td><span class="badge role">${ROLE_LABEL[u.role]||u.role}</span></td>
      <td>${u.department ? `<span class="badge ${u.department}"><span class="dot"></span>${DEPT_PLAIN[u.department]}</span>` : '<span class="td-sub">ทุกแผนก</span>'}</td>
      <td>${isReadOnly()
        ? (u.employee_code || '–')
        : `<input type="text" class="code-input" data-code-input="${u.id}" value="${u.employee_code||''}" placeholder="รหัส">`}</td>
      <td>${isReadOnly() ? '' : `<button type="button" class="mini-btn approve" data-save-code="${u.id}">บันทึก</button>`}</td>
    </tr>`).join('');
}
async function saveEmployeeCode(userId){
  const input = document.querySelector(`[data-code-input="${userId}"]`);
  if (!input) return;
  const code = input.value.trim();
  try{
    const { error } = await sb.from('profiles').update({ employee_code: code || null }).eq('id', userId);
    if (error) throw error;
    await refreshUsers(); renderUsersTable();
  }catch(err){ alert('บันทึกไม่สำเร็จ: ' + mapDbError(err)); }
}

function render(){
  const closed = filteredJobs();
  if (activeView==='dashboard'){
    renderStats(closed); renderDeptBars(closed); renderUnitCards(closed); renderDayChart(); renderRecentTable(closed);
  } else if (activeView==='details'){
    renderDetailsTable(closed);
  } else if (activeView==='employees'){
    renderStats(closed);
    renderEmployeesTable(closed);
  } else if (activeView==='users'){
    renderUsersTable();
  }
}

// ---------- data refresh ----------
async function refreshJobs(){
  try{
    const { data, error } = await sb.from('jobs').select('*').order('created_at', { ascending:false }).limit(2000);
    if (error) throw error;
    jobs = groupJobs(data || []);
  }catch(e){ document.getElementById('syncText').textContent = 'เชื่อมต่อข้อมูลงานไม่สำเร็จ ('+mapDbError(e)+')'; }
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
    const { data, error } = await sb.from('profiles').select('*').order('full_name');
    if (error) throw error;
    users = data || [];
  }catch(e){ /* admin-only view; ignore errors for non-critical panel */ }
}
async function refreshAll(){
  document.getElementById('syncText').textContent = 'กำลังโหลดข้อมูล...';
  await Promise.all([refreshJobs(), refreshRoster(), refreshUsers()]);
  document.getElementById('syncText').textContent = 'ซิงก์สดกับแอปมือถือ';
  render();
}

function wireRealtime(){
  if (realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb.channel('erp-jobs-changes-'+(currentUser?currentUser.id:'anon'))
    .on('postgres_changes', {event:'*', schema:'public', table:'jobs'}, () => refreshJobs().then(render))
    .on('postgres_changes', {event:'*', schema:'public', table:'employees'}, () => refreshRoster().then(render))
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
