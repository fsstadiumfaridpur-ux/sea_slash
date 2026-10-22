-- SEA SLASH ONLY: project xrgttljzokzrvqfdbmdu. Run once in this new project's SQL Editor.
-- Requires an Auth user with email officialseaslash@gmail.com. All changes are atomic. No existing records are deleted.
begin;
DO $guard$ begin
 if to_regclass('public.app_state') is not null or to_regclass('public.restaurant_staff') is not null then
  raise exception 'This installer requires a fresh Sea Slash database. Do not run it on Mughal Mahal or an existing installation.';
 end if;
 if not exists(select 1 from auth.users where lower(email)='officialseaslash@gmail.com') then
  raise exception 'First create the Sea Slash admin account in Authentication > Users, then run this file again.';
 end if;
end $guard$;
create table public.sea_slash_owner(id boolean primary key default true check(id),user_id uuid not null unique references auth.users(id),email text not null);
alter table public.sea_slash_owner enable row level security;
revoke all on public.sea_slash_owner from public,anon,authenticated;
insert into public.sea_slash_owner(id,user_id,email) select true,id,lower(email) from auth.users where lower(email)='officialseaslash@gmail.com';

-- schema
create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

create policy "Allow anon app state reads"
  on public.app_state
  for select
  to anon
  using (true);

create policy "Allow anon app state writes"
  on public.app_state
  for insert
  to anon
  with check (true);

create policy "Allow anon app state updates"
  on public.app_state
  for update
  to anon
  using (true)
  with check (true);

insert into public.app_state(key,value) values ('sea_slash_settings_v1','{"stallName":"Sea Slash","foodCourtName":"","stallNumber":"","monthlyRent":0,"dailyRent":0,"commissionRate":0,"managerContact":"","currency":"৳","facebookUrl":""}'::jsonb),('sea_slash_bkash_account_v1','{"opening":{"date":"2026-10-22","amount":0},"transfers":[]}'::jsonb);
insert into public.app_state(key,value) values ('sea_slash_vendors_v1','[]'::jsonb);
insert into public.app_state(key,value) values ('sea_slash_vendor_categories_v1','[]'::jsonb);
insert into public.app_state(key,value) values ('sea_slash_vendor_ledger_v1','[]'::jsonb);
insert into public.app_state(key,value) values ('sea_slash_sales_v1','[]'::jsonb);
insert into public.app_state(key,value) values ('sea_slash_expenses_v1','[]'::jsonb);
insert into public.app_state(key,value) values ('sea_slash_inventory_v1','[]'::jsonb);
insert into public.app_state(key,value) values ('sea_slash_purchases_v1','[]'::jsonb);
insert into public.app_state(key,value) values ('sea_slash_wastes_v1','[]'::jsonb);
insert into public.app_state(key,value) values ('sea_slash_staff_v1','[]'::jsonb);
insert into public.app_state(key,value) values ('sea_slash_attendance_v1','[]'::jsonb);
insert into public.app_state(key,value) values ('sea_slash_advances_v1','[]'::jsonb);
insert into public.app_state(key,value) values ('sea_slash_photos_v1','[]'::jsonb);
insert into public.app_state(key,value) values ('sea_slash_recipes_v1','[]'::jsonb);

-- admin-security

-- The account was provisioned using Supabase Auth; its password is never stored here.
create or replace function public.is_restaurant_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    auth.uid() = (select user_id from public.sea_slash_owner where id=true)
    and lower(auth.jwt() ->> 'email') = (select email from public.sea_slash_owner where id=true),
    false
  );
$$;

revoke all on function public.is_restaurant_admin() from public;
grant execute on function public.is_restaurant_admin() to anon, authenticated;

create or replace function public.guard_restaurant_admin_actions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.key <> old.key then
    raise exception 'State keys cannot be changed.' using errcode = '42501';
  end if;

  if public.is_restaurant_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  if new.key = 'sea_slash_inventory_categories_v1' then
    if tg_op = 'UPDATE' and new.value = old.value then return new; end if;
    raise exception 'Only administrators can manage inventory categories.' using errcode = '42501';
  end if;

  if new.key in ('sea_slash_inventory_v1', 'sea_slash_wastes_v1') then
    if jsonb_typeof(new.value) <> 'array' or exists (
      select 1 from jsonb_array_elements(new.value) item
      where jsonb_typeof(item) <> 'object' or not (item ? 'id')
        or jsonb_typeof(item -> 'id') <> 'string' or item ->> 'id' = ''
    ) then
      raise exception 'Inventory and waste records must contain valid IDs.' using errcode = '22023';
    end if;
    if tg_op = 'UPDATE' and exists (
      select 1 from jsonb_array_elements(old.value) old_item
      where not exists (
        select 1 from jsonb_array_elements(new.value) new_item
        where new_item ->> 'id' = old_item ->> 'id'
      )
    ) then
      raise exception 'Only administrators can delete ingredients or waste records.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_restaurant_admin_actions() from public;
drop trigger if exists guard_restaurant_admin_actions on public.app_state;
create trigger guard_restaurant_admin_actions
before insert or update or delete on public.app_state
for each row execute function public.guard_restaurant_admin_actions();

alter table public.app_state enable row level security;
drop policy if exists "Allow anon app state reads" on public.app_state;
drop policy if exists "Allow anon app state writes" on public.app_state;
drop policy if exists "Allow anon app state updates" on public.app_state;
drop policy if exists "Restaurant state reads" on public.app_state;
drop policy if exists "Restaurant state inserts" on public.app_state;
drop policy if exists "Restaurant state updates" on public.app_state;
create policy "Restaurant state reads" on public.app_state for select to anon, authenticated using (true);
create policy "Restaurant state inserts" on public.app_state for insert to anon, authenticated with check (true);
create policy "Restaurant state updates" on public.app_state for update to anon, authenticated using (true) with check (true);
grant select, insert, update on public.app_state to anon, authenticated;

create or replace function public.delete_restaurant_waste(p_record_id text, p_restore_stock boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  waste_records jsonb;
  stock_records jsonb;
  target_record jsonb;
  target_stock jsonb;
begin
  if not public.is_restaurant_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  -- Lock both buckets in the same order for every request.
  select value into stock_records from public.app_state where key = 'sea_slash_inventory_v1' for update;
  select value into waste_records from public.app_state where key = 'sea_slash_wastes_v1' for update;
  select item into target_record from jsonb_array_elements(coalesce(waste_records, '[]'::jsonb)) item where item ->> 'id' = p_record_id;
  if target_record is null then raise exception 'Waste record no longer exists.'; end if;

  if p_restore_stock then
    select item into target_stock from jsonb_array_elements(coalesce(stock_records, '[]'::jsonb)) item where item ->> 'id' = target_record ->> 'itemId';
    if target_stock is null then raise exception 'This ingredient no longer exists; stock cannot be restored.'; end if;
    if target_stock ->> 'unit' <> target_record ->> 'unit' then raise exception 'Ingredient units have changed; stock cannot be restored.'; end if;
    select jsonb_agg(case when item ->> 'id' = target_record ->> 'itemId' then
      item || jsonb_build_object('currentStock', (item ->> 'currentStock')::numeric + (target_record ->> 'quantity')::numeric, 'lastUpdated', (now() at time zone 'Asia/Dhaka')::date::text)
      else item end order by position)
    into stock_records from jsonb_array_elements(stock_records) with ordinality as rows(item, position);
    update public.app_state set value = stock_records, updated_at = now() where key = 'sea_slash_inventory_v1';
  end if;

  select coalesce(jsonb_agg(item order by position), '[]'::jsonb) into waste_records
    from jsonb_array_elements(waste_records) with ordinality as rows(item, position) where item ->> 'id' <> p_record_id;
  update public.app_state set value = waste_records, updated_at = now() where key = 'sea_slash_wastes_v1';
  return jsonb_build_object('wastes', waste_records, 'inventory', coalesce(stock_records, '[]'::jsonb));
end;
$$;

revoke all on function public.delete_restaurant_waste(text, boolean) from public;
grant execute on function public.delete_restaurant_waste(text, boolean) to authenticated;



-- staff-security
-- Run after supabase-admin-security.sql. Existing staff and payroll data are preserved.

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
  if p_user_id = (select user_id from public.sea_slash_owner where id=true) or lower(p_email) = (select email from public.sea_slash_owner where id=true) then raise exception 'The administrator cannot be linked as staff.'; end if;
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


-- expense-security

-- Restrictive policies combine with existing policies; unrelated state stays unchanged.
alter table public.app_state enable row level security;
drop policy if exists "Private expense reads" on public.app_state;
drop policy if exists "Private expense inserts" on public.app_state;
drop policy if exists "Private expense updates" on public.app_state;
drop policy if exists "Private expense deletes" on public.app_state;
create policy "Private expense reads" on public.app_state as restrictive for select to anon, authenticated
  using (key <> 'sea_slash_expenses_v1' or public.is_restaurant_admin());
create policy "Private expense inserts" on public.app_state as restrictive for insert to anon, authenticated
  with check (key <> 'sea_slash_expenses_v1' or public.is_restaurant_admin());
create policy "Private expense updates" on public.app_state as restrictive for update to anon, authenticated
  using (key <> 'sea_slash_expenses_v1' or public.is_restaurant_admin())
  with check (key <> 'sea_slash_expenses_v1' or public.is_restaurant_admin());
create policy "Private expense deletes" on public.app_state as restrictive for delete to anon, authenticated
  using (key <> 'sea_slash_expenses_v1' or public.is_restaurant_admin());

create or replace function public.restaurant_expense_security_ready()
returns boolean language sql stable set search_path = '' as $$
  select public.is_restaurant_admin();
$$;
revoke all on function public.restaurant_expense_security_ready() from public;
grant execute on function public.restaurant_expense_security_ready() to authenticated;



-- investment-security

alter table public.app_state enable row level security;
drop policy if exists "Private investment reads" on public.app_state;
drop policy if exists "Private investment inserts" on public.app_state;
drop policy if exists "Private investment updates" on public.app_state;
drop policy if exists "Private investment deletes" on public.app_state;
create policy "Private investment reads" on public.app_state as restrictive for select to anon, authenticated
  using (key <> 'sea_slash_investments_v1' or public.is_restaurant_admin());
create policy "Private investment inserts" on public.app_state as restrictive for insert to anon, authenticated
  with check (key <> 'sea_slash_investments_v1' or public.is_restaurant_admin());
create policy "Private investment updates" on public.app_state as restrictive for update to anon, authenticated
  using (key <> 'sea_slash_investments_v1' or public.is_restaurant_admin())
  with check (key <> 'sea_slash_investments_v1' or public.is_restaurant_admin());
create policy "Private investment deletes" on public.app_state as restrictive for delete to anon, authenticated
  using (key <> 'sea_slash_investments_v1' or public.is_restaurant_admin());
create or replace function public.restaurant_investment_security_ready()
returns boolean language sql stable set search_path = '' as $$
  select public.is_restaurant_admin();
$$;
revoke all on function public.restaurant_investment_security_ready() from public;
grant execute on function public.restaurant_investment_security_ready() to authenticated;


-- role-security
-- Run after the existing admin, staff, expense and investment migrations.

alter table public.restaurant_staff add column if not exists access_role text not null default 'chef'
  check (access_role in ('chef', 'manager', 'admin'));

create or replace function public.restaurant_access_role()
returns text language sql stable security definer set search_path = '' as $$
  select case when auth.uid() = (select user_id from public.sea_slash_owner where id=true)
    and lower(auth.jwt() ->> 'email') = (select email from public.sea_slash_owner where id=true) then 'admin'
    else (select s.access_role from public.restaurant_staff s
      join public.restaurant_staff_accounts a on a.staff_id = s.id
      where a.user_id = auth.uid() and (s.profile ->> 'active')::boolean = true
        and coalesce(s.profile ->> 'archivedAt', '') = '') end;
$$;
create or replace function public.is_restaurant_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.restaurant_access_role() = 'admin', false);
$$;
create or replace function public.can_manage_restaurant()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.restaurant_access_role() in ('admin', 'manager'), false);
$$;
revoke all on function public.restaurant_access_role(), public.can_manage_restaurant() from public;
grant execute on function public.restaurant_access_role(), public.can_manage_restaurant() to anon, authenticated;

