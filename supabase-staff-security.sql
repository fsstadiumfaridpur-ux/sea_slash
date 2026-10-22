-- Run after supabase-admin-security.sql. Existing staff and payroll data are preserved.
begin;

create table if not exists public.restaurant_staff (
  id text primary key,
  profile jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.restaurant_staff (id, profile)
select item ->> 'id', item from public.app_state state,
lateral jsonb_array_elements(case when state.key = 'sea_slash_staff_v1' and jsonb_typeof(state.value) = 'array' then state.value else '[]'::jsonb end) item
where state.key = 'sea_slash_staff_v1' and jsonb_typeof(state.value) = 'array'
on conflict (id) do nothing;

create table if not exists public.restaurant_staff_accounts (
  staff_id text primary key references public.restaurant_staff(id),
  user_id uuid not null unique references auth.users(id),
  email text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.restaurant_staff_agreements (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references public.restaurant_staff(id),
  version integer not null,
  title text not null,
  document text not null,
  status text not null default 'issued' check (status in ('issued', 'accepted', 'withdrawn')),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  accepted_at timestamptz,
  accepted_name text,
  accepted_by uuid references auth.users(id),
  unique (staff_id, version)
);

alter table public.restaurant_staff enable row level security;
alter table public.restaurant_staff_accounts enable row level security;
alter table public.restaurant_staff_agreements enable row level security;
revoke all on public.restaurant_staff, public.restaurant_staff_accounts, public.restaurant_staff_agreements from anon, authenticated;
grant select on public.restaurant_staff, public.restaurant_staff_accounts, public.restaurant_staff_agreements to authenticated;
grant all on public.restaurant_staff, public.restaurant_staff_accounts, public.restaurant_staff_agreements to service_role;

create or replace function public.current_restaurant_staff_id()
returns text language sql stable security definer set search_path = '' as $$
  select s.id from public.restaurant_staff s
  join public.restaurant_staff_accounts a on a.staff_id = s.id
  where a.user_id = auth.uid() and (s.profile ->> 'active')::boolean = true
    and coalesce(s.profile ->> 'archivedAt', '') = '';
$$;
revoke all on function public.current_restaurant_staff_id() from public;
grant execute on function public.current_restaurant_staff_id() to authenticated;

drop policy if exists "Admin staff reads" on public.restaurant_staff;
create policy "Admin staff reads" on public.restaurant_staff for select to authenticated using (public.is_restaurant_admin());
drop policy if exists "Admin staff account reads" on public.restaurant_staff_accounts;
create policy "Admin staff account reads" on public.restaurant_staff_accounts for select to authenticated using (public.is_restaurant_admin());
drop policy if exists "Staff agreement reads" on public.restaurant_staff_agreements;
create policy "Staff agreement reads" on public.restaurant_staff_agreements for select to authenticated
using (public.is_restaurant_admin() or staff_id = public.current_restaurant_staff_id());

-- Anonymous users retain existing operational access, but never staff/payroll data.
-- Signed-in staff cannot use the public state API to inspect other workers or business data.
drop policy if exists "Restaurant state reads" on public.app_state;
drop policy if exists "Restaurant state inserts" on public.app_state;
drop policy if exists "Restaurant state updates" on public.app_state;
create policy "Restaurant state reads" on public.app_state for select to anon, authenticated using (
  public.is_restaurant_admin() or (auth.uid() is null and key not in ('sea_slash_staff_v1', 'sea_slash_attendance_v1', 'sea_slash_advances_v1'))
);
create policy "Restaurant state inserts" on public.app_state for insert to anon, authenticated with check (
  public.is_restaurant_admin() or (auth.uid() is null and key not in ('sea_slash_staff_v1', 'sea_slash_attendance_v1', 'sea_slash_advances_v1'))
);
create policy "Restaurant state updates" on public.app_state for update to anon, authenticated using (
  public.is_restaurant_admin() or (auth.uid() is null and key not in ('sea_slash_staff_v1', 'sea_slash_attendance_v1', 'sea_slash_advances_v1'))
) with check (
  public.is_restaurant_admin() or (auth.uid() is null and key not in ('sea_slash_staff_v1', 'sea_slash_attendance_v1', 'sea_slash_advances_v1'))
);

create or replace function public.list_restaurant_staff()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(s.profile || jsonb_build_object('loginEmail', a.email, 'authUserId', a.user_id) order by s.profile ->> 'name'), '[]'::jsonb)
    from public.restaurant_staff s left join public.restaurant_staff_accounts a on a.staff_id = s.id);
end;
$$;

