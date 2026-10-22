-- Run after the existing admin, staff, expense and investment migrations.
begin;

alter table public.restaurant_staff add column if not exists access_role text not null default 'chef'
  check (access_role in ('chef', 'manager', 'admin'));

create or replace function public.restaurant_access_role()
returns text language sql stable security definer set search_path = '' as $$
  select case when auth.uid() = '410baf80-c3ed-4b8c-b312-3e0519a61948'::uuid
    and lower(auth.jwt() ->> 'email') = 'officialmughalmahal@gmail.com' then 'admin'
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
commit;