-- Restrictive policies prevent any older permissive policy from granting public access.
alter table public.app_state enable row level security;
drop policy if exists "Restaurant state reads" on public.app_state;
drop policy if exists "Restaurant state inserts" on public.app_state;
drop policy if exists "Restaurant state updates" on public.app_state;
drop policy if exists "Role protected state reads" on public.app_state;
drop policy if exists "Role protected state inserts" on public.app_state;
drop policy if exists "Role protected state updates" on public.app_state;
drop policy if exists "Role protected state deletes" on public.app_state;
create policy "Restaurant state reads" on public.app_state for select to authenticated
  using (public.can_manage_restaurant());
create policy "Restaurant state inserts" on public.app_state for insert to authenticated
  with check (public.can_manage_restaurant());
create policy "Restaurant state updates" on public.app_state for update to authenticated
  using (public.can_manage_restaurant()) with check (public.can_manage_restaurant());
create policy "Role protected state reads" on public.app_state as restrictive for select to anon, authenticated
  using (public.is_restaurant_admin() or (public.restaurant_access_role() = 'manager' and key <> 'sea_slash_investments_v1'));
create policy "Role protected state inserts" on public.app_state as restrictive for insert to anon, authenticated
  with check (public.is_restaurant_admin() or (public.restaurant_access_role() = 'manager' and key <> 'sea_slash_investments_v1'));
create policy "Role protected state updates" on public.app_state as restrictive for update to anon, authenticated
  using (public.is_restaurant_admin() or (public.restaurant_access_role() = 'manager' and key <> 'sea_slash_investments_v1'))
  with check (public.is_restaurant_admin() or (public.restaurant_access_role() = 'manager' and key <> 'sea_slash_investments_v1'));
create policy "Role protected state deletes" on public.app_state as restrictive for delete to anon, authenticated
  using (public.is_restaurant_admin());

drop policy if exists "Private expense reads" on public.app_state;
drop policy if exists "Private expense inserts" on public.app_state;
drop policy if exists "Private expense updates" on public.app_state;
drop policy if exists "Private expense deletes" on public.app_state;
create policy "Private expense reads" on public.app_state as restrictive for select to anon, authenticated
  using (key <> 'sea_slash_expenses_v1' or public.can_manage_restaurant());
create policy "Private expense inserts" on public.app_state as restrictive for insert to anon, authenticated
  with check (key <> 'sea_slash_expenses_v1' or public.can_manage_restaurant());
create policy "Private expense updates" on public.app_state as restrictive for update to anon, authenticated
  using (key <> 'sea_slash_expenses_v1' or public.can_manage_restaurant())
  with check (key <> 'sea_slash_expenses_v1' or public.can_manage_restaurant());
create policy "Private expense deletes" on public.app_state as restrictive for delete to anon, authenticated
  using (key <> 'sea_slash_expenses_v1' or public.is_restaurant_admin());
create or replace function public.restaurant_expense_security_ready()
returns boolean language sql stable set search_path = '' as $$ select public.can_manage_restaurant(); $$;

create or replace function public.list_restaurant_staff()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_restaurant() then raise exception 'Administrator or manager access required.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(s.profile || jsonb_build_object('appRole', s.access_role, 'loginEmail', a.email, 'authUserId', a.user_id) order by s.profile ->> 'name'), '[]'::jsonb)
    from public.restaurant_staff s left join public.restaurant_staff_accounts a on a.staff_id = s.id);
end;
$$;

-- Retain the existing validated profile writer behind an admin-only role wrapper.
do $$ begin
  if to_regprocedure('public.save_restaurant_staff_profile(jsonb)') is null then
    alter function public.save_restaurant_staff(jsonb) rename to save_restaurant_staff_profile;
  end if;
end $$;
revoke all on function public.save_restaurant_staff_profile(jsonb) from public, anon, authenticated;
create or replace function public.save_restaurant_staff(p_profile jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare requested_role text; existing_role text;
begin
  if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_profile ->> 'id', 0));
  select access_role into existing_role from public.restaurant_staff where id = p_profile ->> 'id' for update;
  requested_role := coalesce(p_profile ->> 'appRole', existing_role, 'chef');
  if requested_role not in ('chef', 'manager', 'admin') then raise exception 'Choose Chef, Manager or Admin.'; end if;
  if exists (select 1 from public.restaurant_staff_accounts a where a.staff_id = p_profile ->> 'id' and a.user_id = auth.uid())
    and requested_role is distinct from existing_role then raise exception 'You cannot change your own access role.'; end if;
  perform public.save_restaurant_staff_profile(p_profile - 'appRole');
  update public.restaurant_staff set access_role = requested_role, updated_at = now() where id = p_profile ->> 'id';
  return public.list_restaurant_staff();
end;
$$;
revoke all on function public.save_restaurant_staff(jsonb) from public, anon;
grant execute on function public.save_restaurant_staff(jsonb) to authenticated;

drop policy if exists "Staff agreement reads" on public.restaurant_staff_agreements;
create policy "Staff agreement reads" on public.restaurant_staff_agreements for select to authenticated
  using (public.can_manage_restaurant() or staff_id = public.current_restaurant_staff_id());

create table if not exists public.restaurant_inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references public.restaurant_staff(id),
  user_id uuid not null references auth.users(id),
  item_id text not null,
  quantity_before numeric not null,
  quantity_after numeric not null,
  created_at timestamptz not null default now()
);
alter table public.restaurant_inventory_adjustments enable row level security;
revoke all on public.restaurant_inventory_adjustments from public, anon, authenticated;
grant select on public.restaurant_inventory_adjustments to authenticated;
grant all on public.restaurant_inventory_adjustments to service_role;
drop policy if exists "Stock adjustment audit reads" on public.restaurant_inventory_adjustments;
create policy "Stock adjustment audit reads" on public.restaurant_inventory_adjustments for select to authenticated
  using (public.can_manage_restaurant() or staff_id = public.current_restaurant_staff_id());

create or replace function public.get_chef_workspace()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare identifier text := public.current_restaurant_staff_id(); profile jsonb; attendance jsonb; stock jsonb;
begin
  if identifier is null or public.restaurant_access_role() <> 'chef' then raise exception 'Active chef login required.' using errcode = '42501'; end if;
  select jsonb_build_object('id', s.id, 'name', s.profile ->> 'name', 'phone', s.profile ->> 'phone',
    'role', s.profile ->> 'role', 'joinDate', s.profile ->> 'joinDate', 'loginEmail', a.email) into profile
    from public.restaurant_staff s join public.restaurant_staff_accounts a on a.staff_id = s.id where s.id = identifier;
  select coalesce(jsonb_agg(item), '[]'::jsonb) into attendance from public.app_state state,
    lateral jsonb_array_elements(case when state.key = 'sea_slash_attendance_v1' then state.value else '[]'::jsonb end) item
    where state.key = 'sea_slash_attendance_v1' and item ->> 'staffId' = identifier;
  select coalesce(jsonb_agg(jsonb_build_object('id', item ->> 'id', 'name', item ->> 'name', 'banglaName', item ->> 'banglaName',
    'currentStock', item -> 'currentStock', 'unit', item ->> 'unit', 'minThreshold', item -> 'minThreshold')), '[]'::jsonb) into stock
    from public.app_state state, lateral jsonb_array_elements(case when state.key = 'sea_slash_inventory_v1' then state.value else '[]'::jsonb end) item
    where state.key = 'sea_slash_inventory_v1';
  return jsonb_build_object('profile', profile, 'attendance', attendance, 'inventory', stock);
end;
$$;

