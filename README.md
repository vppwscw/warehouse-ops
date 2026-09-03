# Warehouse Ops — production build

ระบบบันทึกงานคลัง 2 ส่วน ต่อฐานข้อมูลจริงบน Supabase (Postgres + Auth + Realtime + RLS)

- `index.html` — แอปมือถือสำหรับลูกพี่/หัวหน้าแผนก บันทึกงานที่ทำเสร็จ
- `admin.html` — เว็บ ERP dashboard สำหรับฝ่ายออฟฟิศ/แอดมิน
- `css/` — สไตล์แยกตามหน้า (`mobile.css`, `admin.css`)
- `js/` — โค้ดแยกตามหน้า (`mobile.js`, `admin.js`) + `supabase-config.js` (ค่าเชื่อมต่อ Supabase ที่ใช้ร่วมกัน)

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

## บัญชีทดสอบ (Supabase Auth)

| อีเมล | รหัสผ่าน | สิทธิ์ |
|---|---|---|
| admin.test@warehouse-ops.local | Wh0use-Test-2026! | ADMIN (เห็นทุกแผนก) |

> รหัสผ่านนี้เป็นบัญชีทดสอบเท่านั้น แนะนำให้เปลี่ยน/ลบก่อนใช้งานจริงกับทีม แล้วสร้างบัญชีจริงของหัวหน้าแผนกแต่ละคนแทน

## Supabase project

- Project ref: `dkudeyxccztrfngqfthj`
- Region: Southeast Asia (Singapore)
- Dashboard: https://supabase.com/dashboard/project/dkudeyxccztrfngqfthj
- Publishable (anon) key ฝังอยู่ใน `js/supabase-config.js` — ปลอดภัยที่จะฝังในโค้ดฝั่ง client เพราะสิทธิ์จริงถูกคุมด้วย Row Level Security (RLS) ทั้งหมด ไม่ใช่คีย์นี้
- **ห้าม**ฝัง secret key / service_role key ในไฟล์ฝั่งหน้าเว็บเด็ดขาด

## โครงสร้างฐานข้อมูล

ตาราง (schema `public`), เปิด RLS ทุกตาราง:

- `profiles` — บัญชีผู้ใช้ (1:1 กับ `auth.users`), เก็บ `full_name`, `department` (INB/OUT/INV, ว่างสำหรับแอดมิน), `role` (SUPERVISOR/ADMIN)
- `employees` — รายชื่อพนักงานที่ถูกบันทึกงาน แยกตามแผนก
- `tasks` — รายการงานที่ทำได้ต่อแผนก
- `jobs` — งานที่บันทึกเสร็จแล้ว หนึ่งแถวต่อพนักงานหนึ่งคนต่อการบันทึกหนึ่งครั้ง (`details` เก็บข้อมูลเสริมเป็น jsonb รวมถึงรายชื่อทีมทั้งหมด)

กติกา RLS หลัก: แต่ละคนเห็น/เขียนได้เฉพาะแผนกตัวเอง ยกเว้น ADMIN เห็นและจัดการได้ทุกแผนก

## สถานะโปรเจกต์ (อัปเดตล่าสุด)

- [x] สร้าง Supabase project + schema + RLS policy ครบ
- [x] เปลี่ยนระบบ login จากรหัสรวมต่อแผนก → บัญชีรายคนผ่าน Supabase Auth
- [x] เขียนแอป production (index.html/admin.html) ต่อ Supabase จริง แยก HTML/CSS/JS เป็นชั้นๆ
- [x] สร้างบัญชีทดสอบ ADMIN 1 บัญชี
- [ ] อัปโหลดไฟล์ทั้งหมดขึ้น GitHub repo `vppwscw/warehouse-ops`
- [ ] เปิดใช้งาน GitHub Pages เพื่อได้ URL จริงสำหรับใช้งาน
- [ ] สร้างบัญชีจริงให้หัวหน้าแผนกแต่ละคน (รอรายชื่อ-อีเมล-แผนกจากผู้ใช้งาน)
- [ ] ทดสอบ end-to-end ก่อนปล่อยใช้งานจริง

## Repo

https://github.com/vppwscw/warehouse-ops
