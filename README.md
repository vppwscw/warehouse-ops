# Warehouse Ops — production build

ระบบบันทึกงานคลัง 2 ส่วน ต่อฐานข้อมูลจริงบน Supabase (Postgres + Auth + Realtime + RLS) รองรับ 4 สิทธิ์ผู้ใช้งาน พร้อม workflow ขออนุมัติงาน

- `index.html` — แอปมือถือ สำหรับ **SUPERVISOR** (อนุมัติงาน + จัดการชนิดงาน) และ **USER** (เปิด/ปิดงานของตัวเอง) — ADMIN ใช้ได้เช่นกันในโหมดเดิม (เลือกแผนก/งาน/ทีม) สำหรับทดสอบหรือแทรกแซง
- `admin.html` — เว็บ ERP dashboard สำหรับ **ADMIN** (คุมทุกอย่าง รวมถึงอนุมัติงานและตั้งรหัสพนักงาน) และ **ASSISTANT** (ดูได้ทุกแผนก แก้ไขไม่ได้)
- `css/` — สไตล์แยกตามหน้า (`mobile.css`, `admin.css`)
- `js/` — โค้ดแยกตามหน้า (`mobile.js`, `admin.js`) + `supabase-config.js` (ค่าเชื่อมต่อ Supabase ที่ใช้ร่วมกัน)

## ใช้งานจริง (production URL)

เปิดผ่าน GitHub Pages ได้เลย ไม่ต้องรันเครื่องตัวเอง:

- มือถือ (SUPERVISOR/USER): https://vppwscw.github.io/warehouse-ops/index.html
- ERP (ADMIN/ASSISTANT): https://vppwscw.github.io/warehouse-ops/admin.html

> ไฟล์ CSS/JS มี query string `?v=N` ต่อท้าย (cache-busting) — ทุกครั้งที่แก้ `mobile.js`/`mobile.css`/`admin.js`/`admin.css` ต้องเพิ่มเลข `v` ในไฟล์ HTML ที่ import ด้วย ไม่งั้น browser จะใช้ไฟล์แคชเก่า

## รันดูบนเครื่องตัวเอง (local preview)

ต้องรันผ่าน local server เท่านั้น (เปิดไฟล์ตรงๆ แบบ double-click จะโหลด css/js ไม่ขึ้น เพราะ path เป็น relative):

```
cd D:\SKILL\warehouse-ops-site
python -m http.server 8000
```
แล้วเปิดเบราว์เซอร์ไปที่ `http://localhost:8000/index.html` หรือ `http://localhost:8000/admin.html`

ถ้าไม่มี Python ใช้ Node.js แทนได้:
```
npx serve -l 8000
```

## ระบบสิทธิ์ผู้ใช้งาน (4 role)

| Role | ใช้หน้าไหน | ทำอะไรได้ |
|---|---|---|
| **ADMIN** | `admin.html` + `index.html` (โหมดเดิม) | คุมทุกแผนก อนุมัติ/ไม่อนุมัติงาน ตั้งรหัสพนักงาน |
| **ASSISTANT** | `admin.html` | ดูข้อมูลทุกแผนกอย่างเดียว แก้ไขอะไรไม่ได้เลย |
| **SUPERVISOR** | `index.html` (แท็บ อนุมัติงาน / ชนิดงาน / ประวัติ) | เพิ่ม/ปิดใช้งานชนิดงานของแผนกตัวเอง + อนุมัติงานที่ลูกทีมส่งมา |
| **USER** | `index.html` (แท็บ งานของฉัน / ประวัติ) | เปิดงาน (บันทึกเวลาเริ่ม) → ทำงาน → ปิดงาน (บันทึกเวลาจบ+จำนวน) ของตัวเองเท่านั้น กันปลอมแปลงชื่อคนอื่น |

**Workflow อนุมัติงาน**: ทุกงานที่ USER ปิด จะเข้าสถานะ `pending` ก่อน ต้องรอ SUPERVISOR (แผนกตัวเอง) หรือ ADMIN (ทุกแผนก) กดอนุมัติ/ไม่อนุมัติ ถึงจะกลายเป็น `approved`/`rejected`