create or replace function public.save_chef_profile(p_name text, p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare identifier text := public.current_restaurant_staff_id();
begin
  if identifier is null or public.restaurant_access_role() <> 'chef' then raise exception 'Active chef login required.' using errcode = '42501'; end if;
  if length(trim(p_name)) not between 1 and 200 or p_name is null or p_phone is null or length(p_phone) > 40 then raise exception 'Enter a valid name and phone.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(identifier, 0));
  if public.current_restaurant_staff_id() is distinct from identifier then raise exception 'Staff access disabled.' using errcode = '42501'; end if;
  update public.restaurant_staff set profile = profile || jsonb_build_object('name', trim(p_name), 'phone', trim(p_phone)), updated_at = now() where id = identifier;
  return public.get_chef_workspace();
end;
$$;

create or replace function public.check_in_chef()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare identifier text := public.current_restaurant_staff_id(); day text := (now() at time zone 'Asia/Dhaka')::date::text; rows jsonb;
begin
  if identifier is null or public.restaurant_access_role() <> 'chef' then raise exception 'Active chef login required.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(identifier, 0));
  if public.current_restaurant_staff_id() is distinct from identifier then raise exception 'Staff access disabled.' using errcode = '42501'; end if;
  if day::date < (select (profile ->> 'joinDate')::date from public.restaurant_staff where id = identifier) then raise exception 'Your start date is in the future.'; end if;
  insert into public.app_state (key, value) values ('sea_slash_attendance_v1', '[]'::jsonb) on conflict (key) do nothing;
  select value into rows from public.app_state where key = 'sea_slash_attendance_v1' for update;
  if not exists (select 1 from jsonb_array_elements(rows) item where item ->> 'staffId' = identifier and item ->> 'date' = day) then
    rows := rows || jsonb_build_array(jsonb_build_object('id', 'attendance-' || gen_random_uuid(), 'staffId', identifier, 'date', day, 'status', 'present'));
    update public.app_state set value = rows, updated_at = now() where key = 'sea_slash_attendance_v1';
  end if;
  return public.get_chef_workspace();
end;
$$;

create or replace function public.adjust_chef_inventory(p_item_id text, p_delta numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare identifier text := public.current_restaurant_staff_id(); rows jsonb; target jsonb; before_qty numeric; after_qty numeric;
begin
  if identifier is null or public.restaurant_access_role() <> 'chef' then raise exception 'Active chef login required.' using errcode = '42501'; end if;
  if p_delta is null or p_delta::text in ('NaN', 'Infinity', '-Infinity') or p_delta = 0 or abs(p_delta) > 10000 then raise exception 'Invalid stock adjustment.'; end if;
  if p_delta > 0 then raise exception 'Chefs can only decrease stock.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(identifier, 0));
  if public.current_restaurant_staff_id() is distinct from identifier then raise exception 'Staff access disabled.' using errcode = '42501'; end if;
  select value into rows from public.app_state where key = 'sea_slash_inventory_v1' for update;
  select item into target from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) item where item ->> 'id' = p_item_id;
  if target is null then raise exception 'Ingredient no longer exists.'; end if;
  before_qty := (target ->> 'currentStock')::numeric; after_qty := before_qty + p_delta;
  if after_qty < 0 or after_qty > 1000000000 then raise exception 'Stock must stay between zero and one billion.'; end if;
  select jsonb_agg(case when item ->> 'id' = p_item_id then item || jsonb_build_object('currentStock', after_qty, 'lastUpdated', (now() at time zone 'Asia/Dhaka')::date::text) else item end order by pos)
    into rows from jsonb_array_elements(rows) with ordinality as records(item, pos);
  update public.app_state set value = rows, updated_at = now() where key = 'sea_slash_inventory_v1';
  insert into public.restaurant_inventory_adjustments (staff_id, user_id, item_id, quantity_before, quantity_after)
    values (identifier, auth.uid(), p_item_id, before_qty, after_qty);
  return public.get_chef_workspace();
end;
$$;
revoke all on function public.get_chef_workspace(), public.save_chef_profile(text,text), public.check_in_chef(), public.adjust_chef_inventory(text,numeric) from public, anon;
grant execute on function public.get_chef_workspace(), public.save_chef_profile(text,text), public.check_in_chef(), public.adjust_chef_inventory(text,numeric) to authenticated;


-- balance-security
-- Run after supabase-role-security.sql. Rerun this corrected migration even if
-- you applied the earlier version: managers retain ordinary ledger editing.

create or replace function public.guard_restaurant_balance_overrides()
returns trigger language plpgsql set search_path = '' as $$
declare previous_rows jsonb := '[]'::jsonb;
begin
  if tg_op = 'UPDATE' and new.key is distinct from old.key then
    raise exception 'State keys cannot be changed.' using errcode = '42501';
  end if;
  if public.is_restaurant_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.key in ('sea_slash_vendor_ledger_v1', 'sea_slash_commission_tracking_v1') then
      raise exception 'Administrator access required to override balances.' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.key = 'sea_slash_commission_tracking_v1' then
    raise exception 'Administrator access required to override commission balances.' using errcode = '42501';
  end if;
  if new.key = 'sea_slash_vendor_ledger_v1' then
    if not public.can_manage_restaurant() then
      raise exception 'Administrator or manager access required.' using errcode = '42501';
    end if;
    if jsonb_typeof(new.value) is distinct from 'array' then
      raise exception 'Ledger records must be an array.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(new.value) item
      where jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item -> 'id') is distinct from 'string' or item ->> 'id' = '')
      or exists (select 1 from jsonb_array_elements(new.value) item group by item ->> 'id' having count(*) > 1) then
      raise exception 'Ledger records must contain unique valid IDs.' using errcode = '22023';
    end if;
    if tg_op = 'UPDATE' then
      previous_rows := old.value;
    else
      -- Upserts fire INSERT before UPDATE; retain existing protected adjustments.
      select value into previous_rows from public.app_state where key = new.key;
      previous_rows := coalesce(previous_rows, '[]'::jsonb);
    end if;
    -- Only adjustment records are protected. Managers may add/edit/pay bills.
    if exists (select 1 from jsonb_array_elements(previous_rows) old_item
      where old_item ? 'balanceAdjustment'
      and not exists (select 1 from jsonb_array_elements(new.value) new_item where new_item = old_item))
      or exists (select 1 from jsonb_array_elements(new.value) new_item
      where new_item ? 'balanceAdjustment'
      and not exists (select 1 from jsonb_array_elements(previous_rows) old_item where old_item = new_item)) then
      raise exception 'Administrator access required to adjust final vendor balances.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_restaurant_balance_overrides() from public;
drop trigger if exists guard_restaurant_balance_overrides on public.app_state;
create trigger guard_restaurant_balance_overrides before insert or update or delete on public.app_state
for each row execute function public.guard_restaurant_balance_overrides();


-- advance-security
-- Run after supabase-role-security.sql. Safe to rerun; preserves existing records.

create or replace function public.guard_staff_advance_edits()
returns trigger language plpgsql set search_path = '' as $$
declare previous_rows jsonb := '[]'::jsonb;
begin
  if tg_op = 'UPDATE' and new.key is distinct from old.key then
    raise exception 'State keys cannot be changed.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if old.key = 'sea_slash_advances_v1' and not public.is_restaurant_admin() then
      raise exception 'Only administrators can edit salary advances or change repayment status.' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.key <> 'sea_slash_advances_v1' or public.is_restaurant_admin() then return new; end if;
  if not public.can_manage_restaurant() then raise exception 'Administrator or manager access required.' using errcode = '42501'; end if;
  if jsonb_typeof(new.value) is distinct from 'array' then raise exception 'Advances must be an array.'; end if;
  if tg_op = 'UPDATE' then previous_rows := old.value;
  else
    -- INSERT runs before conflict handling during upserts.
    select value into previous_rows from public.app_state where key = new.key;
    previous_rows := coalesce(previous_rows, '[]'::jsonb);
  end if;
  if exists (select 1 from jsonb_array_elements(new.value) r where jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r -> 'id') is distinct from 'string' or r ->> 'id' = '')
    or exists (select 1 from jsonb_array_elements(new.value) r group by r ->> 'id' having count(*) > 1) then raise exception 'Advances require unique valid IDs.'; end if;
  if exists (select 1 from jsonb_array_elements(previous_rows) old_row where not exists (select 1 from jsonb_array_elements(new.value) new_row where new_row = old_row)) then
    raise exception 'Only administrators can edit salary advances or change repayment status.' using errcode = '42501';
  end if;
  if exists (select 1 from jsonb_array_elements(new.value) r where not exists (select 1 from jsonb_array_elements(previous_rows) old_row where old_row = r) and r -> 'repaid' is distinct from 'false'::jsonb) then
    raise exception 'New salary advances must start unpaid.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_staff_advance_edits() from public;
drop trigger if exists guard_staff_advance_edits on public.app_state;
create trigger guard_staff_advance_edits before insert or update or delete on public.app_state
for each row execute function public.guard_staff_advance_edits();


-- admin-purchase-edit
-- Run after supabase-role-security.sql. Admin expense edits update purchase stock atomically.

create or replace function public.edit_restaurant_purchase(p_previous jsonb, p_purchase jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare stock jsonb; purchases jsonb; old_purchase jsonb; item jsonb; identifier text;
  qty numeric; price numeric; total numeric; next_stock numeric;
begin
  if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  if jsonb_typeof(p_purchase) is distinct from 'object' or jsonb_typeof(p_purchase -> 'id') is distinct from 'string' then raise exception 'Invalid purchase.'; end if;
  identifier := p_purchase ->> 'id';
  if identifier = '' or identifier is distinct from p_previous ->> 'id' then raise exception 'Purchase identity cannot change.'; end if;
  select value into stock from public.app_state where key = 'sea_slash_inventory_v1' for update;
  select value into purchases from public.app_state where key = 'sea_slash_purchases_v1' for update;
  select row into old_purchase from jsonb_array_elements(coalesce(purchases, '[]'::jsonb)) row where row ->> 'id' = identifier;
  if old_purchase is null then raise exception 'Original purchase no longer exists.'; end if;
  if old_purchase is distinct from p_previous then raise exception 'This purchase changed in another session. Reload before editing.'; end if;
  if p_purchase ->> 'itemId' is distinct from old_purchase ->> 'itemId' or p_purchase ->> 'unit' is distinct from old_purchase ->> 'unit'
    or p_purchase ->> 'itemName' is distinct from old_purchase ->> 'itemName' then raise exception 'The original ingredient and unit cannot change.'; end if;
  if jsonb_typeof(p_purchase -> 'quantity') is distinct from 'number' or jsonb_typeof(p_purchase -> 'unitPrice') is distinct from 'number' or jsonb_typeof(p_purchase -> 'totalCost') is distinct from 'number' then raise exception 'Enter valid purchase amounts.'; end if;
  qty := (p_purchase ->> 'quantity')::numeric; price := (p_purchase ->> 'unitPrice')::numeric; total := (p_purchase ->> 'totalCost')::numeric;
  if qty <= 0 or qty > 1000000000 or price <= 0 or price > 90071992547409 or total <= 0 or total > 90071992547409
    or qty::text in ('NaN','Infinity','-Infinity') or price::text in ('NaN','Infinity','-Infinity') or total::text in ('NaN','Infinity','-Infinity')
    or round(qty * price, 2) <> total then raise exception 'Quantity times unit price must equal the total bill.'; end if;
  if p_purchase ->> 'date' is null or p_purchase ->> 'date' !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p_purchase ->> 'date')::date, 'YYYY-MM-DD') <> p_purchase ->> 'date'
    or p_purchase ->> 'paymentMode' is null or p_purchase ->> 'paymentMode' not in ('cash','bkash','credit') then raise exception 'Choose a valid payment date and method.'; end if;
  select row into item from jsonb_array_elements(coalesce(stock, '[]'::jsonb)) row where row ->> 'id' = old_purchase ->> 'itemId';
  -- Financial corrections remain possible after an ingredient has been archived/deleted.
  if qty is distinct from (old_purchase ->> 'quantity')::numeric then
    if item is null then raise exception 'Original inventory item no longer exists; cannot change quantity.'; end if;
    if item ->> 'unit' is distinct from old_purchase ->> 'unit' then raise exception 'Inventory unit changed; cannot correct quantity in the old unit.'; end if;
    next_stock := round((item ->> 'currentStock')::numeric + qty - (old_purchase ->> 'quantity')::numeric, 6);
    if next_stock < 0 or next_stock > 1000000000 then raise exception 'This correction would make inventory stock negative or too large.'; end if;
    item := item || jsonb_build_object('currentStock', next_stock, 'lastUpdated', (now() at time zone 'Asia/Dhaka')::date::text);
  end if;
  if item is not null and item ->> 'unit' = old_purchase ->> 'unit' and
    (qty is distinct from (old_purchase ->> 'quantity')::numeric or price is distinct from (old_purchase ->> 'unitPrice')::numeric) then
    item := item || jsonb_build_object('unitCost', price);
    select jsonb_agg(case when row ->> 'id' = item ->> 'id' then item else row end order by pos) into stock from jsonb_array_elements(stock) with ordinality records(row,pos);
    update public.app_state set value = stock, updated_at = now() where key = 'sea_slash_inventory_v1';
  end if;
  select jsonb_agg(case when row ->> 'id' = identifier then p_purchase else row end order by pos) into purchases from jsonb_array_elements(purchases) with ordinality records(row,pos);
  update public.app_state set value = purchases, updated_at = now() where key = 'sea_slash_purchases_v1';
  return jsonb_build_object('purchases', purchases, 'inventory', coalesce(stock, '[]'::jsonb));
end;
$$;
revoke all on function public.edit_restaurant_purchase(jsonb,jsonb) from public, anon;
grant execute on function public.edit_restaurant_purchase(jsonb,jsonb) to authenticated;


