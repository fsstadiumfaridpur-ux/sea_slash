-- Apply to an existing project. Do not rerun older role migrations.
begin;
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
commit;