create or replace function public.save_restaurant_staff(p_profile jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing jsonb; clean jsonb; salary numeric; identifier text;
begin
  if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  identifier := p_profile ->> 'id';
  if identifier is null or length(identifier) not between 1 and 100 then raise exception 'Invalid staff ID.'; end if;
  -- Serialize profile edits, agreement issuing and terminations for this employee.
  perform pg_advisory_xact_lock(hashtextextended(identifier, 0));
  select profile into existing from public.restaurant_staff where id = identifier for update;
  if existing ->> 'archivedAt' is not null then raise exception 'Deleted profiles cannot be edited.'; end if;
  salary := (p_profile ->> 'baseSalary')::numeric;
  if salary is null or salary < 0 or salary > 10000000 or salary::text = 'NaN' then raise exception 'Invalid salary.'; end if;
  if coalesce(trim(p_profile ->> 'name'), '') = '' or coalesce(trim(p_profile ->> 'role'), '') = '' then raise exception 'Name and role are required.'; end if;
  if (p_profile ->> 'salaryType') is null or (p_profile ->> 'salaryType') not in ('monthly', 'daily', 'hourly') then raise exception 'Invalid salary type.'; end if;
  if p_profile->>'salaryType'='hourly' and p_profile->'hourlyWorkSchedule' is not null and p_profile->'hourlyWorkSchedule'<>'null'::jsonb then
    if jsonb_typeof(p_profile->'hourlyWorkSchedule') is distinct from 'object'
      or coalesce(p_profile->'hourlyWorkSchedule'->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(p_profile->'hourlyWorkSchedule'->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or p_profile->'hourlyWorkSchedule'->>'start'=p_profile->'hourlyWorkSchedule'->>'end' then raise exception 'Choose valid individual working hours.'; end if;
  end if;
  if (p_profile ->> 'joinDate') is null then raise exception 'Start date is required.'; end if;
  perform (p_profile ->> 'joinDate')::date;
  clean := jsonb_build_object('id', identifier, 'name', trim(p_profile ->> 'name'), 'role', trim(p_profile ->> 'role'),
    'phone', coalesce(p_profile ->> 'phone', ''), 'salaryType', p_profile ->> 'salaryType', 'baseSalary', salary,
    'joinDate', p_profile ->> 'joinDate', 'active', coalesce((existing ->> 'active')::boolean, true));
  if p_profile->>'salaryType'='hourly' and jsonb_typeof(p_profile->'hourlyWorkSchedule')='object' then
    clean:=clean||jsonb_build_object('hourlyWorkSchedule',jsonb_build_object('start',p_profile->'hourlyWorkSchedule'->>'start','end',p_profile->'hourlyWorkSchedule'->>'end'));
  end if;
  if existing is not null then clean := clean || (existing - array['name', 'role', 'phone', 'salaryType', 'baseSalary', 'joinDate', 'loginEmail', 'authUserId', 'hourlyWorkSchedule']); end if;
  insert into public.restaurant_staff (id, profile) values (identifier, clean)
    on conflict (id) do update set profile = excluded.profile, updated_at = now();
  return public.list_restaurant_staff();
end;
$$;

create or replace function public.terminate_restaurant_staff(p_staff_id text, p_date date, p_reason text, p_archive boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing jsonb;
begin
  if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' or p_date is null then raise exception 'Date and reason are required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_staff_id, 0));
  select profile into existing from public.restaurant_staff where id = p_staff_id for update;
  if existing is null then raise exception 'Staff profile no longer exists.'; end if;
  if p_date < (existing ->> 'joinDate')::date or p_date > (now() at time zone 'Asia/Dhaka')::date then raise exception 'Termination date must be between start date and today.'; end if;
  existing := existing || jsonb_build_object('active', false, 'terminationDate', coalesce(existing ->> 'terminationDate', p_date::text), 'terminationReason', trim(p_reason));
  if p_archive then existing := existing || jsonb_build_object('archivedAt', now()); end if;
  update public.restaurant_staff set profile = existing, updated_at = now() where id = p_staff_id;
  update public.restaurant_staff_agreements set status = 'withdrawn' where staff_id = p_staff_id and status = 'issued';
  return public.list_restaurant_staff();
end;
$$;

create or replace function public.get_staff_portal()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare identifier text := public.current_restaurant_staff_id(); profile jsonb; attendance jsonb; advances jsonb;
begin
  if identifier is null then return null; end if;
  select s.profile || jsonb_build_object('loginEmail', a.email) into profile from public.restaurant_staff s
    join public.restaurant_staff_accounts a on a.staff_id = s.id where s.id = identifier;
  select coalesce(jsonb_agg(item), '[]'::jsonb) into attendance from public.app_state state,
    lateral jsonb_array_elements(case when state.key = 'sea_slash_attendance_v1' then state.value else '[]'::jsonb end) item where state.key = 'sea_slash_attendance_v1' and item ->> 'staffId' = identifier;
  select coalesce(jsonb_agg(item), '[]'::jsonb) into advances from public.app_state state,
    lateral jsonb_array_elements(case when state.key = 'sea_slash_advances_v1' then state.value else '[]'::jsonb end) item where state.key = 'sea_slash_advances_v1' and item ->> 'staffId' = identifier;
  return jsonb_build_object('profile', profile, 'attendance', attendance, 'advances', advances);
end;
$$;

create or replace function public.issue_staff_agreement(p_staff_id text, p_title text, p_document text)
returns public.restaurant_staff_agreements language plpgsql security definer set search_path = '' as $$
declare result public.restaurant_staff_agreements; existing jsonb; next_version integer;
begin
  if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_document), '') = '' or length(p_document) > 50000 then raise exception 'Agreement title and document are required (maximum 50,000 characters).'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_staff_id, 0));
  select profile into existing from public.restaurant_staff where id = p_staff_id for update;
  if existing is null or not (existing ->> 'active')::boolean or existing ->> 'archivedAt' is not null then raise exception 'Choose an active staff member.'; end if;
  select coalesce(max(version), 0) + 1 into next_version from public.restaurant_staff_agreements where staff_id = p_staff_id;
  update public.restaurant_staff_agreements set status = 'withdrawn' where staff_id = p_staff_id and status = 'issued';
  insert into public.restaurant_staff_agreements (staff_id, version, title, document, created_by)
    values (p_staff_id, next_version, trim(p_title), p_document, auth.uid()) returning * into result;
  return result;