-- vendor-inventory
-- Run after supabase-role-security.sql and the corrected supabase-balance-security.sql.
-- Vendor ledger and inventory are changed in the same database transaction.
-- Re-run this file to enable current-quantity replacements from vendor bills.
-- Historical additive receipts retain their original semantics; payment-only edits never reset stock.

create or replace function public.sync_vendor_bill_inventory()
returns trigger language plpgsql set search_path = '' as $$
declare
  before_rows jsonb := '[]'::jsonb; after_rows jsonb := '[]'::jsonb;
  stock jsonb; item jsonb; bill jsonb; previous_bill jsonb; item_id text;
  replacement_qty numeric; replacement_cost numeric;
  delta numeric; received numeric; qty numeric; factor numeric; next_qty numeric;
  cost numeric; stock_unit text; bill_unit text; rate numeric;
begin
  if tg_op = 'DELETE' then
    if old.key <> 'sea_slash_vendor_ledger_v1' then return old; end if;
    before_rows := old.value;
  else
    if new.key <> 'sea_slash_vendor_ledger_v1' then return new; end if;
    after_rows := new.value;
    if tg_op = 'UPDATE' then before_rows := old.value; end if;
  end if;
  if not exists (select 1 from jsonb_array_elements(before_rows || after_rows) r where r ? 'inventoryItemId' or r ? 'inventoryQuantity' or r ? 'inventoryUnit') then
    if tg_op = 'DELETE' then return old; end if; return new;
  end if;
  if not public.can_manage_restaurant() then raise exception 'Administrator or manager access required.' using errcode = '42501'; end if;
  select value into stock from public.app_state where key = 'sea_slash_inventory_v1' for update;
  if stock is null then raise exception 'Inventory is unavailable. No bill or stock change was saved.'; end if;
  for bill in select r from jsonb_array_elements(after_rows) r where r ? 'inventoryItemId' or r ? 'inventoryQuantity' or r ? 'inventoryUnit' loop
    select r into item from jsonb_array_elements(stock) r where r ->> 'id' = bill ->> 'inventoryItemId';
    if item is null then
      select r into previous_bill from jsonb_array_elements(before_rows) r where r ->> 'id' = bill ->> 'id';
      -- Historical receipts may outlive a deleted ingredient. Keep their financial
      -- history without blocking unrelated bills or payments. New/changed stock
      -- links must still point to an item that exists.
      if previous_bill is not null and
        jsonb_build_array(bill -> 'inventoryItemId', bill -> 'inventoryQuantity', bill -> 'inventoryUnit', bill -> 'quantity', bill -> 'unit', bill -> 'unitPrice', bill -> 'billed', bill->'inventoryUpdateMode')
        = jsonb_build_array(previous_bill -> 'inventoryItemId', previous_bill -> 'inventoryQuantity', previous_bill -> 'inventoryUnit', previous_bill -> 'quantity', previous_bill -> 'unit', previous_bill -> 'unitPrice', previous_bill -> 'billed', previous_bill->'inventoryUpdateMode') then
        continue;
      end if;
      raise exception 'Selected inventory item no longer exists. Select an existing item or create a new one.';
    end if;
    if bill ? 'inventoryUpdateMode' and bill->>'inventoryUpdateMode' is distinct from 'replace' then raise exception 'Invalid inventory update mode.';end if;
    stock_unit := item ->> 'unit'; bill_unit := bill ->> 'unit';
    if jsonb_typeof(bill -> 'inventoryItemId') is distinct from 'string' or bill ->> 'inventoryUnit' is distinct from stock_unit
      or jsonb_typeof(bill -> 'inventoryQuantity') is distinct from 'number' or jsonb_typeof(bill -> 'quantity') is distinct from 'number'
      or jsonb_typeof(bill -> 'billed') is distinct from 'number' or jsonb_typeof(bill -> 'unitPrice') is distinct from 'number'
      or bill ? 'balanceAdjustment' then raise exception 'Invalid inventory-linked bill.'; end if;
    received := (bill ->> 'inventoryQuantity')::numeric; qty := (bill ->> 'quantity')::numeric; cost := (bill ->> 'billed')::numeric; rate := (bill ->> 'unitPrice')::numeric;
    if received <= 0 or received > 1000000000 or qty <= 0 or qty > 1000000000 or cost <= 0 or cost > 90071992547409 or rate <= 0 or rate > 90071992547409
      or received::text in ('NaN','Infinity','-Infinity') or qty::text in ('NaN','Infinity','-Infinity') or cost::text in ('NaN','Infinity','-Infinity') or rate::text in ('NaN','Infinity','-Infinity')
      or round(qty * rate, 2) <> cost then raise exception 'Enter a valid bill quantity, unit price, total and received stock quantity.'; end if;
    factor := case when bill_unit = stock_unit or (bill_unit = 'g' and stock_unit = 'gram') then 1
      when bill_unit = 'g' and stock_unit = 'kg' then 0.001 when bill_unit = 'kg' and stock_unit = 'gram' then 1000
      when bill_unit = 'ml' and stock_unit = 'liter' then 0.001 when bill_unit = 'dozen' and stock_unit = 'pcs' then 12
      when bill_unit = 'pair' and stock_unit = 'pcs' then 2 else null end;
    if factor is not null and round(qty * factor, 6) <> received then raise exception 'Received stock does not match the bill unit and quantity.'; end if;
  end loop;
  for item_id in select distinct r ->> 'inventoryItemId' from jsonb_array_elements(before_rows || after_rows) r where r ? 'inventoryItemId' loop
    select r into item from jsonb_array_elements(stock) r where r ->> 'id' = item_id;
    select coalesce(sum((r ->> 'inventoryQuantity')::numeric), 0) into delta from jsonb_array_elements(after_rows) r where r ->> 'inventoryItemId' = item_id and coalesce(r->>'inventoryUpdateMode','add')<>'replace';
    select delta - coalesce(sum((r ->> 'inventoryQuantity')::numeric), 0) into delta from jsonb_array_elements(before_rows) r where r ->> 'inventoryItemId' = item_id and coalesce(r->>'inventoryUpdateMode','add')<>'replace' and not exists(select 1 from jsonb_array_elements(after_rows) newer where newer->>'id'=r->>'id' and newer->>'inventoryUpdateMode'='replace');
    cost := null; replacement_qty:=null; replacement_cost:=null;
    for bill in select r from jsonb_array_elements(after_rows) with ordinality rows(r,pos) where r ->> 'inventoryItemId' = item_id order by r->>'date',pos desc loop
      select r into previous_bill from jsonb_array_elements(before_rows) r where r ->> 'id' = bill ->> 'id';
      if jsonb_build_array(bill -> 'inventoryItemId', bill -> 'inventoryQuantity', bill -> 'inventoryUnit', bill -> 'billed', bill->'inventoryUpdateMode')
        is distinct from jsonb_build_array(previous_bill -> 'inventoryItemId', previous_bill -> 'inventoryQuantity', previous_bill -> 'inventoryUnit', previous_bill -> 'billed', previous_bill->'inventoryUpdateMode') then
        if bill->>'inventoryUpdateMode'='replace' then
          replacement_qty:=(bill->>'inventoryQuantity')::numeric;replacement_cost:=(bill->>'billed')::numeric/replacement_qty;
        else cost := (bill ->> 'billed')::numeric / (bill ->> 'inventoryQuantity')::numeric;end if;
      end if;
    end loop;
    if delta = 0 and cost is null and replacement_qty is null then continue; end if;
    -- A deleted item has no stock to reverse. Apply the receipt to the newly
    -- selected item (if any), while leaving all other existing stock intact.
    if item is null then continue; end if;
    if exists (select 1 from jsonb_array_elements(before_rows) r where r ->> 'inventoryItemId' = item_id and r ->> 'inventoryUnit' is distinct from item ->> 'unit') then
      raise exception 'Inventory unit changed; correct the linked bill before changing stock.';
    end if;
    next_qty := round(coalesce(replacement_qty,(item ->> 'currentStock')::numeric + delta), 6);
    if replacement_qty is not null then cost:=replacement_cost;end if;
    if next_qty < 0 or next_qty > 1000000000 then raise exception 'This bill change would make stock negative or too large. No changes saved.'; end if;
    item := item || jsonb_build_object('currentStock', next_qty, 'lastUpdated', (now() at time zone 'Asia/Dhaka')::date::text);
    if cost is not null then item := item || jsonb_build_object('unitCost', round(cost, 6)); end if;
    select jsonb_agg(case when r ->> 'id' = item_id then item else r end order by pos) into stock from jsonb_array_elements(stock) with ordinality rows(r,pos);
  end loop;
  update public.app_state set value = stock, updated_at = now() where key = 'sea_slash_inventory_v1' and value is distinct from stock;
  if tg_op = 'DELETE' then return old; end if; return new;
end;
$$;
revoke all on function public.sync_vendor_bill_inventory() from public;
drop trigger if exists sync_vendor_bill_inventory on public.app_state;
create trigger sync_vendor_bill_inventory after insert or update or delete on public.app_state
for each row execute function public.sync_vendor_bill_inventory();
create or replace function public.vendor_inventory_sync_ready()
returns boolean language sql stable set search_path = '' as $$
  select public.can_manage_restaurant() and exists (select 1 from pg_catalog.pg_trigger where tgname = 'sync_vendor_bill_inventory' and tgrelid = 'public.app_state'::regclass and tgenabled = 'O');
$$;
revoke all on function public.vendor_inventory_sync_ready() from public, anon;
grant execute on function public.vendor_inventory_sync_ready() to authenticated;
create or replace function public.vendor_inventory_replace_ready()
returns boolean language sql stable set search_path = '' as $$
  select public.vendor_inventory_sync_ready() and position('inventoryUpdateMode' in pg_catalog.pg_get_functiondef('public.sync_vendor_bill_inventory()'::regprocedure))>0;
$$;
revoke all on function public.vendor_inventory_replace_ready() from public,anon;
grant execute on function public.vendor_inventory_replace_ready() to authenticated;


-- vendor-inventory-create
-- Run after supabase-vendor-inventory.sql and the corrected balance migration.
-- Creates inventory and saves vendor bills in the same transaction.