## บัญชีทดสอบ (Supabase Auth)

| อีเมล | รหัสผ่าน | สิทธิ์ | แผนก |
|---|---|---|---|
| admin.test@warehouse-ops.local | Wh0use-Test-2026! | ADMIN | ทุกแผนก |
| supervisor.test@warehouse-ops.local | Wh0use-Test-2026! | SUPERVISOR | OUT |
| user.test@warehouse-ops.local | Wh0use-Test-2026! | USER | OUT |

> `assistant.test@warehouse-ops.local` เคยสร้างไว้ทดสอบ ASSISTANT (2026-09-04) แล้วลบแถว `profiles` ทิ้ง — ตอนนี้ login ไม่ผ่าน (ขึ้น "ไม่พบข้อมูลผู้ใช้งานนี้ในระบบ"). auth user ยังค้างอยู่ใน `auth.users` (Management API ล่มตอนนั้น ลบผ่าน dashboard ไม่ได้) — ลบให้หมดทีหลังที่ Authentication → Users หรือ `delete from auth.users where email = 'assistant.test@warehouse-ops.local'`

> รหัสผ่านนี้เป็นบัญชีทดสอบเท่านั้น แนะนำให้เปลี่ยน/ลบก่อนใช้งานจริงกับทีม แล้วสร้างบัญชีจริงของแต่ละคนแทน (สร้าง auth user ที่ Supabase Auth dashboard แล้ว insert แถวคู่กันใน `profiles` — ดูโครงสร้างด้านล่าง)

### วิธีสร้างบัญชีใหม่

**วิธีปกติ — จากหน้า admin.html (ต้อง deploy Edge Function ก่อน ดู "การจัดการผู้ใช้งาน" ด้านล่าง):**
ADMIN → แท็บ "ผู้ใช้งานระบบ" → **＋ เพิ่มผู้ใช้ใหม่** → กรอกอีเมล / ชื่อ / รหัสผ่านชั่วคราว / สิทธิ์ / แผนก → สร้างบัญชี. ระบบสร้าง auth user (ยืนยันอีเมลให้อัตโนมัติ) + แถว `profiles` ให้พร้อมกัน. ผู้ใช้ login ด้วยรหัสชั่วคราวแล้วเปลี่ยนเองทีหลัง

**วิธี manual (2 ขั้น) — ถ้ายังไม่ได้ deploy Edge Function:**

1. **Supabase dashboard → Authentication → Users → Add user** — กรอกอีเมล/รหัสผ่าน ติ๊ก **Auto Confirm User**
2. **SQL Editor** — insert แถว `profiles` คู่กัน:
   ```sql
   insert into public.profiles (id, full_name, role, department)
   select u.id, 'ชื่อ นามสกุล', 'USER'::user_role, 'OUT'
   from auth.users u
   where u.email = 'someone@warehouse-ops.local'
   on conflict (id) do update
     set full_name = excluded.full_name, role = excluded.role, department = excluded.department;
   ```
   (`department` = `null` สำหรับ ADMIN/ASSISTANT)

> **ถ้า Management API ล่ม** (ปุ่ม Add user ใช้ไม่ได้) สร้าง auth user ตรงด้วย SQL ได้ แต่ต้อง set คอลัมน์ varchar token/change ให้เป็น `''` ไม่งั้น GoTrue login ฟ้อง `"Database error querying schema"` 500 — บัญชี `assistant.test` ถูกสร้างแบบนี้เมื่อ 2026-09-04:
> ```sql
> -- หลัง insert auth.users + auth.identities เอง
> update auth.users set
>   confirmation_token = coalesce(confirmation_token, ''),
>   recovery_token = coalesce(recovery_token, ''),
>   email_change_token_new = coalesce(email_change_token_new, ''),
>   email_change = coalesce(email_change, ''),
>   email_change_token_current = coalesce(email_change_token_current, ''),
>   phone_change = coalesce(phone_change, ''),
>   phone_change_token = coalesce(phone_change_token, ''),
>   reauthentication_token = coalesce(reauthentication_token, '')
> where email = 'assistant.test@warehouse-ops.local';
> ```

## Supabase project

