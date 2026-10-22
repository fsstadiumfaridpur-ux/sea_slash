-- Run after supabase-vendor-inventory.sql and the corrected balance migration.
-- Creates inventory and saves vendor bills in the same transaction.
begin;
create or replace function public.save_vendor_bill_inventory_item(p_bill jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare ledger jsonb; stock jsonb; item jsonb; previous_bill jsonb; qty numeric; total numeric; rate numeric; received numeric;
  bill_unit text; stock_unit text; name text; name_key text; category_id text; category_name text; category_rows jsonb; factor numeric; found_count integer; created boolean := false; next_bill jsonb;
begin
  if not public.can_manage_restaurant() then raise exception 'Administrator or manager access required.' using errcode = '42501'; end if;
  if not public.vendor_inventory_sync_ready() then raise exception 'Run supabase-vendor-inventory.sql first.'; end if;
  if jsonb_typeof(p_bill) is distinct from 'object' or coalesce(p_bill ->> 'id','') = '' or coalesce(p_bill ->> 'vendorId','') = '' or p_bill ? 'sourceExpenseId' or p_bill ? 'balanceAdjustment' then raise exception 'Choose a valid vendor bill.' using errcode = '22023'; end if;
  if not exists (select 1 from public.app_state s, lateral jsonb_array_elements(s.value) v where s.key = 'sea_slash_vendors_v1' and v ->> 'id' = p_bill ->> 'vendorId') then raise exception 'Vendor no longer exists.'; end if;
  name := btrim(p_bill ->> 'description'); name_key := lower(regexp_replace(name, '[[:space:][:punct:]]+', '', 'g'));
  qty := coalesce(p_bill ->> 'quantity', p_bill ->> 'quantityKg')::numeric;
  total := (p_bill ->> 'billed')::numeric;
  rate := coalesce(p_bill ->> 'unitPrice', p_bill ->> 'pricePerKg')::numeric;
  bill_unit := coalesce(p_bill ->> 'unit', case when p_bill ? 'quantityKg' then 'kg' end);
  if name is null or name = '' or length(name) > 500 or qty is null or qty <= 0 or qty > 1000000000 or total is null or total <= 0 or total > 90071992547409 or rate is null or rate <= 0 or rate > 90071992547409
    or qty::text in ('NaN','Infinity','-Infinity') or total::text in ('NaN','Infinity','-Infinity') or rate::text in ('NaN','Infinity','-Infinity') or round(qty * rate,2) <> total
    or bill_unit is null or bill_unit not in ('pcs','kg','g','liter','ml','bottle','packet','box','bag','carton','dozen','pair','inch','cm','mm','meter','foot','yard','roll','bundle') then
    raise exception 'Enter a valid quantity, unit and bill total before creating inventory.' using errcode = '22023';
  end if;
  if coalesce(p_bill ->> 'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Enter a valid date.' using errcode = '22023'; end if;
  begin
    if to_char((p_bill ->> 'date')::date,'YYYY-MM-DD') <> p_bill ->> 'date' then raise exception 'Enter a valid date.' using errcode = '22023'; end if;
  exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Enter a valid date.' using errcode = '22023';
  end;
  if jsonb_typeof(p_bill -> 'paid') is distinct from 'number' then raise exception 'Enter a valid payment amount.' using errcode = '22023'; end if;
  if (p_bill ->> 'paid')::numeric < 0 or (p_bill ->> 'paid')::numeric > 90071992547409 or (p_bill ->> 'paid') in ('NaN','Infinity','-Infinity') then raise exception 'Enter a valid payment amount.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vendor-inventory-create',0));
  insert into public.app_state(key,value) values ('sea_slash_vendor_ledger_v1','[]'::jsonb) on conflict(key) do nothing;
  select value into ledger from public.app_state where key = 'sea_slash_vendor_ledger_v1' for update;
  select r into previous_bill from jsonb_array_elements(ledger) r where r ->> 'id' = p_bill ->> 'id';
  if previous_bill ? 'balanceAdjustment' and not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  insert into public.app_state(key,value) values ('sea_slash_inventory_v1','[]'::jsonb) on conflict(key) do nothing;
  select value into stock from public.app_state where key = 'sea_slash_inventory_v1' for update;
  select count(*) into found_count from jsonb_array_elements(stock) r where lower(regexp_replace(btrim(r ->> 'name'),'[[:space:][:punct:]]+','','g')) = name_key or lower(regexp_replace(btrim(r ->> 'banglaName'),'[[:space:][:punct:]]+','','g')) = name_key;
  if found_count > 1 then raise exception 'Several inventory items have this name. Select the correct existing item.'; end if;
  select r into item from jsonb_array_elements(stock) r where lower(regexp_replace(btrim(r ->> 'name'),'[[:space:][:punct:]]+','','g')) = name_key or lower(regexp_replace(btrim(r ->> 'banglaName'),'[[:space:][:punct:]]+','','g')) = name_key;
  if item is null then
    category_id := coalesce(nullif(p_bill ->> 'inventoryCategoryId',''), 'uncategorized');
    category_name := btrim(coalesce(p_bill ->> 'inventoryCategoryName',''));
    select value into category_rows from public.app_state where key = 'sea_slash_inventory_categories_v1' for update;
    category_rows := coalesce(category_rows,'[]'::jsonb);
    if category_name <> '' then
      if not public.is_restaurant_admin() then raise exception 'Administrator access required to create inventory categories.' using errcode = '42501'; end if;
      if length(category_name) > 100 then raise exception 'Category name must be at most 100 characters.'; end if;
      select r ->> 'id' into category_id from jsonb_array_elements(category_rows) r where lower(btrim(r ->> 'name')) = lower(category_name) limit 1;
      if category_id is null then
        category_id := 'vendor-category-' || gen_random_uuid();
        category_rows := category_rows || jsonb_build_array(jsonb_build_object('id',category_id,'name',category_name));
        insert into public.app_state(key,value) values ('sea_slash_inventory_categories_v1',category_rows) on conflict(key) do update set value = excluded.value, updated_at = now();
      end if;
    elsif category_id <> 'uncategorized' and not exists (select 1 from jsonb_array_elements(category_rows) r where r ->> 'id' = category_id) and not exists (select 1 from jsonb_array_elements(stock) r where r ->> 'category' = category_id) then
      raise exception 'Select an existing inventory category.';
    end if;
    item := jsonb_build_object('id','vendor-item-' || gen_random_uuid(),'name',name,'category',category_id,'currentStock',0,'unit',bill_unit,'minThreshold',0,'unitCost',0,'lastUpdated',(now() at time zone 'Asia/Dhaka')::date::text);
    stock := stock || jsonb_build_array(item); created := true;
    update public.app_state set value = stock, updated_at = now() where key = 'sea_slash_inventory_v1';
  end if;
  stock_unit := item ->> 'unit';
  factor := case when bill_unit = stock_unit or (bill_unit = 'g' and stock_unit = 'gram') then 1 when bill_unit = 'g' and stock_unit = 'kg' then 0.001 when bill_unit = 'kg' and stock_unit = 'gram' then 1000 when bill_unit = 'ml' and stock_unit = 'liter' then 0.001 when bill_unit = 'dozen' and stock_unit = 'pcs' then 12 when bill_unit = 'pair' and stock_unit = 'pcs' then 2 else null end;
  if factor is null then raise exception 'Select the inventory item and enter received stock in its original unit.' using errcode = '22023'; end if;
  received := round(qty * factor,6);
  next_bill := (p_bill - 'createInventoryItem' - 'inventoryCategoryId' - 'inventoryCategoryName' - 'quantityKg' - 'pricePerKg') || jsonb_build_object('description',name,'quantity',qty,'unit',bill_unit,'unitPrice',rate,'inventoryItemId',item ->> 'id','inventoryQuantity',received,'inventoryUnit',stock_unit);
  select coalesce(jsonb_agg(r order by pos),'[]'::jsonb) into ledger from jsonb_array_elements(ledger) with ordinality records(r,pos) where r ->> 'id' <> p_bill ->> 'id';
  ledger := jsonb_build_array(next_bill) || ledger;
  update public.app_state set value = ledger, updated_at = now() where key = 'sea_slash_vendor_ledger_v1';
  select value into stock from public.app_state where key = 'sea_slash_inventory_v1';
  return jsonb_build_object('ledger',ledger,'inventory',stock,'created',created,'itemId',item ->> 'id');
end;
$$;
drop function if exists public.import_vendor_inventory_items();
drop function if exists public.import_vendor_inventory_items(jsonb);
revoke all on function public.save_vendor_bill_inventory_item(jsonb) from public, anon;
grant execute on function public.save_vendor_bill_inventory_item(jsonb) to authenticated;
commit;
