-- Run after supabase-role-security.sql. Rerun this corrected migration even if
-- you applied the earlier version: managers retain ordinary ledger editing.
begin;
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
commit;