create or replace function public.save_vendor_bill_inventory_item(p_bill jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare ledger jsonb; stock jsonb; item jsonb; previous_bill jsonb; qty numeric; total numeric; rate numeric; received numeric;
  bill_unit text; stock_unit text; name text; name_key text; category_id text; category_name text; category_rows jsonb; factor numeric; found_count integer; created boolean := false; next_bill jsonb;
begin
  if not public.can_manage_restaurant() then raise exception 'Administrator or manager access required.' using errcode = '42501'; end if;
  if not public.vendor_inventory_sync_ready() then raise exception 'Run supabase-vendor-inventory.sql first.'; end if;
  if jsonb_typeof(p_bill) is distinct from 'object' or coalesce(p_bill ->> 'id','') = '' or coalesce(p_bill ->> 'vendorId','') = '' or p_bill ? 'sourceExpenseId' or p_bill ? 'balanceAdjustment' then raise exception 'Choose a valid vendor bill.' using errcode = '22023'; end if;
  if not exists (select 1 from public.app_state s, lateral jsonb_array_elements(s.value) v where s.key = 'sea_slash_vendors_v1' and v ->> 'id' = p_bill ->> 'vendorId') then raise exception 'Vendor no longer exists.'; end if;
  name := btrim(p_bill ->> 'description'); name_key := lower(regexp_replace(name, '[[:space:][:punct:]]+', '', 'g'));
  qty := coalesce(p_bill ->> 'quantity', p_bill ->> 'quantityKg')::numeric;
  total := (p_bill ->> 'billed')::numeric;
  rate := coalesce(p_bill ->> 'unitPrice', p_bill ->> 'pricePerKg')::numeric;
  bill_unit := coalesce(p_bill ->> 'unit', case when p_bill ? 'quantityKg' then 'kg' end);
  if name is null or name = '' or length(name) > 500 or qty is null or qty <= 0 or qty > 1000000000 or total is null or total <= 0 or total > 90071992547409 or rate is null or rate <= 0 or rate > 90071992547409
    or qty::text in ('NaN','Infinity','-Infinity') or total::text in ('NaN','Infinity','-Infinity') or rate::text in ('NaN','Infinity','-Infinity') or round(qty * rate,2) <> total
    or bill_unit is null or bill_unit not in ('pcs','kg','g','liter','ml','bottle','packet','box','bag','carton','dozen','pair','inch','cm','mm','meter','foot','yard','roll','bundle') then
    raise exception 'Enter a valid quantity, unit and bill total before creating inventory.' using errcode = '22023';
  end if;
  if coalesce(p_bill ->> 'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Enter a valid date.' using errcode = '22023'; end if;
  begin
    if to_char((p_bill ->> 'date')::date,'YYYY-MM-DD') <> p_bill ->> 'date' then raise exception 'Enter a valid date.' using errcode = '22023'; end if;
  exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Enter a valid date.' using errcode = '22023';
  end;
  if jsonb_typeof(p_bill -> 'paid') is distinct from 'number' then raise exception 'Enter a valid payment amount.' using errcode = '22023'; end if;
  if (p_bill ->> 'paid')::numeric < 0 or (p_bill ->> 'paid')::numeric > 90071992547409 or (p_bill ->> 'paid') in ('NaN','Infinity','-Infinity') then raise exception 'Enter a valid payment amount.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vendor-inventory-create',0));
  insert into public.app_state(key,value) values ('sea_slash_vendor_ledger_v1','[]'::jsonb) on conflict(key) do nothing;
  select value into ledger from public.app_state where key = 'sea_slash_vendor_ledger_v1' for update;
  select r into previous_bill from jsonb_array_elements(ledger) r where r ->> 'id' = p_bill ->> 'id';
  if previous_bill ? 'balanceAdjustment' and not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  insert into public.app_state(key,value) values ('sea_slash_inventory_v1','[]'::jsonb) on conflict(key) do nothing;
  select value into stock from public.app_state where key = 'sea_slash_inventory_v1' for update;
  select count(*) into found_count from jsonb_array_elements(stock) r where lower(regexp_replace(btrim(r ->> 'name'),'[[:space:][:punct:]]+','','g')) = name_key or lower(regexp_replace(btrim(r ->> 'banglaName'),'[[:space:][:punct:]]+','','g')) = name_key;
  if found_count > 1 then raise exception 'Several inventory items have this name. Select the correct existing item.'; end if;
  select r into item from jsonb_array_elements(stock) r where lower(regexp_replace(btrim(r ->> 'name'),'[[:space:][:punct:]]+','','g')) = name_key or lower(regexp_replace(btrim(r ->> 'banglaName'),'[[:space:][:punct:]]+','','g')) = name_key;
  if item is null then
    category_id := coalesce(nullif(p_bill ->> 'inventoryCategoryId',''), 'uncategorized');
    category_name := btrim(coalesce(p_bill ->> 'inventoryCategoryName',''));
    select value into category_rows from public.app_state where key = 'sea_slash_inventory_categories_v1' for update;
    category_rows := coalesce(category_rows,'[]'::jsonb);
    if category_name <> '' then
      if not public.is_restaurant_admin() then raise exception 'Administrator access required to create inventory categories.' using errcode = '42501'; end if;
      if length(category_name) > 100 then raise exception 'Category name must be at most 100 characters.'; end if;
      select r ->> 'id' into category_id from jsonb_array_elements(category_rows) r where lower(btrim(r ->> 'name')) = lower(category_name) limit 1;
      if category_id is null then
        category_id := 'vendor-category-' || gen_random_uuid();
        category_rows := category_rows || jsonb_build_array(jsonb_build_object('id',category_id,'name',category_name));
        insert into public.app_state(key,value) values ('sea_slash_inventory_categories_v1',category_rows) on conflict(key) do update set value = excluded.value, updated_at = now();
      end if;
    elsif category_id <> 'uncategorized' and not exists (select 1 from jsonb_array_elements(category_rows) r where r ->> 'id' = category_id) and not exists (select 1 from jsonb_array_elements(stock) r where r ->> 'category' = category_id) then
      raise exception 'Select an existing inventory category.';
    end if;
    item := jsonb_build_object('id','vendor-item-' || gen_random_uuid(),'name',name,'category',category_id,'currentStock',0,'unit',bill_unit,'minThreshold',0,'unitCost',0,'lastUpdated',(now() at time zone 'Asia/Dhaka')::date::text);
    stock := stock || jsonb_build_array(item); created := true;
    update public.app_state set value = stock, updated_at = now() where key = 'sea_slash_inventory_v1';
  end if;
  stock_unit := item ->> 'unit';
  factor := case when bill_unit = stock_unit or (bill_unit = 'g' and stock_unit = 'gram') then 1 when bill_unit = 'g' and stock_unit = 'kg' then 0.001 when bill_unit = 'kg' and stock_unit = 'gram' then 1000 when bill_unit = 'ml' and stock_unit = 'liter' then 0.001 when bill_unit = 'dozen' and stock_unit = 'pcs' then 12 when bill_unit = 'pair' and stock_unit = 'pcs' then 2 else null end;
  if factor is null then raise exception 'Select the inventory item and enter received stock in its original unit.' using errcode = '22023'; end if;
  received := round(qty * factor,6);
  next_bill := (p_bill - 'createInventoryItem' - 'inventoryCategoryId' - 'inventoryCategoryName' - 'quantityKg' - 'pricePerKg') || jsonb_build_object('description',name,'quantity',qty,'unit',bill_unit,'unitPrice',rate,'inventoryItemId',item ->> 'id','inventoryQuantity',received,'inventoryUnit',stock_unit);
  select coalesce(jsonb_agg(r order by pos),'[]'::jsonb) into ledger from jsonb_array_elements(ledger) with ordinality records(r,pos) where r ->> 'id' <> p_bill ->> 'id';
  ledger := jsonb_build_array(next_bill) || ledger;
  update public.app_state set value = ledger, updated_at = now() where key = 'sea_slash_vendor_ledger_v1';
  select value into stock from public.app_state where key = 'sea_slash_inventory_v1';
  return jsonb_build_object('ledger',ledger,'inventory',stock,'created',created,'itemId',item ->> 'id');
end;
$$;
drop function if exists public.import_vendor_inventory_items();
drop function if exists public.import_vendor_inventory_items(jsonb);
revoke all on function public.save_vendor_bill_inventory_item(jsonb) from public, anon;
grant execute on function public.save_vendor_bill_inventory_item(jsonb) to authenticated;


-- chef-stock-security
-- Apply to an existing project. Do not rerun older role migrations.

create or replace function public.adjust_chef_inventory(p_item_id text, p_delta numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare identifier text := public.current_restaurant_staff_id(); rows jsonb; target jsonb; before_qty numeric; after_qty numeric;
begin
  if identifier is null or public.restaurant_access_role() <> 'chef' then raise exception 'Active chef login required.' using errcode = '42501'; end if;
  if p_delta is null or p_delta::text in ('NaN', 'Infinity', '-Infinity') or p_delta = 0 or abs(p_delta) > 10000 then raise exception 'Invalid stock adjustment.'; end if;
  if p_delta > 0 then raise exception 'Chefs can only decrease stock.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(identifier, 0));
  if public.current_restaurant_staff_id() is distinct from identifier then raise exception 'Staff access disabled.' using errcode = '42501'; end if;
  select value into rows from public.app_state where key = 'sea_slash_inventory_v1' for update;
  select item into target from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) item where item ->> 'id' = p_item_id;
  if target is null then raise exception 'Ingredient no longer exists.'; end if;
  before_qty := (target ->> 'currentStock')::numeric; after_qty := before_qty + p_delta;
  if after_qty < 0 or after_qty > 1000000000 then raise exception 'Stock must stay between zero and one billion.'; end if;
  select jsonb_agg(case when item ->> 'id' = p_item_id then item || jsonb_build_object('currentStock', after_qty, 'lastUpdated', (now() at time zone 'Asia/Dhaka')::date::text) else item end order by pos)
    into rows from jsonb_array_elements(rows) with ordinality as records(item, pos);
  update public.app_state set value = rows, updated_at = now() where key = 'sea_slash_inventory_v1';
  insert into public.restaurant_inventory_adjustments (staff_id, user_id, item_id, quantity_before, quantity_after)
    values (identifier, auth.uid(), p_item_id, before_qty, after_qty);
  return public.get_chef_workspace();
end;
$$;
revoke all on function public.adjust_chef_inventory(text,numeric) from public, anon;
grant execute on function public.adjust_chef_inventory(text,numeric) to authenticated;


-- attendance-checkin
-- Run after supabase-role-security.sql. Existing attendance is preserved.
-- Adds admin-managed hours and server-stamped per-second earnings for new check-ins.

create or replace function public.get_restaurant_work_schedule()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare schedule jsonb;
begin
  if not public.can_manage_restaurant() and public.current_restaurant_staff_id() is null then raise exception 'Staff login required.' using errcode='42501'; end if;
  select value into schedule from public.app_state where key='sea_slash_work_schedule_v1';
  return coalesce(schedule,jsonb_build_object('start','11:00','end','23:00'));
end;
$$;

