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

### วิธีสร้างบัญชีใหม่ (2 ขั้น)

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
- `employees` — รายชื่อพนักงานแบบ roster เก่า (ยังใช้โดย ADMIN ในโหมดเดิมของ index.html)
- `tasks` — ชนิดงานที่ทำได้ต่อแผนก (`id` text, `department`, `name`, `active`) — SUPERVISOR เพิ่ม/ปิดใช้งานได้เฉพาะแผนกตัวเอง
- `jobs` — งานที่บันทึก
  - `department`, `task_id`, `employee_id`/`employee_name` (ทางเก่า), `created_by` (uuid → คนเปิดงานตัวจริง), `details` (jsonb: date/start/end/mins/qty ฯลฯ)
  - `status` (`open` เปิดค้างอยู่ → `pending` ปิดแล้วรออนุมัติ → `approved`/`rejected`)
  - `started_at`, `ended_at`, `approved_by`, `approved_at`

Helper functions (SQL, `SECURITY DEFINER`): `is_admin()`, `is_assistant()`, `is_supervisor()`, `is_worker()`, `my_department()`

กติกา RLS หลัก:
- `profiles` — เห็นตัวเอง เสมอ; ADMIN/ASSISTANT เห็นทุกคน; SUPERVISOR เห็นคนในแผนกตัวเอง (เอาไว้โชว์ `employee_code` ตอนอนุมัติ)
- `profiles` update — policy `profiles_update` = `((id = auth.uid()) OR is_admin())` (ใครก็แก้แถวตัวเองได้). **กัน privilege escalation ด้วย trigger** `trg_prevent_profile_privilege_change` (BEFORE UPDATE) → เรียก `prevent_profile_privilege_change()` ซึ่ง `raise exception` ถ้าจะเปลี่ยน `role` / `department` / `employee_code` โดยไม่ใช่ ADMIN (แก้ `full_name` ตัวเองยังได้). เพิ่มเมื่อ 2026-09-04 หลังพบว่า USER/SUPERVISOR/ASSISTANT ยิง `update profiles set role='ADMIN'` แถวตัวเองแล้วกลายเป็น ADMIN ได้
- `tasks`/`jobs`/`employees` — เห็น/แก้ได้เฉพาะแผนกตัวเอง ยกเว้น ADMIN/ASSISTANT เห็นทุกแผนก (ASSISTANT อ่านอย่างเดียว)
- `jobs` insert — เฉพาะ USER เปิดงานของตัวเอง (`created_by = auth.uid()`) หรือ ADMIN
- `jobs` update — เจ้าของงานเอง (ตอน `status='open'` เท่านั้น) หรือ SUPERVISOR/ADMIN (อนุมัติ/ไม่อนุมัติ)

> SQL ของ trigger นี้อยู่ใน Supabase project เท่านั้น (repo เป็น static site ไม่มีโฟลเดอร์ migration):
> ```sql
> create or replace function public.prevent_profile_privilege_change()
> returns trigger language plpgsql security definer set search_path = public as $$
> begin
>   if not public.is_admin() and (
>        new.role          is distinct from old.role
>     or new.department    is distinct from old.department
>     or new.employee_code is distinct from old.employee_code
>   ) then
>     raise exception 'not allowed to change role, department or employee_code';
>   end if;
>   return new;
> end $$;
>
> drop trigger if exists trg_prevent_profile_privilege_change on public.profiles;
> create trigger trg_prevent_profile_privilege_change
>   before update on public.profiles
>   for each row execute function public.prevent_profile_privilege_change();
> ```

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
- [ ] สร้างบัญชีจริงให้พนักงานแต่ละคน (รอรายชื่อ-อีเมล-แผนก-สิทธิ์จากผู้ใช้งาน) แล้วลบ/เปลี่ยนรหัสบัญชีทดสอบ
- [ ] ฟีเจอร์ "มอบหมายงานรายคน" โดย SUPERVISOR (ตอนนี้ USER เลือกงานจากรายการเองอิสระ ยังไม่มีการมอบหมายเจาะจงรายคน — ถ้าต้องการค่อยทำเพิ่ม)
- [ ] ทดสอบกับผู้ใช้งานจริงหน้างาน ก่อนเลิกใช้ระบบเดิม

## Repo

https://github.com/vppwscw/warehouse-ops
