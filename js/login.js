// Dedicated login page (auth/login). Signs in, then routes to /erp or /app by account + device.
const LOGIN_MSGS = {
  notfound:   'ไม่พบข้อมูลผู้ใช้งานนี้ในระบบ กรุณาติดต่อผู้ดูแลระบบ',
  inactive:   'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
  noposition: 'บัญชีนี้ยังไม่มีตำแหน่ง กรุณาติดต่อผู้ดูแลระบบ',
  noaccess:   'บัญชีนี้ไม่มีสิทธิ์ใช้ Skill Matrix'
};
const hintEl = document.getElementById('loginHint');

function mapAuthError(err){
  const msg = (err && err.message) || '';
  if (/invalid login credentials/i.test(msg)) return 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง';
  if (/email not confirmed/i.test(msg)) return 'บัญชียังไม่ได้เปิดใช้งาน — ติดต่อแอดมิน';
  return 'เข้าสู่ระบบไม่สำเร็จ: ' + (msg || 'unknown error');
}

function allowedApps(p, lv){
  if (p && Array.isArray(p.apps) && p.apps.length) return p.apps;
  if (!p) return [];
  if (p.role === 'ADMIN') return ['erp','mobile'];
  if (lv >= 3) return ['erp','mobile'];
  return ['mobile'];
}

async function failOut(code){
  try { await sb.auth.signOut(); } catch (e) {}
  hintEl.textContent = LOGIN_MSGS[code] || '';
}

// Routes away on success; on a blocked account shows the message and signs out.
async function routeAfterLogin(user){
  const { data: profile, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (error || !profile){ await failOut('notfound'); return; }
  if (profile.active === false){ await failOut('inactive'); return; }
  let lv = 0;
  try{
    const { data } = await sb.from('positions').select('id,lv');
    const pos = (data || []).find(r => r.id === profile.position_id);
    lv = (pos && pos.lv) || 0;
  }catch(e){ lv = 0; }
  if (profile.role !== 'ADMIN' && lv === 0){ await failOut('noposition'); return; }
  const apps = allowedApps(profile, lv);
  const canErp = apps.includes('erp'), canMobile = apps.includes('mobile');
  if (!canErp && !canMobile){ await failOut('noaccess'); return; }
  const isPhone = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent) || window.innerWidth < 768;
  const target = isPhone ? (canMobile ? 'mobile' : 'erp') : (canErp ? 'erp' : 'mobile');
  try { sessionStorage.setItem('gw-app', target); } catch (e) {}
  location.replace(target === 'erp' ? '../erp' : '../app');
}

document.getElementById('loginSubmitBtn').addEventListener('click', async ()=>{
  const rawCode = document.getElementById('loginCode').value;
  const pass = document.getElementById('loginPass').value;
  if (!rawCode.trim() || !pass){ hintEl.textContent = 'กรอกรหัสพนักงานและรหัสผ่านให้ครบ'; return; }
  const email = empCodeToEmail(rawCode);
  if (!email){ hintEl.textContent = 'รูปแบบรหัสพนักงานไม่ถูกต้อง (ตัวอักษร/ตัวเลข/ขีด 3-20 ตัว)'; return; }
  hintEl.textContent = 'กำลังเข้าสู่ระบบ...';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error){ hintEl.textContent = mapAuthError(error); return; }
  hintEl.textContent = '';
  await routeAfterLogin(data.user);
});
document.getElementById('loginCode').addEventListener('keydown', e=>{ if (e.key==='Enter') document.getElementById('loginPass').focus(); });
document.getElementById('loginPass').addEventListener('keydown', e=>{ if (e.key==='Enter') document.getElementById('loginSubmitBtn').click(); });

(async () => {
  const q = /[?&]e=([a-z]+)/.exec(location.search);
  if (q && LOGIN_MSGS[q[1]]){
    // bounced back from an app: show why, do not auto-route
    hintEl.textContent = LOGIN_MSGS[q[1]];
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user) await routeAfterLogin(session.user);
})();
