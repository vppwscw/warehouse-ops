-- 2026-09-04 — soft-delete flag + let the admin-users Edge Function manage profiles
-- Run once in the Supabase SQL editor (production DB). Idempotent.

-- 1. soft-delete flag. Inactive accounts stay in the DB (job history keeps
--    its names) but can no longer sign in — the apps check this in afterLogin.
alter table public.profiles
  add column if not exists active boolean not null default true;

-- 2. Rebuild the S1 privilege-escalation guard so it also:
--    - protects the new `active` column from non-admin self-edits
--    - lets the service_role (the admin-users Edge Function) through
create or replace function public.prevent_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- the admin-users Edge Function calls in with the service key
  if (auth.jwt() ->> 'role') = 'service_role' then
    return new;
  end if;
  if not public.is_admin() and (
       new.role          is distinct from old.role
    or new.department    is distinct from old.department
    or new.employee_code is distinct from old.employee_code
    or new.active        is distinct from old.active
  ) then
    raise exception 'not allowed to change role, department, employee_code or active';
  end if;
  return new;
end
$$;

drop trigger if exists trg_prevent_profile_privilege_change on public.profiles;
create trigger trg_prevent_profile_privilege_change
  before update on public.profiles
  for each row
  execute function public.prevent_profile_privilege_change();
