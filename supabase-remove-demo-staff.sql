-- One-time permanent removal of the five original demo profiles only.
-- Run in Supabase SQL Editor after archiving them in the app.
-- Real staff deletions must continue to use the app's archive workflow.
begin;
lock table public.restaurant_staff, public.restaurant_staff_accounts,
  public.restaurant_staff_agreements, public.app_state in share row exclusive mode;

create temporary table demo_staff_to_remove on commit drop as
select staff.id
from public.restaurant_staff staff
join (values
  ('staff-1', 'Md. Rafiqul Baburchi'),
  ('staff-2', 'Kabir Hossain'),
  ('staff-3', 'Belal Mia'),
  ('staff-4', 'Sohel Rana'),
  ('staff-5', 'Babu Chandra')
) as demo(id, name) on staff.id = demo.id and staff.profile ->> 'name' = demo.name
where staff.profile ->> 'active' = 'false'
  and nullif(staff.profile ->> 'archivedAt', '') is not null
  and not exists (select 1 from public.restaurant_staff_accounts account where account.staff_id = staff.id)
  and not exists (select 1 from public.restaurant_staff_agreements agreement where agreement.staff_id = staff.id);

-- Remove the legacy copy too, so rerunning the migration cannot resurrect demos.
update public.app_state state
set value = (
  select coalesce(jsonb_agg(record.item order by record.position), '[]'::jsonb)
  from jsonb_array_elements(state.value) with ordinality as record(item, position)
  where not exists (
    select 1 from demo_staff_to_remove demo
    where demo.id = case when state.key = 'sea_slash_staff_v1' then record.item ->> 'id' else record.item ->> 'staffId' end
  )
), updated_at = now()
where state.key in ('sea_slash_staff_v1', 'sea_slash_attendance_v1', 'sea_slash_advances_v1')
  and jsonb_typeof(state.value) = 'array';

delete from public.restaurant_staff staff using demo_staff_to_remove demo where staff.id = demo.id;
select count(*) as permanently_removed_demo_profiles from demo_staff_to_remove;
commit;
