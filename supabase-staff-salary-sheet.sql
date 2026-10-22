-- Run after supabase-role-security.sql and supabase-staff-security.sql.
-- Read-only salary-sheet data for the currently signed-in employee.
begin;
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
commit;
