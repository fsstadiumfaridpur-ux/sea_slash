-- Run after supabase-role-security.sql. Existing attendance is preserved.
-- Adds admin-managed hours and server-stamped per-second earnings for new check-ins.
begin;

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
commit;
