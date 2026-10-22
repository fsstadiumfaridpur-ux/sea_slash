-- Run after supabase-role-security.sql. Safe to rerun; preserves existing records.
begin;
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
commit;