create or replace function public.protect_restaurant_work_schedule()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='UPDATE' and old.key='sea_slash_work_schedule_v1' and new.key is distinct from old.key then
    if not public.is_restaurant_admin() then raise exception 'Only administrators can change office hours.' using errcode='42501'; end if;
    return new;
  end if;
  if (case when tg_op='DELETE' then old.key else new.key end) <> 'sea_slash_work_schedule_v1' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if not public.is_restaurant_admin() then raise exception 'Only administrators can change office hours.' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if;
  if coalesce(new.value->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or coalesce(new.value->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or new.value->>'start'=new.value->>'end' then raise exception 'Choose different valid start and end times.'; end if;
  return new;
end;
$$;
drop trigger if exists protect_restaurant_work_schedule on public.app_state;
create trigger protect_restaurant_work_schedule before insert or update or delete on public.app_state for each row execute function public.protect_restaurant_work_schedule();

create or replace function public.save_restaurant_work_schedule(p_start text,p_end text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare schedule jsonb := jsonb_build_object('start',p_start,'end',p_end);
begin
  if not public.is_restaurant_admin() then raise exception 'Only administrators can change office hours.' using errcode='42501'; end if;
  insert into public.app_state(key,value) values ('sea_slash_work_schedule_v1',schedule)
    on conflict(key) do update set value=excluded.value,updated_at=now();
  return schedule;
end;
$$;

-- Internal helper: resolve overnight shifts using Bangladesh civil time.
create or replace function public.restaurant_current_work_shift()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare schedule jsonb := public.get_restaurant_work_schedule(); local_now timestamp := now() at time zone 'Asia/Dhaka';
  day date := local_now::date; start_time time := (schedule->>'start')::time; end_time time := (schedule->>'end')::time;
  start_at timestamptz; end_at timestamptz; employee jsonb;
begin
  select profile into employee from public.restaurant_staff where id=public.current_restaurant_staff_id();
  if employee->>'salaryType'='hourly' and jsonb_typeof(employee->'hourlyWorkSchedule')='object' then
    schedule:=employee->'hourlyWorkSchedule';
    start_time:=(schedule->>'start')::time; end_time:=(schedule->>'end')::time;
  end if;
  if end_time < start_time and local_now::time < end_time then day := day-1; end if;
  -- A start shortly after midnight opens on the previous calendar day.
  if local_now >= day+end_time+(case when end_time < start_time then interval '1 day' else interval '0 days' end)
    and local_now >= day+start_time+interval '1 day'-interval '10 minutes' then day := day+1; end if;
  start_at := (day+start_time) at time zone 'Asia/Dhaka';
  end_at := (day+end_time+case when end_time < start_time then interval '1 day' else interval '0 days' end) at time zone 'Asia/Dhaka';
  return jsonb_build_object('date',day::text,'shiftStartAt',start_at,'shiftEndAt',end_at);
end;
$$;

create or replace function public.restaurant_checkin_window(p_shift jsonb, p_now timestamptz)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_now >= (p_shift->>'shiftStartAt')::timestamptz-interval '10 minutes'
    and p_now < (p_shift->>'shiftEndAt')::timestamptz, false);
$$;
revoke all on function public.restaurant_checkin_window(jsonb,timestamptz) from public,anon,authenticated;

-- Existing shift snapshots cannot be changed by managers or chefs.
create or replace function public.protect_staff_earnings_snapshot()
returns trigger language plpgsql set search_path = '' as $$
declare old_rows jsonb := '[]'::jsonb; row jsonb; previous jsonb; shift jsonb; employee jsonb; rate numeric;
  snapshot_keys text[] := array['checkedInAt','shiftStartAt','shiftEndAt','salaryPerSecond'];
begin
  if new.key <> 'sea_slash_attendance_v1' or public.is_restaurant_admin() then return new; end if;
  if tg_op='UPDATE' then old_rows := old.value; end if;
  for row in select value from jsonb_array_elements(new.value) loop
    select r into previous from jsonb_array_elements(old_rows) r where r->>'id'=row->>'id';
    if previous is not null then
      if jsonb_build_array(row->'checkedInAt',row->'shiftStartAt',row->'shiftEndAt',row->'salaryPerSecond',row->'staffId',row->'date')
        is distinct from jsonb_build_array(previous->'checkedInAt',previous->'shiftStartAt',previous->'shiftEndAt',previous->'salaryPerSecond',previous->'staffId',previous->'date') then
        raise exception 'Only administrators can change attendance timestamps or salary rates.' using errcode='42501';
      end if;
    elsif row ?| snapshot_keys then
      if row->>'staffId' is distinct from public.current_restaurant_staff_id() then raise exception 'Only your own check-in may start live earnings.' using errcode='42501'; end if;
      shift := public.restaurant_current_work_shift();
      if not public.restaurant_checkin_window(shift,now()) then
        raise exception 'Attendance opens 10 minutes before shift start and closes at shift end.' using errcode='42501';
      end if;
      select profile into employee from public.restaurant_staff where id=public.current_restaurant_staff_id();
      rate := case when employee->>'salaryType'='hourly' then (employee->>'baseSalary')::numeric / 3600 else (employee->>'baseSalary')::numeric / case when employee->>'salaryType'='daily' then 1 else 30 end
        / extract(epoch from ((shift->>'shiftEndAt')::timestamptz-(shift->>'shiftStartAt')::timestamptz)) end;
      if (row->>'checkedInAt')::timestamptz is distinct from now() or row->>'date' is distinct from shift->>'date'
        or row->>'status' is distinct from 'present'
        or (row->>'shiftStartAt')::timestamptz is distinct from (shift->>'shiftStartAt')::timestamptz
        or (row->>'shiftEndAt')::timestamptz is distinct from (shift->>'shiftEndAt')::timestamptz
        or (row->>'salaryPerSecond')::numeric is distinct from rate then
        raise exception 'Use staff check-in to record earnings.' using errcode='42501';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists protect_staff_earnings_snapshot on public.app_state;
create trigger protect_staff_earnings_snapshot before insert or update on public.app_state for each row execute function public.protect_staff_earnings_snapshot();

create or replace function public.get_staff_checkin_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare identifier text := public.current_restaurant_staff_id(); employee jsonb; attendance jsonb;
  shift jsonb; day text;
begin
  if identifier is null or coalesce(public.restaurant_access_role(), '') not in ('chef', 'manager') then
    raise exception 'Active staff login required.' using errcode = '42501';
  end if;
  shift := public.restaurant_current_work_shift(); day := shift->>'date';
  select profile into employee from public.restaurant_staff where id = identifier;
  select item into attendance from public.app_state state,
    lateral jsonb_array_elements(case when jsonb_typeof(state.value) = 'array' then state.value else '[]'::jsonb end) item
    where state.key = 'sea_slash_attendance_v1' and item ->> 'staffId' = identifier and item ->> 'date' = day limit 1;
  return jsonb_build_object('name', employee ->> 'name', 'date', day, 'status', attendance ->> 'status', 'attendance', attendance, 'serverNow', now(),
    'checkInOpensAt',(shift->>'shiftStartAt')::timestamptz-interval '10 minutes',
    'checkInClosesAt',(shift->>'shiftEndAt')::timestamptz,
    'nextCheckInOpensAt',(shift->>'shiftStartAt')::timestamptz-interval '10 minutes'+case when now() >= (shift->>'shiftEndAt')::timestamptz then interval '1 day' else interval '0 days' end);
end;
$$;

create or replace function public.check_in_restaurant_staff()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare identifier text := public.current_restaurant_staff_id(); rows jsonb; employee jsonb; rate numeric;
  shift jsonb; day text;
begin
  if identifier is null or coalesce(public.restaurant_access_role(), '') not in ('chef', 'manager') then
    raise exception 'Active staff login required.' using errcode = '42501';
  end if;
  shift := public.restaurant_current_work_shift(); day := shift->>'date';
  perform pg_advisory_xact_lock(hashtextextended(identifier, 0));
  if public.current_restaurant_staff_id() is distinct from identifier then
    raise exception 'Staff access disabled.' using errcode = '42501';
  end if;
  if day::date < (select (profile ->> 'joinDate')::date from public.restaurant_staff where id = identifier) then
    raise exception 'Your start date is in the future.';
  end if;
  insert into public.app_state (key, value) values ('sea_slash_attendance_v1', '[]'::jsonb) on conflict (key) do nothing;
  select value into rows from public.app_state where key = 'sea_slash_attendance_v1' for update;
  if not exists (select 1 from jsonb_array_elements(rows) item where item ->> 'staffId' = identifier and item ->> 'date' = day) then
    if not public.restaurant_checkin_window(shift,now()) then
      raise exception 'Attendance opens 10 minutes before shift start and closes at shift end. Check the scheduled hours (Bangladesh time).' using errcode='42501';
    end if;
    select profile into employee from public.restaurant_staff where id=identifier;
    rate := case when employee->>'salaryType'='hourly' then (employee->>'baseSalary')::numeric / 3600 else (employee->>'baseSalary')::numeric / case when employee->>'salaryType'='daily' then 1 else 30 end
      / extract(epoch from ((shift->>'shiftEndAt')::timestamptz-(shift->>'shiftStartAt')::timestamptz)) end;
    rows := rows || jsonb_build_array(jsonb_build_object('id', 'attendance-' || gen_random_uuid(),
      'staffId', identifier, 'date', day, 'status', 'present', 'checkedInAt', now(),
      'shiftStartAt',shift->'shiftStartAt','shiftEndAt',shift->'shiftEndAt','salaryPerSecond',rate));
    update public.app_state set value = rows, updated_at = now() where key = 'sea_slash_attendance_v1';
  end if;
  return public.get_staff_checkin_status();
end;
$$;

revoke all on function public.get_staff_checkin_status(), public.check_in_restaurant_staff() from public, anon;
grant execute on function public.get_staff_checkin_status(), public.check_in_restaurant_staff() to authenticated;
-- Route the legacy chef button through the same trusted check-in path.
create or replace function public.check_in_chef()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.restaurant_access_role() <> 'chef' then raise exception 'Active chef login required.' using errcode='42501'; end if;
  perform public.check_in_restaurant_staff();
  return public.get_chef_workspace();
end;
$$;
revoke all on function public.get_restaurant_work_schedule(), public.save_restaurant_work_schedule(text,text), public.restaurant_current_work_shift(), public.protect_restaurant_work_schedule(), public.protect_staff_earnings_snapshot(), public.check_in_chef() from public, anon;
revoke all on function public.restaurant_current_work_shift() from authenticated;
grant execute on function public.get_restaurant_work_schedule(), public.save_restaurant_work_schedule(text,text), public.check_in_chef() to authenticated;


-- hourly-salary
-- Requires existing role and attendance setup. Preserves attendance snapshots.
-- Adds hourly rates and optional individual schedules for hourly staff.

create or replace function public.save_restaurant_staff_profile(p_profile jsonb)
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

create or replace function public.restaurant_current_work_shift()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare schedule jsonb := public.get_restaurant_work_schedule(); local_now timestamp := now() at time zone 'Asia/Dhaka';
  day date := local_now::date; start_time time := (schedule->>'start')::time; end_time time := (schedule->>'end')::time;
  start_at timestamptz; end_at timestamptz; employee jsonb;
begin
  select profile into employee from public.restaurant_staff where id=public.current_restaurant_staff_id();
  if employee->>'salaryType'='hourly' and jsonb_typeof(employee->'hourlyWorkSchedule')='object' then
    schedule:=employee->'hourlyWorkSchedule';
    start_time:=(schedule->>'start')::time; end_time:=(schedule->>'end')::time;
  end if;
  if end_time < start_time and local_now::time < end_time then day := day-1; end if;
  -- A start shortly after midnight opens on the previous calendar day.
  if local_now >= day+end_time+(case when end_time < start_time then interval '1 day' else interval '0 days' end)
    and local_now >= day+start_time+interval '1 day'-interval '10 minutes' then day := day+1; end if;
  start_at := (day+start_time) at time zone 'Asia/Dhaka';
  end_at := (day+end_time+case when end_time < start_time then interval '1 day' else interval '0 days' end) at time zone 'Asia/Dhaka';
  return jsonb_build_object('date',day::text,'shiftStartAt',start_at,'shiftEndAt',end_at);
end;
$$;

create or replace function public.protect_staff_earnings_snapshot()
returns trigger language plpgsql set search_path = '' as $$
declare old_rows jsonb := '[]'::jsonb; row jsonb; previous jsonb; shift jsonb; employee jsonb; rate numeric;
  snapshot_keys text[] := array['checkedInAt','shiftStartAt','shiftEndAt','salaryPerSecond'];
begin
  if new.key <> 'sea_slash_attendance_v1' or public.is_restaurant_admin() then return new; end if;
  if tg_op='UPDATE' then old_rows := old.value; end if;
  for row in select value from jsonb_array_elements(new.value) loop
    select r into previous from jsonb_array_elements(old_rows) r where r->>'id'=row->>'id';
    if previous is not null then
      if jsonb_build_array(row->'checkedInAt',row->'shiftStartAt',row->'shiftEndAt',row->'salaryPerSecond',row->'staffId',row->'date')
        is distinct from jsonb_build_array(previous->'checkedInAt',previous->'shiftStartAt',previous->'shiftEndAt',previous->'salaryPerSecond',previous->'staffId',previous->'date') then
        raise exception 'Only administrators can change attendance timestamps or salary rates.' using errcode='42501';
      end if;
    elsif row ?| snapshot_keys then
      if row->>'staffId' is distinct from public.current_restaurant_staff_id() then raise exception 'Only your own check-in may start live earnings.' using errcode='42501'; end if;
      shift := public.restaurant_current_work_shift();
      if not public.restaurant_checkin_window(shift,now()) then
        raise exception 'Attendance opens 10 minutes before shift start and closes at shift end.' using errcode='42501';
      end if;
      select profile into employee from public.restaurant_staff where id=public.current_restaurant_staff_id();
      rate := case when employee->>'salaryType'='hourly' then (employee->>'baseSalary')::numeric / 3600 else (employee->>'baseSalary')::numeric / case when employee->>'salaryType'='daily' then 1 else 30 end
        / extract(epoch from ((shift->>'shiftEndAt')::timestamptz-(shift->>'shiftStartAt')::timestamptz)) end;
      if (row->>'checkedInAt')::timestamptz is distinct from now() or row->>'date' is distinct from shift->>'date'
        or row->>'status' is distinct from 'present'
        or (row->>'shiftStartAt')::timestamptz is distinct from (shift->>'shiftStartAt')::timestamptz
        or (row->>'shiftEndAt')::timestamptz is distinct from (shift->>'shiftEndAt')::timestamptz
        or (row->>'salaryPerSecond')::numeric is distinct from rate then
        raise exception 'Use staff check-in to record earnings.' using errcode='42501';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.check_in_restaurant_staff()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare identifier text := public.current_restaurant_staff_id(); rows jsonb; employee jsonb; rate numeric;
  shift jsonb; day text;
begin
  if identifier is null or coalesce(public.restaurant_access_role(), '') not in ('chef', 'manager') then
    raise exception 'Active staff login required.' using errcode = '42501';
  end if;
  shift := public.restaurant_current_work_shift(); day := shift->>'date';
  perform pg_advisory_xact_lock(hashtextextended(identifier, 0));
  if public.current_restaurant_staff_id() is distinct from identifier then
    raise exception 'Staff access disabled.' using errcode = '42501';
  end if;
  if day::date < (select (profile ->> 'joinDate')::date from public.restaurant_staff where id = identifier) then
    raise exception 'Your start date is in the future.';
  end if;
  insert into public.app_state (key, value) values ('sea_slash_attendance_v1', '[]'::jsonb) on conflict (key) do nothing;
  select value into rows from public.app_state where key = 'sea_slash_attendance_v1' for update;
  if not exists (select 1 from jsonb_array_elements(rows) item where item ->> 'staffId' = identifier and item ->> 'date' = day) then
    if not public.restaurant_checkin_window(shift,now()) then
      raise exception 'Attendance opens 10 minutes before shift start and closes at shift end. Check the scheduled hours (Bangladesh time).' using errcode='42501';
    end if;
    select profile into employee from public.restaurant_staff where id=identifier;
    rate := case when employee->>'salaryType'='hourly' then (employee->>'baseSalary')::numeric / 3600 else (employee->>'baseSalary')::numeric / case when employee->>'salaryType'='daily' then 1 else 30 end
      / extract(epoch from ((shift->>'shiftEndAt')::timestamptz-(shift->>'shiftStartAt')::timestamptz)) end;
    rows := rows || jsonb_build_array(jsonb_build_object('id', 'attendance-' || gen_random_uuid(),
      'staffId', identifier, 'date', day, 'status', 'present', 'checkedInAt', now(),
      'shiftStartAt',shift->'shiftStartAt','shiftEndAt',shift->'shiftEndAt','salaryPerSecond',rate));
    update public.app_state set value = rows, updated_at = now() where key = 'sea_slash_attendance_v1';
  end if;
  return public.get_staff_checkin_status();
end;
$$;

revoke all on function public.save_restaurant_staff_profile(jsonb) from public, anon, authenticated;


-- staff-salary-sheet
-- Run after supabase-role-security.sql and supabase-staff-security.sql.
-- Read-only salary-sheet data for the currently signed-in employee.

create or replace function public.get_my_salary_sheet_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare identifier text := public.current_restaurant_staff_id(); portal jsonb; payments jsonb;
begin
  if identifier is null or coalesce(public.restaurant_access_role(),'') not in ('chef','manager','admin') then
    raise exception 'Active staff login required.' using errcode='42501';
  end if;
  portal := public.get_staff_portal();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item->>'id','date',item->>'date','amount',item->'amount','category','payroll',
    'staffId',identifier,'salaryMonth',item->>'salaryMonth','paymentMode',item->>'paymentMode'
  )), '[]'::jsonb) into payments from public.app_state state,
    lateral jsonb_array_elements(case when state.key='sea_slash_expenses_v1' and jsonb_typeof(state.value)='array' then state.value else '[]'::jsonb end) item
    where state.key='sea_slash_expenses_v1' and item->>'staffId'=identifier and item->>'category'='payroll'
      and coalesce(item->>'source','')='' and coalesce(item->>'paymentMode','')<>'credit';
  return portal || jsonb_build_object('expenses',payments,'serverNow',now());
