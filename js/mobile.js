// Block pinch / double-tap zoom (iOS Safari ignores user-scalable=no)
["gesturestart","gesturechange"].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));

// ===================== SUPABASE INIT =====================

// Departments are per-warehouse data (public.departments, PK (warehouse,code)
// since 2026-09-14) — คลังใครคลังมัน: the same code can exist independently
// in A and B with its own name/color/active. DEPT_BY_WH[wh] holds the active
// codes + labels for one warehouse; these seed a fallback (both warehouses =
// INB/OUT/INV) until loadDepartments() runs on login.
function seedDeptBucket(){ return { keys:['INB','OUT','INV'],
  plain:{ INB:'INBOUND', OUT:'OUTBOUND', INV:'INVENTORY' },
  color:{ INB:'#9E5F1E', OUT:'#276F4E', INV:'#5B4A97' } }; }
let DEPT_BY_WH = { A: seedDeptBucket(), B: seedDeptBucket() };
const WH_KEYS = ['A','B'];
const WH_PLAIN = { A:'คลัง A', B:'คลัง B' };
const DEPT_SUB   = { INB:'รับรถเข้าคลัง', OUT:'ส่งรถออกคลัง', INV:'จัดการของ/แพ็คของ' };  // known 3 only
const DEPT_ICON  = { INB:'inbound', OUT:'outbound', INV:'inventory' };                      // else -> box
async function loadDepartments(){
  try{
    const { data, error } = await sb.from('departments').select('*').eq('active', true).order('warehouse').order('sort').order('code');
    if (error) throw error;
    if (data && data.length){
      const byWh = { A:{keys:[],plain:{},color:{}}, B:{keys:[],plain:{},color:{}} };
      data.forEach(d=>{
        const b = byWh[d.warehouse] || (byWh[d.warehouse] = {keys:[],plain:{},color:{}});
        b.keys.push(d.code); b.plain[d.code] = d.name; b.color[d.code] = d.color || '#6B7280';
      });
      DEPT_BY_WH = byWh;
    }
  }catch(e){ /* keep fallback */ }
}
// active codes for one warehouse, or the union of both when wh is falsy/'ALL'.
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
Object.keys(FALLBACK_TASKS).forEach(d => FALLBACK_TASKS[d].forEach(t => ICON_BY_TASK_ID[t.id] = t.icon));

let TASKS = { INB:[], OUT:[], INV:[] }; // populated at load, DB-preferred with fallback
const ALL_TASKS = () => Object.values(TASKS).flat();
const taskById = id => ALL_TASKS().find(t=>t.id===id);
const unitShort = u => ({containers:'ตู้', vehicles:'คัน', pieces:'ชิ้น', boxes:'กล่อง'})[u] || u;

// Every value that ends up inside an innerHTML template must go through esc() —
// full_name / employee_name, employee_code, task names, roster names and the
// whole jobs.details blob are user-controlled and were an XSS vector before this.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => Number(v) || 0;

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
const AV_PALETTE = [['#F4F6F8','#545B65'],['#FAEAE8','#AE3A32'],['#E9F0F5','#1B5E8C'],['#EFEBF8','#5B4A97'],['#FFF4D6','#9A6410'],['#E6F3EC','#1E7A4B']];
function avatarHTML(name, size){
  const ch = Array.from(String(name||'').trim())[0] || '';
  let h = 0; for (const c of String(name||'')) h = (h + c.codePointAt(0)) % 997;
  const pal = AV_PALETTE[h % AV_PALETTE.length];
  return `<span class="av" style="width:${size}px;height:${size}px;background:${pal[0]};color:${pal[1]};font-size:${Math.round(size*0.4)}px">${esc(ch)}</span>`;
}
function avatarStack(names, size){ return `<span class="avs">${(names||[]).slice(0,4).map(n=>avatarHTML(n,size)).join('')}</span>`; }
let supOpenDone = false;     // writer just recorded a job -> show success screen
let crewQuery = '';
let crewWhTab = null;   // crew picker warehouse tab (null = job's warehouse)          // crew picker search text
let rosterQuery = '', rosterDeptFilter = 'all';
document.getElementById('backBtn').innerHTML = ICONS.back;
document.querySelector('.ok-circle').innerHTML = ICONS.check;
document.getElementById('logoutBtn').innerHTML = ICONS.logout;
document.getElementById('openMatrixChev').innerHTML = ICONS.chev;
document.getElementById('matrixTrophyIcon').innerHTML = ICONS.trophy;
document.getElementById('taskSearchIcon').innerHTML = ICONS.search;
document.getElementById('rosterSearchIcon').innerHTML = ICONS.search;

const nowBkk = () => new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Bangkok'}));
const todayISO = () => nowBkk().toLocaleDateString('sv-SE');
const minDateISO = () => new Date(nowBkk().getTime() - 3*864e5).toLocaleDateString('sv-SE'); // DB: date >= today-3
const timeNowHHMM = () => { const d=nowBkk(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); };
function minutesBetween(start,end){
  const [sh,sm]=start.split(':').map(Number), [eh,em]=end.split(':').map(Number);
  let d=(eh*60+em)-(sh*60+sm); if(d<0) d+=24*60; return d;
}

let roster = [];   // employees rows for the visible department(s)
let jobs = [];      // grouped job entries for the visible department(s)
let myScope = [];   // staff_scope rows {warehouse, department} for the current user
let profile = null; // {id, full_name, department, role}
let currentUser = null;
let realtimeChannel = null;

const isAdmin = () => !!profile && profile.role === 'ADMIN';
// Positions (LV system): positions[id] = {id,name,lv,active,sort}. Non-admin
// behaviour is driven by LV, never by profiles.role.
let positions = {};
const lvOf = p => (p && positions[p.position_id] && positions[p.position_id].lv) || 0;
const myLv = () => lvOf(profile);
const posLabel = p => {
  if (!p) return '';
  if (p.role === 'ADMIN') return 'Admin';
  const pos = positions[p.position_id];
  return pos ? `${pos.name} (LV${pos.lv})` : '';
};
// LV1-2 : read-only — only see jobs where they are crew
const isWorker = () => !!profile && !isAdmin() && myLv() < 3;
// LV3+ (non-admin): records finished jobs for the team
const isSupervisorRole = () => !!profile && !isAdmin() && myLv() >= 3;
// writers = ADMIN + LV3+
const isWriter = () => isAdmin() || isSupervisorRole();
// jobs the current user may look at: LV1-2 see their own rows as-is (a crew job can be in another dept)
const scopedJobList = () => isWorker() ? jobs : jobs.filter(j=>inScope(j.department) && inWh(j.warehouse));
// Mirror of DB can_see: LV scope (LV5 all, LV4 home warehouse, LV1-3 home wh+dept)
// plus staff_scope extras. UI only; DB is the truth.
const myScopePairs = () => {
  if (isAdmin()) return WH_KEYS.flatMap(w => deptKeysFor(w).map(d => ({ warehouse:w, department:d })));
  const lv = myLv(), home = profile && profile.warehouse, out = [];
  if (lv >= 5) WH_KEYS.forEach(w => deptKeysFor(w).forEach(d => out.push({ warehouse:w, department:d })));
  else if (lv === 4 && home) deptKeysFor(home).forEach(d => out.push({ warehouse:home, department:d }));
  else if (lv >= 1 && home && profile.department) out.push({ warehouse:home, department:profile.department });
  myScope.forEach(s => out.push({ warehouse:s.warehouse, department:s.department }));
  const seen = new Set();
  return out.filter(p => { const k = p.warehouse+'|'+p.department; if (seen.has(k)) return false; seen.add(k); return true; });
};
const myWarehouses = () => [...new Set(myScopePairs().map(p=>p.warehouse))];
const deptsForWh = wh => [...new Set(myScopePairs().filter(p=>p.warehouse===wh).map(p=>p.department))];
const myDepts = () => {
  if (!profile) return [];
  if (isAdmin()) return deptKeysFor(null);
  const fromScope = [...new Set(myScopePairs().map(s=>s.department))];
  if (fromScope.length) return fromScope;
  if (Array.isArray(profile.departments) && profile.departments.length) return profile.departments;
  return profile.department ? [profile.department] : [];
};
const inScope = d => isAdmin() || myDepts().includes(d);
const inWh = w => isAdmin() || myWarehouses().includes(w);
const visibleDepts = () => isAdmin() ? deptKeysFor(null) : deptKeysFor(null).filter(d=>myDepts().includes(d));
// task list is warehouse-agnostic in the fallback (no `warehouse`), warehouse-pinned once from the DB
// A task belongs to a warehouse only when it is tagged with that exact one.
// The hardcoded FALLBACK_TASKS carry no warehouse and can't open a job anyway
// (jobs.task_id FK -> tasks.id), so they must never appear once a warehouse is
// picked — otherwise คลัง B shows คลัง A's generic list.
const taskInWh = (t, wh) => wh ? t.warehouse === wh : t.warehouse == null;

