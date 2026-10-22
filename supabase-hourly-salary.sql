-- Requires existing role and attendance setup. Preserves attendance snapshots.
-- Adds hourly rates and optional individual schedules for hourly staff.
begin;

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
commit;