- Project ref: `dkudeyxccztrfngqfthj`
- Region: Southeast Asia (Singapore)
- Dashboard: https://supabase.com/dashboard/project/dkudeyxccztrfngqfthj
- Publishable (anon) key ฝังอยู่ใน `js/supabase-config.js` — ปลอดภัยที่จะฝังในโค้ดฝั่ง client เพราะสิทธิ์จริงถูกคุมด้วย Row Level Security (RLS) ทั้งหมด ไม่ใช่คีย์นี้
- **ห้าม**ฝัง secret key / service_role key ในไฟล์ฝั่งหน้าเว็บเด็ดขาด

## โครงสร้างฐานข้อมูล

ตาราง (schema `public`), เปิด RLS ทุกตาราง, grant SELECT/INSERT/UPDATE/DELETE ให้ role `authenticated`:

- `profiles` — บัญชีผู้ใช้ (1:1 กับ `auth.users`)
  - `full_name`, `department` (enum `department`: INB/OUT/INV, ว่างสำหรับ ADMIN/ASSISTANT)
  - `role` (enum `user_role`: ADMIN / ASSISTANT / SUPERVISOR / USER)
  - `employee_code` — รหัสพนักงาน ตั้งเองได้จากหน้า admin.html → ผู้ใช้งานระบบ (ใช้แยกคนตอนอนุมัติงาน กันชื่อซ้ำ)
  - `active` (boolean, default `true`) — soft delete. `false` = login ไม่ได้ (แอปเช็คใน `afterLogin`) แต่ข้อมูลงานที่เคยทำยังอยู่ครบ
- `employees` — รายชื่อพนักงานแบบ roster เก่า (ยังใช้โดย ADMIN ในโหมดเดิมของ index.html)
- `tasks` — ชนิดงานที่ทำได้ต่อแผนก (`id` text, `department`, `name`, `active`) — SUPERVISOR เพิ่ม/ปิดใช้งานได้เฉพาะแผนกตัวเอง
- `jobs` — งานที่บันทึก
  - `department`, `task_id`, `employee_id`/`employee_name` (ทางเก่า), `created_by` (uuid → คนเปิดงานตัวจริง), `details` (jsonb: date/start/end/mins/qty ฯลฯ)
  - `status` (`open` เปิดค้างอยู่ → `pending` ปิดแล้วรออนุมัติ → `approved`/`rejected`)
  - `started_at`, `ended_at`, `approved_by`, `approved_at`

Helper functions (SQL, `SECURITY DEFINER`): `is_admin()`, `is_assistant()`, `is_supervisor()`, `is_worker()`, `my_department()`

กติกา RLS หลัก:
- `profiles` — เห็นตัวเอง เสมอ; ADMIN/ASSISTANT เห็นทุกคน; SUPERVISOR เห็นคนในแผนกตัวเอง (เอาไว้โชว์ `employee_code` ตอนอนุมัติ)
- `profiles` update — policy `profiles_update` = `((id = auth.uid()) OR is_admin())` (ใครก็แก้แถวตัวเองได้). **กัน privilege escalation ด้วย trigger** `trg_prevent_profile_privilege_change` (BEFORE UPDATE) → `raise exception` ถ้าจะเปลี่ยน `role` / `department` / `employee_code` / `active` โดยไม่ใช่ ADMIN (แก้ `full_name` ตัวเองยังได้; `service_role` ผ่านได้ สำหรับ Edge Function). เพิ่มเมื่อ 2026-09-04 หลังพบว่า USER/SUPERVISOR/ASSISTANT ยิง `update profiles set role='ADMIN'` แถวตัวเองแล้วกลายเป็น ADMIN ได้
- `tasks`/`jobs`/`employees` — เห็น/แก้ได้เฉพาะแผนกตัวเอง ยกเว้น ADMIN/ASSISTANT เห็นทุกแผนก (ASSISTANT อ่านอย่างเดียว)
- `jobs` insert — เฉพาะ USER เปิดงานของตัวเอง (`created_by = auth.uid()`) หรือ ADMIN
- `jobs` update — เจ้าของงานเอง (ตอน `status='open'` เท่านั้น) หรือ SUPERVISOR/ADMIN (อนุมัติ/ไม่อนุมัติ)