let deptTasks = []; // raw tasks rows (active + inactive) for the task manager
let oWhVal = null, oDeptVal = null, oTaskVal = null, crew = [];
let doneFieldsBuiltForTask = null;
let deptFilter='ALL', empFilter='', searchTerm='', dateRange='today';
let openMatrixEmp = null;
let openRosterDept = null;
let activeTab = 'new';
let activeStep = 1;

// ================= AUTH =================
function mapAuthError(err){
  const msg = (err && err.message) || '';
  if (/invalid login credentials/i.test(msg)) return 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง';
  if (/email not confirmed/i.test(msg)) return 'บัญชียังไม่ได้เปิดใช้งาน — ติดต่อแอดมิน';
  return 'เข้าสู่ระบบไม่สำเร็จ: ' + (msg || 'unknown error');
}
// Login lives on its own page (auth/login). Bounce there, optionally with a reason code.
function goLogin(code){ location.replace('auth/login' + (code ? '?e=' + code : '')); }
function showLogin(){ goLogin(); }
function hideLogin(){}
function refreshRoleBadge(){
  const whs = myWarehouses().join('/');
  const depts = myDepts().map(d=>deptName(d)).join(', ');
  const label = isAdmin() ? 'ผู้ดูแลระบบ' : `คลัง ${whs} · ${depts} · ${posLabel(profile)}`;
  document.getElementById('roleBadge').textContent = label;
}

async function loadProfile(user){
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (error || !data) throw error || new Error('no-profile');
  return data;
}
async function loadPositions(){
  try{
    const { data, error } = await sb.from('positions').select('id,name,lv,active,sort');
    if (error) throw error;
    positions = {};
    (data || []).forEach(r => { positions[r.id] = r; });
  }catch(e){ /* keep previous */ }
}
async function loadMyScope(){
  if (isAdmin()){ myScope = []; return; }
  try{
    const { data, error } = await sb.from('staff_scope').select('warehouse,department').eq('profile_id', currentUser.id);
    if (error) throw error;
    myScope = data || [];
  }catch(e){ myScope = []; }
}

// Which app(s) this account may open. An explicit profiles.apps wins; otherwise
// the role default. 'erp' = /erp, 'mobile' = /app.
function allowedApps(p){
  if (p && Array.isArray(p.apps) && p.apps.length) return p.apps;
  if (!p) return [];
  if (p.role === 'ADMIN') return ['erp','mobile'];
  if (lvOf(p) >= 3) return ['erp','mobile'];
  return ['mobile'];
}

async function afterLogin(user){
  currentUser = user;
  try{
    profile = await loadProfile(user);
  }catch(e){
    try { await sb.auth.signOut(); } catch (e) {}
    goLogin('notfound');
    return;
  }
  if (profile.active === false){
    try { await sb.auth.signOut(); } catch (e) {}
    profile = null;
    goLogin('inactive');
    return;
  }
  await loadPositions();
  if (!isAdmin() && myLv() === 0){
    try { await sb.auth.signOut(); } catch (e) {}
    profile = null;
    goLogin('noposition');
    return;
  }
  if (!allowedApps(profile).includes('mobile')){
    if (allowedApps(profile).includes('erp') && window.gwSwitchTo){
      window.gwSwitchTo('erp');
      return;
    }
    try { await sb.auth.signOut(); } catch (e) {}
    profile = null;
    goLogin('noaccess');
    return;
  }
  if (user.user_metadata && user.user_metadata.must_change_password){
    hideLogin();
    await forcePasswordChange();
  }
  await loadMyScope();
  await loadDepartments();
  hideLogin();
  refreshRoleBadge();
  buildNav();
  await loadTasksFromDb();
  wireRealtime();
  goTab(navForRole()[0].id);
  await refreshAll();
}

