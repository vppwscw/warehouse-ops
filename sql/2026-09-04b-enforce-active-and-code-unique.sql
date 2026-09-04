-- 2026-09-04 (b) — security follow-ups from the audit
--
-- (1) profiles.active was UI-only: a soft-deleted user kept full API access
--     until their JWT expired (~1h) because the RLS helpers ignored `active`.
-- (2) profiles.employee_code had no uniqueness — defeated its "prevent
--     duplicate names on approval cards" purpose.
-- Run once in the Supabase SQL editor. Idempotent.

-- ---------- (1) enforce active ----------

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'ADMIN' and active);
$$;
create or replace function public.is_assistant() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'ASSISTANT' and active);
$$;
create or replace function public.is_supervisor() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'SUPERVISOR' and active);
$$;
create or replace function public.is_worker() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'USER' and active);
$$;

-- deactivated -> my_department() is null, so `department = my_department()` never matches
create or replace function public.my_department() returns department
  language sql stable security definer set search_path = public as $$
  select department from public.profiles where id = auth.uid() and active;
$$;

create or replace function public.is_active() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false);
$$;

-- the two policy branches that key on auth.uid() directly (no helper) need is_active()
alter policy jobs_update on public.jobs
  using (
    is_active() AND (
         is_admin()
      OR ((created_by = auth.uid()) AND (status = 'open'::text))
      OR (is_supervisor() AND (department = my_department()))
    )
  )
  with check (
    is_active() AND (
         is_admin()
      OR (created_by = auth.uid())
      OR (is_supervisor() AND (department = my_department()))
    )
  );

alter policy profiles_update on public.profiles
  using ((is_active() AND (id = auth.uid())) OR is_admin());

-- ---------- (2) employee_code uniqueness ----------

create unique index if not exists profiles_employee_code_key
  on public.profiles (employee_code)
  where employee_code is not null;