> SQL ที่ต้องรันบน Supabase (ไม่ auto-migrate — repo เป็น static site) เก็บไว้ที่ [`sql/`](sql/):
> - `sql/2026-09-04-user-management.sql` — เพิ่มคอลัมน์ `active` + trigger `trg_prevent_profile_privilege_change` เวอร์ชันล่าสุด (กัน `role`/`department`/`employee_code`/`active` + ยอมให้ `service_role` ผ่าน)
>
> รันไฟล์นี้ **ก่อน** deploy เว็บเวอร์ชันที่มีระบบจัดการผู้ใช้

## การจัดการผู้ใช้งาน (ADMIN)

ADMIN สร้าง/แก้สิทธิ์/ปิดใช้งานบัญชีได้จาก **admin.html → แท็บ "ผู้ใช้งานระบบ"**:

- **＋ เพิ่มผู้ใช้ใหม่** — กรอกอีเมล / ชื่อ / รหัสผ่านชั่วคราว / สิทธิ์ / แผนก → เรียก Edge Function `admin-users` (`action: create`)
- **แก้ราย row** — เปลี่ยน role / แผนก / รหัสพนักงาน แล้วกด "บันทึก" (เขียน `profiles` ตรงด้วย JWT ของ ADMIN — trigger ยอมให้ `is_admin()` ผ่าน)
- **รีเซ็ตรหัส** — ปุ่มราย row → กรอกรหัสชั่วคราวใหม่ → Edge Function `admin-users` (`action: set-password` → `auth.admin.updateUserById`). แจ้งรหัสให้เจ้าตัวแล้วให้เปลี่ยนเอง

**ผู้ใช้ทุกคนเปลี่ยนรหัสผ่านของตัวเองได้** — ปุ่ม "เปลี่ยนรหัสผ่าน" (admin.html ข้างปุ่มออกจากระบบ) หรือไอคอนกุญแจบน topbar (index.html) → กรอกรหัสใหม่ 2 ครั้ง → `sb.auth.updateUser({password})` ด้วย session ตัวเอง (ไม่ผ่าน Edge Function). ใช้หลังได้รหัสชั่วคราวจาก ADMIN
- **ปิดใช้งาน / เปิดใช้งาน** — soft delete (`profiles.active`). บัญชีที่ปิดจะ login ไม่ได้ แต่ประวัติงานยังอยู่. ลบถาวรทำที่ Supabase dashboard เท่านั้น
- ปิดใช้งาน/เปลี่ยนสิทธิ์บัญชี **ตัวเอง** ไม่ได้ (กัน ADMIN ล็อกตัวเองออก)

**ทำไมต้องมี Edge Function:** การสร้าง/ลบ auth user ต้องใช้ `service_role` key ซึ่งห้ามฝังในหน้าเว็บ. Edge Function `admin-users` ถือ key ฝั่ง server, ตรวจว่าคนเรียกเป็น ADMIN ที่ active อยู่ก่อนทำงาน

**Deploy Edge Function:** Supabase dashboard → Edge Functions → Deploy a new function ชื่อ `admin-users` → paste เนื้อหา [`supabase/functions/admin-users/index.ts`](supabase/functions/admin-users/index.ts) → Deploy. Secret (`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`) Supabase ใส่ให้อัตโนมัติ ไม่ต้องตั้งเอง. ที่ **Settings → Verify JWT** ปิดไว้ (ฟังก์ชันเช็ค ADMIN เอง + ต้องให้ CORS preflight ผ่าน)

> ฟังก์ชันใช้ `service_role` **เฉพาะ** ฝั่ง `auth.users` (สร้าง auth user). แถว `profiles` เขียนด้วย JWT ของ ADMIN ที่เรียกมา (role `authenticated` มีสิทธิ์ INSERT + RLS เช็ค `is_admin()`) — project นี้ grant DML ให้แค่ `authenticated` ไม่ได้ให้ `service_role` เลยต้องเขียนวิธีนี้