async function logout(){
  try { sessionStorage.removeItem('gw-app'); } catch (e) {}  // next person gets device routing again
  try { await sb.auth.signOut(); } catch (e) {}
  profile = null; currentUser = null;
  jobs = []; roster = [];
  if (realtimeChannel){ sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  goLogin();
}
document.getElementById('logoutBtn').addEventListener('click', ()=> logout());

document.getElementById('changePwBtn').innerHTML = ICONS.key;

// Non-blocking toast — replaces alert(), which webviews and the browser's
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

// In-page password modal — replaces window.prompt(). onSubmit(pw) returns an
// error string to show in place, or null on success (modal then closes).
// opts.force: blocking mode (first-login change) — no cancel/backdrop close,
// the cancel button becomes "ออกจากระบบ"; opts.onDone() runs after success.
function askNewPassword(onSubmit, opts){
  const force = !!(opts && opts.force);
  const bd   = document.getElementById('pwBackdrop');
  const card = document.getElementById('pwModal');
  const titleEl = card.querySelector('.modal-title');
  const title0 = titleEl.textContent, cancel0 = document.getElementById('pwCancel').textContent;
  if (force){ titleEl.textContent = 'ตั้งรหัสผ่านใหม่'; document.getElementById('pwCancel').textContent = 'ออกจากระบบ'; }
  const a    = document.getElementById('pwNew');
  const b    = document.getElementById('pwNew2');
  const hint = document.getElementById('pwHint');
  const ok   = document.getElementById('pwConfirm');
  const no   = document.getElementById('pwCancel');
  a.value = ''; b.value = ''; hint.textContent = ''; ok.disabled = false;
  bd.classList.add('open'); card.classList.add('open');
  setTimeout(()=>a.focus(), 40);
  function close(){
    bd.classList.remove('open'); card.classList.remove('open');
    ok.removeEventListener('click', submit); no.removeEventListener('click', onCancel); bd.removeEventListener('click', close);
    titleEl.textContent = title0; no.textContent = cancel0;
  }
  function onCancel(){ close(); if (force) logout(); }
  async function submit(){
    const p = a.value, p2 = b.value;
    if (p.length < 8){ hint.textContent = 'รหัสผ่านต้องอย่างน้อย 8 ตัว'; return; }
    if (p !== p2){ hint.textContent = 'รหัสผ่านสองครั้งไม่ตรงกัน'; return; }
    ok.disabled = true; hint.textContent = 'กำลังบันทึก...';
    const err = onSubmit ? await onSubmit(p) : null;
    if (err){ ok.disabled = false; hint.textContent = err; return; }
    hint.textContent = 'สำเร็จ';
    if (force){ close(); if (opts.onDone) opts.onDone(); return; }
    setTimeout(close, 800);
  }
  ok.addEventListener('click', submit);
  no.addEventListener('click', onCancel);
  if (!force) bd.addEventListener('click', close);
}

// First login after admin create/reset: must set own password before using the app.
function forcePasswordChange(){
  return new Promise((resolve)=>{
    askNewPassword(async (np)=>{
      const { error } = await sb.auth.updateUser({ password: np, data: { must_change_password: false } });
      if (error) return 'ไม่สำเร็จ: ' + (error.message || error);
      toast('ตั้งรหัสผ่านใหม่เรียบร้อย', 'ok');
      return null;
    }, { force:true, onDone: ()=>resolve(true) });
  });
}

function changeOwnPassword(){
  if (!currentUser) return;
  askNewPassword(async (np)=>{
    const { error } = await sb.auth.updateUser({ password: np });
    if (error) return 'ไม่สำเร็จ: ' + (error.message || error);
    toast('เปลี่ยนรหัสผ่านเรียบร้อย ครั้งต่อไปใช้รหัสใหม่', 'ok');
    return null;
  });
}

function closeProfileModal(){
  document.getElementById('pwBackdrop').classList.remove('open');
  document.getElementById('profileModal').classList.remove('open');
}
function openProfileModal(){
  if (!profile) return;
  document.getElementById('pmName').textContent  = profile.full_name || '–';
  document.getElementById('pmCode').textContent  = profile.employee_code || '–';
  document.getElementById('pmRole').textContent  = posLabel(profile) || profile.role || '–';
  document.getElementById('pmHint').textContent = '';
  const bd = document.getElementById('pwBackdrop');
  bd.classList.add('open');
  document.getElementById('profileModal').classList.add('open');
  bd.addEventListener('click', closeProfileModal, { once:true });
}
document.getElementById('changePwBtn').addEventListener('click', openProfileModal);
document.getElementById('pmClose').addEventListener('click', closeProfileModal);
document.getElementById('pmChangePwBtn').addEventListener('click', ()=>{ closeProfileModal(); changeOwnPassword(); });

// ================= TASKS from DB (with fallback) =================
async function loadTasksFromDb(){
  TASKS = {};
  deptKeysFor(null).forEach(d => TASKS[d] = (FALLBACK_TASKS[d] ? FALLBACK_TASKS[d].map(t=>({...t})) : []));
  try{
    const { data, error } = await sb.from('tasks').select('*').eq('active', true);
    if (error) throw error;
    if (data && data.length){
      const byDept = {};
      data.forEach(t=>{
        (byDept[t.department] = byDept[t.department] || []).push({
          id: t.id, dept: t.department, warehouse: t.warehouse, label: t.name, sub: t.unit_label || '',
          unit: t.unit_label ? 'custom' : 'vehicles', unitLabel: t.unit_label || 'จำนวน',
          icon: ICON_BY_TASK_ID[t.id] || 'box',
          group: (t.task_group && String(t.task_group).trim()) || null,
          fixedQty: t.fixed_qty || null,
        });
      });
      Object.keys(byDept).forEach(d=>{ if (byDept[d].length) TASKS[d] = byDept[d]; });
    }
  }catch(e){ /* keep fallback */ }
  Object.keys(TASKS).forEach(d => TASKS[d].forEach(t => t.dept = d));
}

// ================= NAV (role-dependent, built after login) =================
function navForRole(){
  // LV1-2 (OF/SO): read-only, only their own jobs
  if (isWorker()) return [
    {id:'history', label:'งานของฉัน', icon:'chart'},
  ];
  // ADMIN + LV3+: record finished jobs
  return [
    {id:'new', label:'บันทึกงาน', icon:'bolt'},
    {id:'tasks', label:'ชนิดงาน', icon:'box'},
    {id:'manage', label:'คนงาน', icon:'users'},
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

const TAB_TITLE = { new:'บันทึกงาน', history:'ประวัติ', manage:'รายชื่อคนงาน', tasks:'ชนิดงาน' };

let historySub = 'list';
function goTab(tab){
  closeRecordModal();
  activeTab = tab; supOpenDone = false;
  if (tab==='new'){
    if (isWriter()){
      oTaskVal = null; crew = []; crewQuery = ''; crewWhTab = null; doneFieldsBuiltForTask = null;
      const whs = myWarehouses();
      oWhVal = whs.length === 1 ? whs[0] : null;
      const ds = oWhVal ? deptsForWh(oWhVal) : [];
      if (oWhVal && ds.length === 1){ oDeptVal = ds[0]; activeStep = 2; renderStep2(); }
      else { oDeptVal = null; activeStep = 1; renderStep1(); }
    }
  }
  if (tab==='history'){ historySub = 'list'; refreshJobs().then(renderHistory); }
  if (tab==='tasks') refreshDeptTasks().then(renderTaskManager);
  if (tab==='manage') refreshRoster().then(renderRosterManager);
  document.querySelectorAll('.nav-btn').forEach(b=>b.setAttribute('aria-selected', b.dataset.nav===tab));
  renderScreens();
}
function renderScreens(){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  let screenId, title, showBack=false;
  if (activeTab==='new'){
    const whPfx = oWhVal ? (oWhVal + ' · ') : '';
    // writer records a finished job: [pick warehouse + dept] -> pick task (step2) -> crew + details (step3)
    if (supOpenDone){ screenId='screen-success'; title='บันทึกงานแล้ว'; }
    else if (activeStep===1){ screenId='screen-step1'; title='บันทึกงาน'; }
    else if (activeStep===3){ screenId='screen-step3'; title=taskById(oTaskVal)?.label || 'เลือกคน'; showBack=true; }
    else { screenId='screen-step2'; title=whPfx+(oDeptVal?deptName(oDeptVal,oWhVal):'เลือกงาน'); showBack=step1HasChoice(); }
  } else if (activeTab==='history'){
    if (historySub==='matrix'){ screenId='screen-matrix'; title='ใครทำอะไรได้บ้าง'; showBack=true; }
    else { screenId='screen-history'; title = isWorker() ? 'งานของฉัน' : 'ประวัติ'; }
  } else {
    screenId = 'screen-'+activeTab;
    title = TAB_TITLE[activeTab];
  }
  document.getElementById(screenId).classList.add('active');
  document.getElementById('topbarTitle').textContent = title;
  document.getElementById('backBtn').hidden = !showBack;
  const stepNo = {'screen-step1':1,'screen-step2':2,'screen-step3':3}[screenId];
  const stepInfo = document.getElementById('stepInfo');
  const showSteps = activeTab==='new' && !!stepNo;
  stepInfo.classList.toggle('on', showSteps);
  if (showSteps){
    document.getElementById('stepLabel').textContent = 'ขั้นที่ ' + stepNo + ' จาก 3';
    stepInfo.querySelectorAll('.step-bar i').forEach((b,i)=>b.classList.toggle('on', i < stepNo));
  }
  document.getElementById('contentArea').scrollTop = 0;
}
document.getElementById('backBtn').addEventListener('click', ()=>{
  if (activeTab==='new' && activeStep>1){
    // step3 -> step2; step2 -> step1 only when step 1 offers a choice
    if (activeStep===3){ activeStep=2; renderStep2(); }
    else if (activeStep===2 && step1HasChoice()){
      activeStep=1; oDeptVal=null;
      if (myWarehouses().length>1) oWhVal=null;
      renderStep1();
    }
    renderScreens(); return;
  }
  else if (activeTab==='history' && historySub==='matrix'){ historySub='list'; renderScreens(); }
});

// ================= STEP 1 (warehouse + department pick) =================
function renderStep1(){
  const whs = myWarehouses();
  const whBox = document.getElementById('whPick');
  if (whBox){
    if (whs.length > 1){
      whBox.hidden = false;
      whBox.innerHTML = whs.map(w=>`
        <button type="button" class="wh-btn ${oWhVal===w?'on':''}" data-pick-wh="${w}">${esc(WH_PLAIN[w])}</button>`).join('');
    } else {
      whBox.hidden = true; whBox.innerHTML = '';
    }
  }
  const q = document.getElementById('step1Q');
  if (q) q.textContent = !oWhVal ? 'เลือกคลังก่อน' : 'บันทึกงานฝั่งไหน?';
  const depts = oWhVal ? deptsForWh(oWhVal) : [];
  document.getElementById('deptTiles').innerHTML = depts.map(d=>`
    <button type="button" class="tile" data-pick-dept="${esc(d)}" style="background:${esc(deptColor(d,oWhVal))}17;color:${esc(deptColor(d,oWhVal))}">
      <span class="t-icon" style="color:${esc(deptColor(d,oWhVal))};background:${esc(deptColor(d,oWhVal))}1f">${ICONS[DEPT_ICON[d]]||ICONS.box}</span>
      <span><span class="t-name">${esc(deptName(d,oWhVal))}</span>${DEPT_SUB[d] ? `<span class="t-sub">${esc(DEPT_SUB[d])}</span>` : ''}</span>
      <span class="t-chev">${ICONS.chev}</span>
    </button>`).join('') || (oWhVal ? '<div class="empty-roster-inline">คลังนี้ยังไม่มีแผนกที่คุณดูแล</div>' : '');
}
// does step 1 offer any choice? (used to decide whether "back" from step 2 goes to step 1)
function step1HasChoice(){
  if (myWarehouses().length > 1) return true;
  const w = oWhVal || myWarehouses()[0];
  return deptsForWh(w).length > 1;
}

// ================= STEP 2 =================
const DEFAULT_GROUP = 'ทั่วไป';
function renderStep2(){
  const ts = document.getElementById('taskSearch'); if (ts) ts.value = '';
  const whTxt = oWhVal ? `${WH_PLAIN[oWhVal]} · ` : '';
  document.getElementById('step2Title').textContent = `${whTxt}งานฝั่ง ${deptName(oDeptVal, oWhVal)} — เลือกงาน`;
  const whTasks = (TASKS[oDeptVal]||[]).filter(t=>taskInWh(t, oWhVal));
  const canAdd = isAdmin() || isSupervisorRole();
  const addBtn = `<button type="button" class="job-add" data-add-template>+ เพิ่มแม่แบบงาน</button>`;
  const byGroup = {};
  whTasks.forEach(t=>{ const g = t.group || DEFAULT_GROUP; (byGroup[g] = byGroup[g] || []).push(t); });
  const cmp = (a,b)=>String(a).localeCompare(String(b), 'th');
  const groupNames = Object.keys(byGroup).sort(cmp);
  const allOpen = whTasks.length <= 6;
  let n = 0;
  document.getElementById('jobChoiceList').innerHTML = whTasks.length
    ? groupNames.map(g=>{
      const items = byGroup[g].slice().sort((a,b)=>cmp(a.label, b.label));
      return `<div class="jg${allOpen?' open':''}">
        <button type="button" class="jg-head" data-toggle-group aria-expanded="${allOpen}"><span class="jg-name">${esc(g)}</span><span class="jg-count">${items.length}</span><span class="jg-chev">${ICONS.chev}</span></button>
        <div class="jg-body">${items.map(t=>`
      <button type="button" class="job-choice" data-pick-task="${esc(t.id)}">
        <span class="pill-n">${String(++n).padStart(2,'0')}</span>
        <span class="jc-body"><span class="jc-name">${esc(t.label)}</span><span class="jc-sub">${esc(t.sub||'')}</span></span>
        <span class="t-chev">${ICONS.chev}</span>
      </button>`).join('')}</div>
      </div>`;
    }).join('') + (canAdd ? addBtn : '')
    : (canAdd
      ? `<div class="empty-roster-inline job-empty"><b>ยังไม่มีแม่แบบงาน</b>${addBtn}</div>`
      : `<div class="empty-roster-inline">ยังไม่มีงานในแผนกนี้ ติดต่อหัวหน้า</div>`);
}

// ================= STEP 3 =================
function syncCrewNext(){
  const b = document.getElementById('crewNextBtn');
  if (b) b.textContent = crew.length ? `ถัดไป · เลือกแล้ว ${crew.length} คน` : 'ถัดไป';
  const h = document.getElementById('crewHint'); if (h && crew.length) h.textContent = '';
}
function openRecordModal(){
  const h = document.getElementById('crewHint');
  if (crew.length===0){ h.textContent = 'แตะเลือกคนอย่างน้อย 1 คนก่อน'; return; }
  const names = crew.map(id => (roster.find(r=>String(r.id)===String(id))||{}).name).filter(Boolean);
  document.getElementById('recordCrewText').textContent = `${names.length} คน: ${names.join(', ')}`;
  document.getElementById('openHint').textContent = '';
  document.getElementById('recordBackdrop').classList.add('open');
  document.getElementById('recordModal').classList.add('open');
}
function closeRecordModal(){
  document.getElementById('recordBackdrop').classList.remove('open');
  document.getElementById('recordModal').classList.remove('open');
}
function renderCrewList(){
  syncCrewNext();
  const box = document.getElementById('empCheckList');
  const tab = crewWhTab || oWhVal;
  const tabs = document.getElementById('crewWhTabs');
  if (tabs) tabs.innerHTML = WH_KEYS.map(w=>{
    const n = crew.filter(id=>{ const r = roster.find(x=>String(x.id)===String(id)); return r && (r.warehouse||oWhVal)===w; }).length;
    return `<button type="button" class="wh-btn ${tab===w?'on':''}" data-crew-wh="${w}" aria-pressed="${tab===w}">${esc(WH_PLAIN[w])}${w===oWhVal?'':' (มาช่วย)'}${n?` · ${n}`:''}</button>`;
  }).join('');
  const q = crewQuery.trim().toLowerCase();
  const byName = (a,b)=>String(a.name).localeCompare(String(b.name),'th');
  const inTab = r => (r.warehouse||oWhVal) === tab;
  const match = r => !q || String(r.name).toLowerCase().includes(q);
  const isHome = r => tab===oWhVal && r.department===oDeptVal;
  const home = roster.filter(r=>inTab(r) && isHome(r) && match(r)).sort(byName);
  const rest = roster.filter(r=>inTab(r) && !isHome(r) && match(r)).sort(byName);
  const item = r => `
      <button type="button" class="emp-check" data-pick-emp="${esc(r.id)}" aria-pressed="${crew.includes(String(r.id))}">
        <span class="ec-av">${esc(Array.from(String(r.name).trim())[0]||'')}</span>
        <span class="ec-text"><span class="ec-name">${esc(r.name)}</span><span class="ec-sub">${esc(r.department||'')} · ${(()=>{ const n = jobs.filter(j=>j.task_id===oTaskVal && (j.crew||[]).includes(r.name)).length; return n ? 'ทำงานนี้ '+n+' ครั้ง' : 'ยังไม่เคยทำงานนี้'; })()}</span></span>
        <span class="ec-box">${crew.includes(String(r.id)) ? ICONS.checksm : ''}</span>
      </button>`;
  let html = '';
  if (home.length) html += home.map(item).join('');
  if (rest.length) html += (home.length ? `<p class="hint" style="text-align:left;margin:14px 0 6px;">แผนกอื่น</p>` : '') + rest.map(item).join('');
  if (!html) html = `<div class="empty-roster-inline">${q ? 'ไม่พบชื่อที่ค้นหา' : 'ไม่มีรายชื่อใน'+esc(WH_PLAIN[tab]||tab)}</div>`;
  box.innerHTML = html;
}
function renderStep3(){
  const task = taskById(oTaskVal);
  document.getElementById('step3Title').textContent = task ? task.label : 'ใครทำงานนี้บ้าง?';
  renderCrewList();
  const dEl = document.getElementById('d-date');
  dEl.min = minDateISO(); dEl.max = todayISO();
  dEl.value = dEl.value || todayISO();
  document.getElementById('openSubmitBtn').textContent = 'บันทึกงาน';
  if (task && doneFieldsBuiltForTask !== oTaskVal) renderDoneFields();
}

// ================= RESULT-FIELD BUILDER =================
function buildResultFieldsHTML(task, prefix){
  // task with a fixed quantity: the number is locked, nothing to type
  if (task.fixedQty) return `<div class="field" style="margin-bottom:14px;">
      <label>${esc(task.unitLabel)}</label>
      <input id="${prefix}-unit" type="number" value="${Number(task.fixedQty)}" readonly aria-readonly="true" style="text-align:center;font-weight:700;">
      <p class="hint" style="text-align:left;">ล็อกตามที่ตั้งไว้ในชนิดงาน</p>
    </div>`;
  let fields = `<div class="field" style="margin-bottom:14px;">
      <label>${esc(task.unitLabel)}</label>
      <div class="stepper">
        <button type="button" data-step="-1" data-target="${prefix}-unit">−</button>
        <input id="${prefix}-unit" type="number" min="0" value="0" inputmode="numeric">
        <button type="button" data-step="1" data-target="${prefix}-unit">+</button>
      </div>
      <div class="qa-chips">${[5,10,20].map(n=>`<button type="button" class="chip" data-add="${n}" data-target="${prefix}-unit">+${n}</button>`).join('')}</div>
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

// Fill a <select> with the caller's departments for a given warehouse
// (departments are per-warehouse — คลังใครคลังมัน — so the dept list must
// follow whichever warehouse is currently picked, not the flat union of
// every warehouse the caller covers). Show the wrapper only when there's a
// real choice to make (multi-department, or ADMIN).
function pickedWh(selectId){
  const whs = myWarehouses();
  if (whs.length <= 1) return whs[0] || 'A';
  const sel = document.getElementById(selectId);
  return (sel && sel.value) || whs[0];
}
function fillDeptSelect(selectId, fieldId, whSelectId){
  const sel = document.getElementById(selectId);
  const field = document.getElementById(fieldId);
  if (!sel || !field) return;
  const wh = whSelectId ? pickedWh(whSelectId) : (oWhVal || myWarehouses()[0]);
  const depts = wh ? deptsForWh(wh) : visibleDepts();
  sel.innerHTML = depts.map(d=>`<option value="${d}">${esc(deptName(d, wh))}</option>`).join('');
  field.hidden = depts.length <= 1;
}
function pickedDept(selectId, whSelectId){
  const wh = whSelectId ? pickedWh(whSelectId) : (oWhVal || myWarehouses()[0]);
  const depts = wh ? deptsForWh(wh) : visibleDepts();
  if (depts.length <= 1) return depts[0] || profile.department;
  return document.getElementById(selectId).value || depts[0];
}
function fillWhSelect(selectId, fieldId){
  const sel = document.getElementById(selectId);
  const field = document.getElementById(fieldId);
  if (!sel || !field) return;
  const whs = myWarehouses();
  sel.innerHTML = whs.map(w=>`<option value="${w}">${esc(WH_PLAIN[w]||w)}</option>`).join('');
  field.hidden = whs.length <= 1;
}
// keep a warehouse <select> and its paired department <select> in sync —
// picking a different warehouse must re-populate the department list from
// that warehouse's own departments, not leave the other warehouse's options
// showing. Wired once per element (fillWhSelect only resets its innerHTML).
function wireWhDeptLink(whSelectId, deptSelectId, deptFieldId){
  const whSel = document.getElementById(whSelectId);
  if (!whSel || whSel.dataset.deptLinked) return;
  whSel.dataset.deptLinked = '1';
  whSel.addEventListener('change', ()=>fillDeptSelect(deptSelectId, deptFieldId, whSelectId));
}

// ================= SUPERVISOR role: task types =================
async function refreshDeptTasks(){
  try{
    const { data, error } = await sb.from('tasks').select('*')
      .in('department', myDepts()).order('name');
    if (error) throw error;
    deptTasks = data || [];
  }catch(e){ deptTasks = []; }
}
function renderTaskManager(){
  const box = document.getElementById('taskMgmtList');
  if (!box) return;
  if (deptTasks.length===0){ box.innerHTML = `<div class="empty-roster-inline">ยังไม่มีชนิดงานของแผนกนี้</div>`; return; }
  const multiWh = myWarehouses().length > 1;
  const groups = [], idx = {};
  deptTasks.forEach(t=>{
    const k = t.department + '|' + (multiWh ? (t.warehouse||'') : '');
    if (!(k in idx)){ idx[k] = groups.length; groups.push({ d:t.department, wh:t.warehouse, items:[] }); }
    groups[idx[k]].items.push(t);
  });
  box.innerHTML = groups.map(g=>{
    const c = deptColor(g.d, g.wh);
    return `<div class="tg">
      <div class="tg-head" style="background:${esc(c)}1f;color:${esc(c)}"><span class="tg-ico">${ICONS[DEPT_ICON[g.d]]||ICONS.box}</span>${esc(deptName(g.d, g.wh))}${multiWh ? ` · ${esc(g.wh||'–')}` : ''}<span class="tg-count">${g.items.length} ชนิดงาน</span></div>
      <div class="tg-body">${g.items.map(t=>`
        <div class="tg-row">
          <div class="tg-main"><div class="tg-name ${t.active?'':'t-inactive'}">${esc(t.name)}</div><div class="sub">หน่วย: ${esc(t.unit_label || 'จำนวน')}${t.fixed_qty ? ' · ล็อก '+esc(t.fixed_qty) : ''}</div></div>
          <button type="button" class="mini-btn ${t.active?'reject':'approve'}" data-toggle-task="${esc(t.id)}" data-next-active="${t.active?'false':'true'}">${t.active?'ปิดใช้งาน':'เปิดใช้งาน'}</button>
        </div>`).join('')}</div>
    </div>`;
  }).join('');
}
let addTaskLock = null; // {wh, dept} when opened from step 2 (locked)
let taskGroupPick = null; // chosen group name, NEW_GROUP, or null
const NEW_GROUP = '\u0000new';
const normTaskName = s => String(s||'').toLowerCase().replace(/\s+/g, '');
function taskModalScope(){
  const lock = addTaskLock;
  return {
    wh: lock ? lock.wh : pickedWh('t-wh'),
    dept: lock ? lock.dept : pickedDept('t-dept', 't-wh'),
  };
}
function taskModalScopeRows(){
  const { wh, dept } = taskModalScope();
  const seen = new Set(), rows = [];
  (TASKS[dept]||[]).filter(t=>taskInWh(t, wh)).forEach(t=>{ seen.add(t.id); rows.push({ name:t.label, group:t.group||null }); });
  deptTasks.filter(t=>t.active && t.department===dept && t.warehouse===wh && !seen.has(t.id))
    .forEach(t=>rows.push({ name:t.name, group:(t.task_group && String(t.task_group).trim()) || null }));
  return rows;
}
function chosenTaskGroup(){
  if (taskGroupPick === NEW_GROUP) return document.getElementById('t-group-new').value.trim();
  return taskGroupPick || '';
}
// returns 'dup' | 'similar' | ''
function taskNameState(){
  const nm = normTaskName(document.getElementById('t-name').value);
  if (!nm) return '';
  let state = '';
  for (const r of taskModalScopeRows()){
    const o = normTaskName(r.name);
    if (o === nm) return 'dup';
    if (o.includes(nm) || nm.includes(o)) state = 'similar';
  }
  return state;
}
function refreshTaskGroupUi(){
  const rows = taskModalScopeRows();
  const groups = [...new Set(rows.map(r=>r.group || DEFAULT_GROUP))].sort((a,b)=>a.localeCompare(b,'th'));
  if (taskGroupPick && taskGroupPick !== NEW_GROUP && !groups.includes(taskGroupPick)) taskGroupPick = null;
  document.getElementById('t-group-chips').innerHTML =
    groups.map(g=>`<button type="button" class="chip" data-task-group="${esc(g)}" aria-pressed="${taskGroupPick===g}">${esc(g)}</button>`).join('') +
    `<button type="button" class="chip" data-task-group-new aria-pressed="${taskGroupPick===NEW_GROUP}">+ กลุ่มใหม่</button>`;
  const gi = document.getElementById('t-group-new');
  gi.hidden = taskGroupPick !== NEW_GROUP;
  const st = taskNameState();
  const warn = document.getElementById('t-name-warn');
  warn.hidden = !st;
  warn.className = 'field-warn ' + (st === 'dup' ? 'is-dup' : 'is-soft');
  warn.textContent = st === 'dup' ? 'มีงานชื่อนี้แล้ว' : (st === 'similar' ? 'มีงานชื่อใกล้เคียงอยู่แล้ว ตรวจสอบก่อนเพิ่ม' : '');
  document.getElementById('taskSubmitBtn').disabled = st === 'dup';
}
let taskModalWired = false;
function wireTaskModalInputs(){
  if (taskModalWired) return;
  taskModalWired = true;
  document.getElementById('t-name').addEventListener('input', refreshTaskGroupUi);
  document.getElementById('t-wh').addEventListener('change', ()=>setTimeout(refreshTaskGroupUi, 0));
  document.getElementById('t-dept').addEventListener('change', refreshTaskGroupUi);
  document.getElementById('t-group-chips').addEventListener('click', e=>{
    const c = e.target.closest('[data-task-group], [data-task-group-new]');
    if (!c) return;
    taskGroupPick = c.hasAttribute('data-task-group-new') ? NEW_GROUP : c.dataset.taskGroup;
    refreshTaskGroupUi();
    if (taskGroupPick === NEW_GROUP) document.getElementById('t-group-new').focus();
  });
}
function openAddTaskModal(lock){
  addTaskLock = (lock && lock.wh && lock.dept) ? lock : null;
  document.getElementById('t-name').value='';
  const tu = document.getElementById('t-unit'); if (tu) tu.value='';
  const tq = document.getElementById('t-fixed'); if (tq) tq.value='';
  document.getElementById('taskHint').textContent='';
  fillWhSelect('t-wh', 't-wh-field');
  wireWhDeptLink('t-wh', 't-dept', 't-dept-field');
  fillDeptSelect('t-dept', 't-dept-field', 't-wh');
  taskGroupPick = null;
  document.getElementById('t-group-new').value = '';
  wireTaskModalInputs();
  refreshTaskGroupUi();
  const ttl = document.querySelector('#addTaskModal .modal-title');
  if (addTaskLock){
    document.getElementById('t-wh-field').hidden = true;
    document.getElementById('t-dept-field').hidden = true;
    if (ttl) ttl.textContent = `เพิ่มแม่แบบงาน · ${WH_PLAIN[addTaskLock.wh]||addTaskLock.wh} · ${deptName(addTaskLock.dept, addTaskLock.wh)}`;
  } else if (ttl) ttl.textContent = 'เพิ่มชนิดงานใหม่';
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
  const lock = addTaskLock;
  const wh = lock ? lock.wh : pickedWh('t-wh');
  const dept = lock ? lock.dept : pickedDept('t-dept', 't-wh');
  if (taskNameState() === 'dup'){ hint.textContent = 'มีงานชื่อนี้แล้ว'; return; }
  const grp = chosenTaskGroup();
  if (!grp){ hint.textContent = taskGroupPick === NEW_GROUP ? 'พิมพ์ชื่อกลุ่มใหม่ก่อน' : 'เลือกกลุ่มงานก่อน'; return; }
  const taskGroup = grp === DEFAULT_GROUP ? null : grp;
  hint.textContent = 'กำลังเพิ่ม...';
  try{
    const id = wh.toLowerCase() + '_' + dept.toLowerCase() + '_' + Date.now();
    const unitLabel = (document.getElementById('t-unit')?.value || '').trim() || null;
    const fixedRaw = (document.getElementById('t-fixed')?.value || '').trim();
    const fixedQty = fixedRaw ? Math.floor(Number(fixedRaw)) : null;
    if (fixedRaw && !(fixedQty > 0)){ hint.textContent = 'จำนวนต่อครั้งต้องเป็นเลขมากกว่า 0'; return; }
    const { error } = await sb.from('tasks').insert({ id, warehouse: wh, department: dept, name, active: true, unit_label: unitLabel, task_group: taskGroup, fixed_qty: fixedQty });
    if (error) throw error;
    hint.textContent = `เพิ่ม "${name}" แล้ว`;
    await refreshDeptTasks(); renderTaskManager();
    await loadTasksFromDb();
    if (lock){
      closeAddTaskModal();
      if (activeStep===2) renderStep2();
      toast(`เพิ่ม "${name}" แล้ว`, 'ok');
    } else setTimeout(closeAddTaskModal, 500);
  }catch(err){
    const denied = err && (err.code === '42501' || /row-level security|permission/i.test(err.message||''));
    hint.textContent = denied ? 'คุณไม่มีสิทธิ์เพิ่มงานในแผนกนี้' : 'เพิ่มไม่สำเร็จ: ' + mapDbError(err);
  }
});

// ================= RECORD A FINISHED JOB (LV3+ and ADMIN) =================
// One model: the writer records a job that is already done (date + start + end +
// result) in one go. Rows are written 'approved' straight away; the DB trigger
// is the final judge (no future dates, max 3 days back, no overlap per person).
function showRecordSuccess(task, members, date, start, end, mins){
  document.getElementById('successText').textContent = 'บันทึกงานแล้ว';
  document.getElementById('successSub').textContent = `${date} · ${start}–${end} · ${mins} นาที`;
  const names = members.map(m=>m.name);
  const card = document.getElementById('successCard');
  card.innerHTML = `<div class="sc-title">${esc(task ? task.label : '')}</div>
    <div class="sc-sub">${esc(deptName(oDeptVal, oWhVal))} · ${esc(WH_PLAIN[oWhVal]||oWhVal||'')}</div>
    <div class="sc-foot">${avatarStack(names, 32)}<span>${names.length} คน · ${esc(start)}–${esc(end)}</span></div>`;
  card.hidden = false;
  document.getElementById('successActions').hidden = false;
  supOpenDone = true; renderScreens();
}
async function recordJob(){
  const hint = document.getElementById('openHint');
  if (!oWhVal || !oDeptVal){ hint.textContent='เลือกคลังและฝั่งก่อน'; return; }
  if (crew.length===0){ hint.textContent='แตะเลือกคนอย่างน้อย 1 คนก่อน'; return; }
  const task = taskById(oTaskVal);
  if (!task){ hint.textContent='เลือกชนิดงานก่อน'; return; }
  const crewMembers = crew.map(id => roster.find(r=>String(r.id)===String(id))).filter(Boolean);
  if (crewMembers.length===0){ hint.textContent='ไม่พบรายชื่อที่เลือก ลองใหม่'; return; }
  const date = document.getElementById('d-date').value;
  const start = document.getElementById('d-start').value;
  const end = document.getElementById('d-end').value;
  if (!date){ hint.textContent='เลือกวันที่ก่อน'; return; }
  if (date > todayISO()){ hint.textContent='วันที่เป็นอนาคตไม่ได้'; return; }
  if (date < minDateISO()){ hint.textContent='บันทึกย้อนหลังได้ไม่เกิน 3 วัน'; return; }
  if (!start || !end){ hint.textContent='ใส่เวลาเริ่มและเวลาจบก่อน'; return; }
  if (end <= start){ hint.textContent='เวลาจบต้องหลังเวลาเริ่ม'; return; }
  const mins = minutesBetween(start, end);
  const unitVal = Number(document.getElementById('d-unit').value)||0;
  const details = { date, start, end, mins, qty: unitVal, crew: crewMembers.map(m=>m.name) };
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
  const groupId = (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : (Date.now() + '-' + Math.random().toString(16).slice(2));
  const nowIso = new Date().toISOString();
  const startedAt = new Date(`${date}T${start}:00+07:00`).toISOString();
  const endedAt = new Date(`${date}T${end}:00+07:00`).toISOString();
  hint.textContent = 'กำลังบันทึก...';
  try{
    // Schema stores one employee per job row: one row per crew member, shared group id + details.
    const rows = crewMembers.map(m => ({
      warehouse: oWhVal, department: oDeptVal, task_id: oTaskVal,
      employee_id: m.id, employee_name: m.name,
      created_by: currentUser.id, status: 'approved',
      approved_by: currentUser.id, approved_at: nowIso,
      job_group_id: groupId, started_at: startedAt, ended_at: endedAt,
      details,
    }));
    const { error } = await sb.from('jobs').insert(rows);
    if (error) throw error;
    hint.textContent = '';
    crew = []; oTaskVal = null; doneFieldsBuiltForTask = null; crewQuery = ''; crewWhTab = null;
    document.getElementById('d-date').value = '';
    document.getElementById('d-start').value = '';
    document.getElementById('d-end').value = '';
    await refreshJobs();
    closeRecordModal();
    showRecordSuccess(task, crewMembers, date, start, end, mins);
  }catch(err){
    hint.textContent = '';
    toast('บันทึกไม่สำเร็จ: ' + mapDbError(err));
  }
}

// ================= EVENT DELEGATION =================
document.addEventListener('click', async (e)=>{
  const navBtn = e.target.closest('[data-nav]');
  if (navBtn){ goTab(navBtn.dataset.nav); return; }

  const pickWh = e.target.closest('[data-pick-wh]');
  if (pickWh){
    oWhVal = pickWh.dataset.pickWh; oDeptVal=null; oTaskVal=null; crew=[]; crewWhTab=null;
    const ds = deptsForWh(oWhVal);
    if (ds.length === 1){ oDeptVal = ds[0]; activeStep=2; renderStep2(); }
    else { activeStep=1; renderStep1(); }
    renderScreens(); return;
  }

  const pickDept = e.target.closest('[data-pick-dept]');
  if (pickDept){ oDeptVal = pickDept.dataset.pickDept; oTaskVal=null; crew=[]; activeStep=2; renderStep2(); renderScreens(); return; }

  const pickTask = e.target.closest('[data-pick-task]');
  if (pickTask){
    oTaskVal = pickTask.dataset.pickTask; activeStep=3;
    doneFieldsBuiltForTask = null;
    renderStep3(); renderScreens(); return;
  }

  const crewWh = e.target.closest('[data-crew-wh]');
  if (crewWh){ crewWhTab = crewWh.dataset.crewWh; renderCrewList(); return; }
  const pickEmp = e.target.closest('[data-pick-emp]');
  if (pickEmp){
    const id = pickEmp.dataset.pickEmp;
    crew = crew.includes(id) ? crew.filter(n=>n!==id) : [...crew, id];
    renderCrewList();
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

  const addBtn = e.target.closest('[data-add]');
  if (addBtn){
    const input = document.getElementById(addBtn.dataset.target);
    if (input){
      input.value = (Number(input.value)||0) + Number(addBtn.dataset.add);
      input.dispatchEvent(new Event('input', {bubbles:true}));
    }
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

  if (e.target.closest('#toggleAddTaskLink')){ openAddTaskModal(); return; }
  if (e.target.closest('[data-add-template]')){
    if (isAdmin() || isSupervisorRole()) openAddTaskModal({ wh: oWhVal, dept: oDeptVal });
    return;
  }
  if (e.target.closest('#addTaskBackdrop') || e.target.closest('[data-task-close]')){ closeAddTaskModal(); return; }

  const rosterFilter = e.target.closest('[data-roster-filter]');
  if (rosterFilter){ rosterDeptFilter = rosterFilter.dataset.rosterFilter; renderRosterManager(); return; }

  const toggleTask = e.target.closest('[data-toggle-task]');
  if (toggleTask){
    const id = toggleTask.dataset.toggleTask;
    const nextActive = toggleTask.dataset.nextActive === 'true';
    try{
      await sb.from('tasks').update({ active: nextActive }).eq('id', id);
      await refreshDeptTasks(); renderTaskManager();
      await loadTasksFromDb();
    }catch(err){ toast('ทำรายการไม่สำเร็จ: ' + mapDbError(err)); }
    return;
  }
});

document.getElementById('openSubmitBtn').addEventListener('click', recordJob);
document.getElementById('crewNextBtn').addEventListener('click', openRecordModal);
document.getElementById('recordBackBtn').addEventListener('click', closeRecordModal);
document.getElementById('recordBackdrop').addEventListener('click', closeRecordModal);

function mapDbError(err){
  if (!err) return 'unknown error';
  if (err.code === '42501' || /row-level security/i.test(err.message||'')) return 'ไม่มีสิทธิ์บันทึกข้อมูลของแผนกนี้';
  if (err.code === '23505') return 'ข้อมูลซ้ำกับที่มีอยู่แล้ว';
  if (err.code === '23503' || /foreign key/i.test(err.message||'')) return 'ชนิดงานนี้ยังไม่มีในระบบ ไปเพิ่มที่แถบ "ชนิดงาน" ก่อน';
  return err.message || err.code || 'unknown error';
}

// ================= EMPLOYEE ROSTER =================
function weekCount(name){
  const since = new Date(nowBkk().getTime() - 6*864e5).toLocaleDateString('sv-SE');
  return jobs.filter(j=>(j.crew||[]).includes(name) && j.details && j.details.date >= since).length;
}
function renderRosterManager(){
  const depts = visibleDepts();
  if (rosterDeptFilter !== 'all' && !depts.includes(rosterDeptFilter)) rosterDeptFilter = 'all';
  document.getElementById('rosterChips').innerHTML = [['all','ทั้งหมด'], ...depts.map(d=>[d, deptName(d)])]
    .map(([v,l])=>`<button type="button" class="chip" data-roster-filter="${esc(v)}" aria-pressed="${rosterDeptFilter===v}">${esc(l)}</button>`).join('');
  renderRosterList();
}
function renderRosterList(){
  const cols = document.getElementById('rosterCols');
  const multiWh = myWarehouses().length > 1;
  const q = rosterQuery.trim().toLowerCase();
  const list = roster
    .filter(r=>visibleDepts().includes(r.department) && inWh(r.warehouse)
      && (rosterDeptFilter==='all' || r.department===rosterDeptFilter)
      && (!q || String(r.name).toLowerCase().includes(q)))
    .sort((a,b)=>a.name.localeCompare(b.name,'th'));
  cols.innerHTML = list.length===0
    ? `<p class="empty-roster">ไม่พบพนักงาน</p>`
    : list.map(r=>{
        const c = deptColor(r.department, r.warehouse);
        return `<div class="roster-row">
          ${avatarHTML(r.name, 40)}
          <div class="rr-main"><div class="rr-name">${multiWh ? `<span class="wh-tag">${esc(r.warehouse||'–')}</span>` : ''}${esc(r.name)}</div><div class="sub">งานสัปดาห์นี้ ${weekCount(r.name)}</div></div>
          <span class="dtag" style="color:${esc(c)};background:${esc(c)}1f">${esc(deptName(r.department, r.warehouse))}</span>
          <button type="button" class="icon-btn" data-roster-del="${esc(r.id)}" aria-label="ลบ ${esc(r.name)}">${ICONS.x}</button>
        </div>`;
      }).join('');
}

function openAddEmpModal(){
  document.getElementById('r-name').value='';
  document.getElementById('rosterHint').textContent='';
  fillWhSelect('r-wh', 'r-wh-field');
  wireWhDeptLink('r-wh', 'r-dept', 'r-dept-field');
  fillDeptSelect('r-dept', 'r-dept-field', 'r-wh');
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
  const wh = pickedWh('r-wh');
  const dept = isAdmin() ? pickedDept('r-dept', 'r-wh') : (pickedDept('r-dept', 'r-wh') || myDepts()[0]);
  if (roster.some(r=>r.name===name && r.department===dept && r.warehouse===wh)){ hint.textContent = `"${name}" มีอยู่ในรายชื่อแล้ว`; return; }
  hint.textContent = 'กำลังเพิ่ม...';
  try{
    const { error } = await sb.from('employees').insert({ name, department: dept, warehouse: wh });
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
  if (task.unit==='containers') return `${num(details.containers) || num(details.qty)} ตู้ / ${num(details.vehicles) || (num(details.containers)*(task.vehiclesPerContainer||56))} คัน`;
  let s = `${num(details.qty)} ${task.unit==='custom' ? task.unitLabel : unitShort(task.unit)}`;
  if (task.hasIssue && details.hasIssue) s += ` · มีปัญหา ${num(details.issueCount)} คัน`;
  return s;
}

// Group raw job rows (one per employee) back into a single logical entry per submission.
function groupJobs(rows){
  const map = new Map();
  rows.forEach(r=>{
    const key = r.job_group_id
      ? 'g:'+r.job_group_id
      : [r.department, r.task_id, (r.details&&r.details.date)||'', (r.details&&r.details.start)||'', r.created_at.slice(0,16)].join('|');
    if (!map.has(key)) map.set(key, { ...r, crewNames: new Set() });
    const g = map.get(key);
    if (r.employee_name) g.crewNames.add(r.employee_name);
  });
  return [...map.values()].map(g=>({...g, crew: (g.details && g.details.crew && g.details.crew.length) ? g.details.crew : [...g.crewNames]}));
}

// ================= SKILL MATRIX =================
function renderMatrix(){
  const scopedJobs = scopedJobList();
  const rosterScoped = roster.filter(r=>inScope(r.department) && inWh(r.warehouse));
  const tasksScoped = ALL_TASKS().filter(t=>inScope(t.dept) && (t.warehouse==null || inWh(t.warehouse)));
  const rosterNames = rosterScoped.map(r=>r.name);
  const logNames = scopedJobs.flatMap(j=>j.crew||[]);
  const emps = [...new Set([...rosterNames, ...logNames])].sort((a,b)=>a.localeCompare(b,'th'));
  const wrap = document.getElementById('matrixWrap');
  if (emps.length===0){ wrap.innerHTML = `<p class="empty-roster">ยังไม่มีข้อมูล</p>`; return; }

  const lvl = n => n<=0 ? 'h0' : n<=5 ? 'h1' : n<=20 ? 'h2' : n<=50 ? 'h3' : 'h4';
  const data = emps.map(emp=>({
    emp,
    rows: tasksScoped.map(t=>({ t, n: scopedJobs.filter(j=>j.task_id===t.id && (j.crew||[]).includes(emp)).length })),
  }));
  const heat = tasksScoped.length===0 ? '' : `
    <div class="card-box">
      <div class="leg"><span><i class="h0"></i>ยังไม่เคย</span><span><i class="h1"></i>1–5</span><span><i class="h2"></i>6–20</span><span><i class="h3"></i>21–50</span><span><i class="h4"></i>50+</span></div>
      <div class="hm-scroll"><div class="hm" style="grid-template-columns:84px repeat(${tasksScoped.length},44px)">
        <span></span>${tasksScoped.map(t=>`<span class="hm-col" title="${esc(t.label)}"><span>${esc(t.label)}</span></span>`).join('')}
        ${data.map(d=>`<span class="hm-name">${esc(d.emp)}</span>${d.rows.map(r=>`<div class="${lvl(r.n)}">${r.n||'–'}</div>`).join('')}`).join('')}
      </div></div>
    </div>`;

  wrap.innerHTML = heat + data.map(({emp, rows})=>{
    const total = rows.reduce((s,r)=>s+r.n,0);
    const able = rows.filter(r=>r.n>0).length;
    const isOpen = openMatrixEmp===emp;
    const rowsHtml = rows.map(({t,n})=>`
      <div class="skill-bar">
        <span>${esc(t.label)}</span>
        <div class="tbar"><i style="width:${n>0 ? Math.max(4, Math.min(100, Math.round(n/50*100))) : 0}%"></i></div>
        <b>${n||'–'}</b>
      </div>`).join('');
    return `
    <div class="matrix-emp ${isOpen?'open':''}">
      <div class="matrix-emp-head" data-matrix-emp="${esc(emp)}">
        ${avatarHTML(emp, 36)}
        <div class="mh-main"><div class="name">${esc(emp)}</div><div class="total">ทำได้ ${able} จาก ${rows.length} งาน · ${num(total)} ครั้ง</div></div>
        <span class="chev">${ICONS.chev}</span>
      </div>
      <div class="matrix-emp-body">${rowsHtml}</div>
    </div>`;
  }).join('');
}

// ================= HISTORY LIST =================
function renderHistory(){
  document.getElementById('dateFilterChips').style.display = '';
  // LV1-2 are read-only: just their own jobs (RLS already limits rows), no matrix / people filter
  const ro = isWorker();
  ['openMatrixBtn','toggleMoreFiltersLink'].forEach(id=>{ const el = document.getElementById(id); if (el) el.style.display = ro ? 'none' : ''; });
  if (ro) document.getElementById('moreFiltersPanel').hidden = true;
  const scopedJobs = scopedJobList();
  const rosterScoped = roster.filter(r=>inScope(r.department) && inWh(r.warehouse));
  const rosterNames = rosterScoped.map(r=>r.name);
  const logNames = scopedJobs.flatMap(j=>j.crew||[]);
  const emps = [...new Set([...rosterNames, ...logNames])].sort((a,b)=>a.localeCompare(b,'th'));
  const ef = document.getElementById('empFilter');
  const prevVal = ef.value;
  ef.innerHTML = '<option value="">พนักงานทั้งหมด</option>' + emps.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
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
  const sum = document.getElementById('histSummary');
  if (ro && filtered.length){
    const mins = filtered.reduce((s,j)=>s + (Number(j.details && j.details.mins)||0), 0);
    sum.innerHTML = `<div class="stat-card"><div class="n num">${filtered.length}</div><div class="l">จำนวนงาน</div></div>
      <div class="stat-card"><div class="n num">${(mins/60).toFixed(1)}</div><div class="l">ชั่วโมงรวม</div></div>`;
    sum.style.display = '';
  } else { sum.innerHTML = ''; sum.style.display = 'none'; }
  if (filtered.length===0){ list.innerHTML=''; empty.hidden=false; return; }
  empty.hidden=true;
  list.innerHTML = filtered.map(j=>{
    const task = taskById(j.task_id);
    const d = j.details || {};
    const issueBadge = (task && task.hasIssue && d.hasIssue) ? `<span class="badge issue">มีปัญหา</span>` : '';
    return `
    <div class="hist-card">
      <div class="hist-top">
        <div>
          <div class="hist-task">${task ? esc(task.label) : esc(j.task_id)}</div>
          <div class="hist-time">${ICONS.clock}${esc(d.start||'')}–${esc(d.end||'–')} · ${d.mins == null ? '–' : num(d.mins)} นาที</div>
        </div>
      </div>
      <div class="hist-foot">
        <span class="crew-av">${avatarStack(j.crew||[], 26)}<span class="hist-crew">${esc((j.crew||[]).join(', '))}</span></span>
        <span class="hist-result">${esc(formatResult(d, task))}</span>
      </div>
      <div class="hist-tags">
        <span class="wh-tag">${esc(WH_PLAIN[j.warehouse]||j.warehouse||'–')}</span>
        ${deptBadge(j.department, j.warehouse)}
        <span class="hist-crew">${esc(d.date)}</span>
        ${issueBadge}
      </div>
    </div>`;
  }).join('');
}

// ================= MASTER RENDER =================
function render(){
  const scopedJobs = scopedJobList();
  const rosterScoped = roster.filter(r=>inScope(r.department) && inWh(r.warehouse));
  document.getElementById('statRow').innerHTML = `
    <div class="stat-card"><div class="n num">${rosterScoped.length}</div><div class="l">คนงาน</div></div>
    <div class="stat-card"><div class="n num">${scopedJobs.length}</div><div class="l">เสร็จแล้ว</div></div>
    <div class="stat-card"><div class="n num">${scopedJobs.filter(j=>j.details && j.details.date===todayISO()).length}</div><div class="l">วันนี้</div></div>
  `;
  renderMatrix();
  renderHistory();
  renderRosterManager();
  if (activeTab==='new' && isWriter() && activeStep===3 && !supOpenDone) renderStep3();
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
    .on('postgres_changes', {event:'*', schema:'public', table:'staff_scope'}, () => loadMyScope().then(()=>{ buildNav(); refreshRoleBadge(); render(); }))
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
    if (event === 'PASSWORD_RECOVERY'){
      askNewPassword(async (pw)=>{
        const { error } = await sb.auth.updateUser({ password: pw });
        if (error) return error.message || String(error);
        toast('ตั้งรหัสผ่านใหม่แล้ว', 'ok');
        return null;
      });
    }
  });
})();

// ===== UI-only wiring: search boxes, success buttons, profile logout =====
document.getElementById('taskSearch').addEventListener('input', e=>{
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#jobChoiceList .jg').forEach(g=>{
    let any = false;
    g.querySelectorAll('.job-choice').forEach(b=>{
      const hit = !q || b.textContent.toLowerCase().includes(q);
      b.hidden = !hit; if (hit) any = true;
    });
    g.hidden = !any;
    g.classList.toggle('jg-searching', !!q);
  });
});
document.getElementById('jobChoiceList').addEventListener('click', e=>{
  const h = e.target.closest('[data-toggle-group]');
  if (!h) return;
  const g = h.closest('.jg');
  const open = g.classList.toggle('open');
  h.setAttribute('aria-expanded', String(open));
});
document.getElementById('rosterSearch').addEventListener('input', e=>{ rosterQuery = e.target.value; renderRosterList(); });
document.getElementById('successGoOpenBtn').addEventListener('click', ()=> goTab('history'));
document.getElementById('empSearch').addEventListener('input', e=>{ crewQuery = e.target.value; renderCrewList(); });
document.getElementById('successNewBtn').addEventListener('click', ()=> goTab('new'));
document.getElementById('pmLogoutBtn').addEventListener('click', ()=>{ closeProfileModal(); logout(); });
