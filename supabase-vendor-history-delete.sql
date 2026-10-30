-- Run in Sea Slash Supabase SQL Editor. Safe to run again.
-- Managers retain add/edit access; only admins may remove vendor history.
begin;
create or replace function public.guard_vendor_history_deletions()
returns trigger language plpgsql security definer set search_path = public as $$
declare previous jsonb; remaining jsonb; removed jsonb;
begin
  if TG_OP = 'INSERT' then return NEW; end if;
  if OLD.key not in ('sea_slash_vendor_ledger_v1','sea_slash_expenses_v1') then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;
  if TG_OP = 'UPDATE' and NEW.key is distinct from OLD.key then raise exception 'Cannot rename financial records.'; end if;
  if public.is_restaurant_admin() then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;
  previous := coalesce(OLD.value,'[]'::jsonb);
  remaining := case when TG_OP = 'DELETE' then '[]'::jsonb else NEW.value end;
  if jsonb_typeof(previous) <> 'array' or jsonb_typeof(remaining) <> 'array' then raise exception 'Invalid financial records.'; end if;
  for removed in select row from jsonb_array_elements(previous) row where not exists (
    select 1 from jsonb_array_elements(remaining) next where next->>'id'=row->>'id'
  ) loop
    if OLD.key='sea_slash_vendor_ledger_v1' or (
      coalesce(removed->>'source','')='' and coalesce(removed->>'category','') not in ('rent','commission','payroll')
      and (coalesce(trim(removed->>'vendorId'),'')<>'' or coalesce(trim(removed->>'vendor'),'')<>'')
    ) then raise exception 'Only an administrator can delete vendor bills or payments.'; end if;
  end loop;
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end $$;
drop trigger if exists guard_vendor_history_deletions on public.app_state;
create trigger guard_vendor_history_deletions before update or delete on public.app_state
for each row execute function public.guard_vendor_history_deletions();

create or replace function public.delete_vendor_history_entry(p_key text,p_id text,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare records jsonb; original jsonb; replacement jsonb;
begin
  if not coalesce(public.is_restaurant_admin(),false) then raise exception 'Only an administrator can delete vendor bills or payments.'; end if;
  if p_key not in ('sea_slash_vendor_ledger_v1','sea_slash_expenses_v1') or p_key is null or coalesce(p_id,'')='' then raise exception 'Invalid vendor history record.'; end if;
  select value into records from public.app_state where key=p_key for update;
  select row into original from jsonb_array_elements(coalesce(records,'[]'::jsonb)) row where row->>'id'=p_id;
  if original is null then raise exception 'This entry was already deleted. Reload the vendor history.'; end if;
  if original is distinct from p_expected then raise exception 'This entry changed in another session. Reload before deleting.'; end if;
  if p_key='sea_slash_expenses_v1' and (
    coalesce(original->>'source','')<>'' or coalesce(original->>'category','') in ('rent','commission','payroll')
    or (coalesce(trim(original->>'vendorId'),'')='' and coalesce(trim(original->>'vendor'),'')='')
  ) then raise exception 'This is not a vendor expense payment.'; end if;
  select coalesce(jsonb_agg(row order by position),'[]'::jsonb) into replacement
    from jsonb_array_elements(records) with ordinality as entries(row,position) where row->>'id' is distinct from p_id;
  -- Existing inventory sync remains atomic with receipt deletion.
  update public.app_state set value=replacement,updated_at=clock_timestamp() where key=p_key;
  return jsonb_build_object(
    'ledger',coalesce((select value from public.app_state where key='sea_slash_vendor_ledger_v1'),'[]'::jsonb),
    'expenses',coalesce((select value from public.app_state where key='sea_slash_expenses_v1'),'[]'::jsonb),
    'inventory',coalesce((select value from public.app_state where key='sea_slash_inventory_v1'),'[]'::jsonb));
end $$;
revoke all on function public.guard_vendor_history_deletions() from public,anon,authenticated;
revoke all on function public.delete_vendor_history_entry(text,text,jsonb) from public,anon;
grant execute on function public.delete_vendor_history_entry(text,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
