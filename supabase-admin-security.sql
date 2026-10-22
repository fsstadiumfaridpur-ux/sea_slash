begin;

-- The account was provisioned using Supabase Auth; its password is never stored here.
create or replace function public.is_restaurant_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    auth.uid() = '410baf80-c3ed-4b8c-b312-3e0519a61948'::uuid
    and lower(auth.jwt() ->> 'email') = 'officialmughalmahal@gmail.com',
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

commit;