end;
$$;
revoke all on function public.get_my_salary_sheet_data() from public,anon;
grant execute on function public.get_my_salary_sheet_data() to authenticated;


-- public-menu
-- Run after supabase-role-security.sql. Publishes only customer-menu fields.

create table if not exists public.restaurant_public_menu (
  id boolean primary key default true check(id),
  menu jsonb not null,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.restaurant_public_menu enable row level security;
revoke all on public.restaurant_public_menu from public,anon,authenticated;
grant all on public.restaurant_public_menu to service_role;

create or replace function public.get_public_restaurant_menu()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('settings',m.menu->'settings','items',coalesce((
    select jsonb_agg(item order by (item->>'sortOrder')::integer,item->>'name')
    from jsonb_array_elements(m.menu->'items') item where item->>'published'='true'
  ),'[]'::jsonb)) from public.restaurant_public_menu m where id=true;
$$;
create or replace function public.get_admin_restaurant_menu()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
  return (select jsonb_build_object('menu',menu,'updatedAt',updated_at) from public.restaurant_public_menu where id=true);
end;
$$;
create or replace function public.save_public_restaurant_menu(p_menu jsonb,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_revision timestamptz; item jsonb; clean_items jsonb:='[]'::jsonb; settings jsonb; clean_menu jsonb; field text; price numeric;
begin
  if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
  if jsonb_typeof(p_menu) is distinct from 'object' or jsonb_typeof(p_menu->'settings') is distinct from 'object' or jsonb_typeof(p_menu->'items') is distinct from 'array' then raise exception 'Invalid menu.';end if;
  if jsonb_array_length(p_menu->'items')>500 then raise exception 'A menu can contain up to 500 dishes.';end if;
  settings:=p_menu->'settings';
  foreach field in array array['headline','subtitle','footer'] loop
    if jsonb_typeof(settings->field) is distinct from 'string' then raise exception 'Enter valid display text.';end if;
  end loop;
  if length(btrim(settings->>'headline')) not between 1 and 100 or length(settings->>'subtitle')>160 or length(settings->>'footer')>160
    or jsonb_typeof(settings->'slideSeconds') is distinct from 'number' then raise exception 'Enter valid display text and rotation time.';end if;
  if (settings->>'slideSeconds')::numeric not between 8 and 60 or (settings->>'slideSeconds')::numeric <> trunc((settings->>'slideSeconds')::numeric) then raise exception 'Rotation time must be 8 to 60 seconds.';end if;
  if coalesce(settings->>'layout','gallery') not in ('gallery','board') then raise exception 'Choose a valid menu layout.';end if;
  for item in select value from jsonb_array_elements(p_menu->'items') loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid dish.';end if;
    foreach field in array array['id','name','description','category','photoUrl','badge'] loop
      if jsonb_typeof(item->field) is distinct from 'string' then raise exception 'Enter valid dish details.';end if;
    end loop;
    if length(item->>'id') not between 1 and 100 or length(btrim(item->>'name')) not between 1 and 100
      or length(btrim(item->>'category')) not between 1 and 60 or length(item->>'description')>300 or length(item->>'badge')>30 then raise exception 'Enter a dish name, category and short description.';end if;
    if exists(select 1 from jsonb_array_elements(clean_items) r where r->>'id'=item->>'id') then raise exception 'Duplicate dish ID.';end if;
    if jsonb_typeof(item->'price') is distinct from 'number' or jsonb_typeof(item->'sortOrder') is distinct from 'number'
      or jsonb_typeof(item->'published') is distinct from 'boolean' or jsonb_typeof(item->'available') is distinct from 'boolean' then raise exception 'Invalid price or dish visibility.';end if;
    price:=(item->>'price')::numeric;
    if price < 0 or price>10000000 or round(price,2)<>price or (item->>'sortOrder')::numeric not between 0 and 1000000 or trunc((item->>'sortOrder')::numeric)<>(item->>'sortOrder')::numeric then raise exception 'Enter a valid price and display order.';end if;
    if length(item->>'photoUrl')>2000 or ((item->>'photoUrl')<>'' and (item->>'photoUrl') !~* '^https://[^[:space:]]+$') then raise exception 'Use an HTTPS photo URL.';end if;
    -- Rebuild safe customer-facing fields. Never copy costs, ingredients or payroll.
    clean_items:=clean_items||jsonb_build_array(jsonb_build_object('id',item->>'id','name',btrim(item->>'name'),'description',item->>'description',
      'category',btrim(item->>'category'),'price',item->'price','photoUrl',item->>'photoUrl','badge',item->>'badge','available',item->'available','published',item->'published','sortOrder',item->'sortOrder'));
  end loop;
  if coalesce(settings->>'priceStyle','ribbon') not in ('ribbon','brush','seal') then raise exception 'Choose a valid price label style.';end if;
  if settings ? 'hotDealIds' then
    if jsonb_typeof(settings->'hotDealIds') is distinct from 'array' then raise exception 'Choose existing dishes for Hot Deals.';end if;
    if jsonb_array_length(settings->'hotDealIds')>500 or exists(select 1 from jsonb_array_elements(settings->'hotDealIds') id where jsonb_typeof(id)<>'string' or not exists(select 1 from jsonb_array_elements(clean_items) dish where dish->>'id'=id#>>'{}'))
      or (select count(*) from jsonb_array_elements(settings->'hotDealIds'))<>(select count(distinct id) from jsonb_array_elements(settings->'hotDealIds') id) then raise exception 'Choose different existing dishes for Hot Deals.';end if;
  end if;
  if settings ? 'hotDealSeconds' then
    if jsonb_typeof(settings->'hotDealSeconds') is distinct from 'number' then raise exception 'Hot Deals timer must be 5 to 300 seconds.';end if;
    if (settings->>'hotDealSeconds')::numeric not between 5 and 300 or trunc((settings->>'hotDealSeconds')::numeric)<>(settings->>'hotDealSeconds')::numeric then raise exception 'Hot Deals timer must be 5 to 300 seconds.';end if;
  end if;
  clean_menu:=jsonb_build_object('settings',jsonb_build_object('headline',btrim(settings->>'headline'),'subtitle',settings->>'subtitle','footer',settings->>'footer','slideSeconds',settings->'slideSeconds','layout',coalesce(settings->>'layout','gallery'),'priceStyle',coalesce(settings->>'priceStyle','ribbon'),'hotDealIds',coalesce(settings->'hotDealIds','[]'::jsonb),'hotDealSeconds',coalesce(settings->'hotDealSeconds','10'::jsonb)),'items',clean_items);
  perform pg_advisory_xact_lock(hashtextextended('restaurant-public-menu',0));
  select updated_at into current_revision from public.restaurant_public_menu where id=true for update;
  if current_revision is distinct from p_expected_updated_at then raise exception 'The menu changed in another session. Reload before saving.' using errcode='40001';end if;
  insert into public.restaurant_public_menu(id,menu) values(true,clean_menu)
    on conflict(id) do update set menu=excluded.menu,updated_at=clock_timestamp();
  return public.get_admin_restaurant_menu();
end;
$$;

insert into public.restaurant_public_menu(id,menu) values(true,'{"settings":{"headline":"Sea Slash Menu","subtitle":"Welcome to Sea Slash.","footer":"Sea Slash","slideSeconds":15,"layout":"gallery"},"items":[]}') on conflict(id) do nothing;
revoke all on function public.get_public_restaurant_menu(),public.get_admin_restaurant_menu(),public.save_public_restaurant_menu(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.get_public_restaurant_menu() to anon,authenticated;
grant execute on function public.get_admin_restaurant_menu(),public.save_public_restaurant_menu(jsonb,timestamptz) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('menu-photos','menu-photos',true,4194304,array['image/jpeg','image/png','image/webp'])
  on conflict(id) do update set public=true,file_size_limit=4194304,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Customer menu photo reads" on storage.objects;
create policy "Customer menu photo reads" on storage.objects for select to anon,authenticated using(bucket_id='menu-photos');
drop policy if exists "Admin menu photo inserts" on storage.objects;
create policy "Admin menu photo inserts" on storage.objects for insert to authenticated with check(bucket_id='menu-photos' and public.is_restaurant_admin());
drop policy if exists "Admin menu photo updates" on storage.objects;
create policy "Admin menu photo updates" on storage.objects for update to authenticated using(bucket_id='menu-photos' and public.is_restaurant_admin()) with check(bucket_id='menu-photos' and public.is_restaurant_admin());
drop policy if exists "Admin menu photo deletes" on storage.objects;
create policy "Admin menu photo deletes" on storage.objects for delete to authenticated using(bucket_id='menu-photos' and public.is_restaurant_admin());
-- Keep older permissive storage policies from granting writes to menu photos.
drop policy if exists "Protect menu photo inserts" on storage.objects;
create policy "Protect menu photo inserts" on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'menu-photos' or public.is_restaurant_admin());
drop policy if exists "Protect menu photo updates" on storage.objects;
create policy "Protect menu photo updates" on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'menu-photos' or public.is_restaurant_admin()) with check(bucket_id<>'menu-photos' or public.is_restaurant_admin());
drop policy if exists "Protect menu photo deletes" on storage.objects;
create policy "Protect menu photo deletes" on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'menu-photos' or public.is_restaurant_admin());


-- investment-partner
-- SEA SLASH ONLY: run after the initial database setup. Repeatable; existing contributions are preserved.

create table if not exists public.restaurant_investment_partners (
 user_id uuid primary key references auth.users(id),email text not null unique,active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.restaurant_investment_partners enable row level security;
revoke all on public.restaurant_investment_partners from public,anon,authenticated;
create table if not exists public.restaurant_investment_funding (
 id boolean primary key default true check(id),funding jsonb not null,updated_at timestamptz not null default clock_timestamp()
);
alter table public.restaurant_investment_funding enable row level security;
revoke all on public.restaurant_investment_funding from public,anon,authenticated;
insert into public.restaurant_investment_funding(id,funding) values(true,
 '{"target":null,"investors":[{"id":"owner","name":"Owner","share":50,"openingPaid":260000},{"id":"nazmul","name":"Nazmul Hossain","share":50,"openingPaid":240000}],"payments":[]}'::jsonb
) on conflict(id) do nothing;
-- Enable the named partner only if their login already exists. Reruns preserve revocations.
insert into public.restaurant_investment_partners(user_id,email,active)
 select u.id,lower(u.email),true from auth.users u where lower(u.email)='seaslash.nazmul@gmail.com'
 and not exists(select 1 from public.sea_slash_owner where user_id=u.id)
 and not exists(select 1 from public.restaurant_staff_accounts where user_id=u.id)
 on conflict(user_id) do nothing;
create or replace function public.restaurant_access_role()
returns text language sql stable security definer set search_path='' as $$
 select case when auth.uid()=(select user_id from public.sea_slash_owner where id=true)
  and lower(auth.jwt()->>'email')=(select email from public.sea_slash_owner where id=true) then 'admin'
  when exists(select 1 from public.restaurant_investment_partners where user_id=auth.uid() and active=true) then 'partner'
  else (select s.access_role from public.restaurant_staff s join public.restaurant_staff_accounts a on a.staff_id=s.id
   where a.user_id=auth.uid() and (s.profile->>'active')::boolean=true and coalesce(s.profile->>'archivedAt','')='') end;
$$;
revoke all on function public.restaurant_access_role() from public;
grant execute on function public.restaurant_access_role() to anon,authenticated;
create or replace function public.get_investment_workspace()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(public.restaurant_access_role(),'') not in ('admin','partner') then raise exception 'Investment access required.' using errcode='42501';end if;
 return (select jsonb_build_object('funding',funding,'updatedAt',updated_at,'entries',coalesce((select value from public.app_state where key='sea_slash_investments_v1'),'[]'::jsonb)) from public.restaurant_investment_funding where id=true);
end;
$$;
create or replace function public.save_investment_funding(p_funding jsonb,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare investor jsonb;payment jsonb;ids text[]:='{}';payments text[]:='{}';shares numeric:=0;amount numeric;
begin
 if not public.is_restaurant_admin() then raise exception 'Only the administrator can change investment contributions.' using errcode='42501';end if;
 if jsonb_typeof(p_funding) is distinct from 'object' or jsonb_typeof(p_funding->'investors') is distinct from 'array' or jsonb_typeof(p_funding->'payments') is distinct from 'array' or jsonb_array_length(p_funding->'investors') not between 2 and 10 or jsonb_array_length(p_funding->'payments')>10000 then raise exception 'Invalid investment funding records.';end if;
 if p_funding->'target' is distinct from 'null'::jsonb then
  if jsonb_typeof(p_funding->'target') is distinct from 'number' then raise exception 'Invalid investment budget.';end if;
  amount:=(p_funding->>'target')::numeric;if amount<0 or amount>1000000000000 or round(amount,2)<>amount then raise exception 'Invalid investment budget.';end if;
 end if;
 for investor in select value from jsonb_array_elements(p_funding->'investors') loop
  if coalesce(investor->>'id','')='' or investor->>'id'=any(ids) or length(investor->>'id')>100 or coalesce(btrim(investor->>'name'),'')='' or length(investor->>'name')>100 or jsonb_typeof(investor->'share') is distinct from 'number' or jsonb_typeof(investor->'openingPaid') is distinct from 'number' then raise exception 'Invalid investor.';end if;
  ids:=array_append(ids,investor->>'id');amount:=(investor->>'share')::numeric;
  if amount<=0 or amount>100 or round(amount,2)<>amount then raise exception 'Invalid share.';end if;shares:=shares+amount;
  amount:=(investor->>'openingPaid')::numeric;if amount<0 or amount>1000000000000 or round(amount,2)<>amount then raise exception 'Invalid opening contribution.';end if;
 end loop;
 if shares<>100 then raise exception 'Shares must total 100 percent.';end if;
 for payment in select value from jsonb_array_elements(p_funding->'payments') loop
  if coalesce(payment->>'id','')='' or payment->>'id'=any(payments) or not coalesce(payment->>'investorId'=any(ids),false) or coalesce(payment->>'date','')!~'^\d{4}-\d{2}-\d{2}$' or to_char((payment->>'date')::date,'YYYY-MM-DD')<>payment->>'date' or jsonb_typeof(payment->'amount') is distinct from 'number' or jsonb_typeof(payment->'note') is distinct from 'string' or length(payment->>'note')>500 then raise exception 'Invalid contribution.';end if;
  payments:=array_append(payments,payment->>'id');amount:=(payment->>'amount')::numeric;
  if amount<=0 or amount>1000000000000 or round(amount,2)<>amount then raise exception 'Invalid contribution amount.';end if;
 end loop;
 update public.restaurant_investment_funding set funding=p_funding,updated_at=clock_timestamp() where id=true and updated_at=p_expected_updated_at;
 if not found then raise exception 'Investment contributions changed in another session. Refresh before saving.';end if;
 return public.get_investment_workspace();
end;
$$;
create or replace function public.list_investment_partners()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'email',email,'active',active) order by email),'[]'::jsonb) from public.restaurant_investment_partners);
end;
$$;
create or replace function public.set_investment_partner(p_email text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare identifier uuid;
begin
 if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
 if p_active is null then raise exception 'Choose whether access is enabled.';end if;
 select id into identifier from auth.users where lower(email)=lower(btrim(p_email));
 if identifier is null then raise exception 'Create this partner account in Supabase Authentication > Users first, then enable access here.';end if;
 if exists(select 1 from public.sea_slash_owner where user_id=identifier) or exists(select 1 from public.restaurant_staff_accounts where user_id=identifier) then raise exception 'Use a separate partner account, not an administrator or staff account.';end if;
 insert into public.restaurant_investment_partners(user_id,email,active) values(identifier,lower(btrim(p_email)),p_active)
 on conflict(user_id) do update set email=excluded.email,active=excluded.active;
end;
$$;
revoke all on function public.get_investment_workspace(),public.save_investment_funding(jsonb,timestamptz),public.list_investment_partners(),public.set_investment_partner(text,boolean) from public,anon,authenticated;
grant execute on function public.get_investment_workspace(),public.save_investment_funding(jsonb,timestamptz),public.list_investment_partners(),public.set_investment_partner(text,boolean) to authenticated;


commit;