Deploy แล้ว verify: 2026-09-04 — สร้างบัญชีผ่านฟอร์มได้จริง, บัญชีใหม่ login ด้วยรหัสชั่วคราวได้, non-ADMIN เรียก → 403, อีเมลซ้ำ → 400 + ไม่มี orphan

> Trigger เวอร์ชันก่อนหน้า (ยังไม่มี `active` / service_role bypass) เพิ่มเมื่อ 2026-09-04 — ดู `sql/2026-09-04-user-management.sql` สำหรับเวอร์ชันปัจจุบันที่ต้องใช้

## สถานะโปรเจกต์ (อัปเดตล่าสุด)

- [x] สร้าง Supabase project + schema + RLS policy ครบ
- [x] เปลี่ยนระบบ login จากรหัสรวมต่อแผนก → บัญชีรายคนผ่าน Supabase Auth
- [x] เขียนแอป production (index.html/admin.html) ต่อ Supabase จริง แยก HTML/CSS/JS เป็นชั้นๆ
- [x] อัปโหลดขึ้น GitHub repo `vppwscw/warehouse-ops` + เปิด GitHub Pages ใช้งานจริง
- [x] แก้บั๊กจากการทดสอบรอบแรก (RLS grant, login screen ค้าง, checkbox ไม่ติ๊ก, session ไม่ persist, ประวัติไม่ refresh)
- [x] สร้างระบบ 4 role (ADMIN/ASSISTANT/SUPERVISOR/USER) + workflow ขออนุมัติงาน (`jobs.status`)
- [x] admin.html: ASSISTANT login ได้ (read-only) + ADMIN อนุมัติ/ไม่อนุมัติงานได้
- [x] index.html: USER เปิด/ปิดงานของตัวเองรายคน (กันปลอมแปลงชื่อ) + SUPERVISOR อนุมัติงาน/จัดการชนิดงาน
- [x] เพิ่ม `employee_code` ให้ ADMIN ตั้งรหัสพนักงานเอง โชว์ในการ์ดอนุมัติกันชื่อซ้ำ
- [x] ทดสอบ end-to-end ทุก flow ครบ 4 role บน production ยืนยันจริง (เปิด/ปิดงาน, อนุมัติ+ไม่อนุมัติ ทั้ง SUPERVISOR และ ADMIN, จัดการชนิดงาน, ตั้ง `employee_code`, ASSISTANT read-only) — บัญชี `assistant.test` ที่ใช้ทดสอบถูกปิดใช้งานแล้ว (ลบแถว `profiles`)
- [x] แก้ช่องโหว่ privilege escalation ใน `profiles` (S1) ด้วย trigger `trg_prevent_profile_privilege_change` — ดูหัวข้อ RLS
- [x] แก้บั๊ก B1 (แท็บประวัติมือถือค้าง stale หลังปิดงาน) + G1 (admin แท็บ "พนักงาน" ไม่นับงานของบัญชี auth เพราะ match ชื่อกับ roster เก่า → เปลี่ยนเป็น union ชื่อ roster + ชื่อใน job crew)
- [x] ระบบจัดการผู้ใช้งานในหน้า admin.html — ADMIN สร้างบัญชี (ผ่าน Edge Function `admin-users`), แก้ role/แผนก/รหัสพนักงาน, ปิดใช้งาน (soft delete `profiles.active`) — ต้องรัน `sql/2026-09-04-user-management.sql` + deploy Edge Function ก่อน
- [ ] สร้างบัญชีจริงให้พนักงานแต่ละคน (รอรายชื่อ-อีเมล-แผนก-สิทธิ์จากผู้ใช้งาน) แล้วลบ/เปลี่ยนรหัสบัญชีทดสอบ
- [ ] ฟีเจอร์ "มอบหมายงานรายคน" โดย SUPERVISOR (ตอนนี้ USER เลือกงานจากรายการเองอิสระ ยังไม่มีการมอบหมายเจาะจงรายคน — ถ้าต้องการค่อยทำเพิ่ม)
- [ ] ทดสอบกับผู้ใช้งานจริงหน้างาน ก่อนเลิกใช้ระบบเดิม

## Repo

https://github.com/vppwscw/warehouse-ops