end;
$$;

create or replace function public.accept_staff_agreement(p_id uuid, p_name text)
returns public.restaurant_staff_agreements language plpgsql security definer set search_path = '' as $$
declare result public.restaurant_staff_agreements; identifier text := public.current_restaurant_staff_id();
begin
  if identifier is null then raise exception 'An active staff login is required.' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' or length(p_name) > 200 then raise exception 'Your full name is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(identifier, 0));
  -- Recheck access after the lock in case termination happened while waiting.
  if public.current_restaurant_staff_id() is distinct from identifier then raise exception 'Staff access is disabled.' using errcode = '42501'; end if;
  select * into result from public.restaurant_staff_agreements where id = p_id and staff_id = identifier for update;
  if result.id is null then raise exception 'Agreement not found.' using errcode = '42501'; end if;
  if result.status = 'accepted' then return result; end if;
  if result.status <> 'issued' then raise exception 'This agreement has been withdrawn.'; end if;
  update public.restaurant_staff_agreements set status = 'accepted', accepted_at = now(), accepted_name = trim(p_name), accepted_by = auth.uid()
    where id = p_id returning * into result;
  return result;
end;
$$;

create or replace function public.withdraw_staff_agreement(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare identifier text;
begin
  if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  select staff_id into identifier from public.restaurant_staff_agreements where id = p_id;
  if identifier is null then raise exception 'Agreement not found.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(identifier, 0));
  update public.restaurant_staff_agreements set status = 'withdrawn' where id = p_id and status = 'issued';
  if not found then raise exception 'Only pending agreements can be withdrawn.'; end if;
end;
$$;

-- Called only by the Edge Function after validating the admin's JWT.
create or replace function public.bind_restaurant_staff_account(p_staff_id text, p_user_id uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare existing jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_staff_id, 0));
  select profile into existing from public.restaurant_staff where id = p_staff_id for update;
  if existing is null or not (existing ->> 'active')::boolean or existing ->> 'archivedAt' is not null then raise exception 'Staff profile is not active.'; end if;
  if p_user_id = '410baf80-c3ed-4b8c-b312-3e0519a61948'::uuid or lower(p_email) = 'officialmughalmahal@gmail.com' then raise exception 'The administrator cannot be linked as staff.'; end if;
  if not exists (select 1 from auth.users where id = p_user_id and lower(email) = lower(p_email)) then raise exception 'Account email does not match.'; end if;
  insert into public.restaurant_staff_accounts (staff_id, user_id, email) values (p_staff_id, p_user_id, lower(p_email));
end;
$$;

revoke all on function public.list_restaurant_staff(), public.save_restaurant_staff(jsonb), public.terminate_restaurant_staff(text,date,text,boolean),
  public.get_staff_portal(), public.issue_staff_agreement(text,text,text), public.accept_staff_agreement(uuid,text), public.withdraw_staff_agreement(uuid),
  public.bind_restaurant_staff_account(text,uuid,text) from public, anon, authenticated;
grant execute on function public.list_restaurant_staff(), public.save_restaurant_staff(jsonb), public.terminate_restaurant_staff(text,date,text,boolean),
  public.get_staff_portal(), public.issue_staff_agreement(text,text,text), public.accept_staff_agreement(uuid,text), public.withdraw_staff_agreement(uuid) to authenticated;
grant execute on function public.bind_restaurant_staff_account(text,uuid,text) to service_role;
commit;
