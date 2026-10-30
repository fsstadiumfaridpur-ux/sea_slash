-- Run after supabase-role-security.sql and the corrected supabase-balance-security.sql.
-- Vendor ledger and inventory are changed in the same database transaction.
-- Re-run this file to enable current-quantity replacements from vendor bills.
-- Historical additive receipts retain their original semantics; payment-only edits never reset stock.
begin;
create or replace function public.sync_vendor_bill_inventory()
returns trigger language plpgsql set search_path = '' as $$
declare
  before_rows jsonb := '[]'::jsonb; after_rows jsonb := '[]'::jsonb;
  stock jsonb; item jsonb; bill jsonb; previous_bill jsonb; item_id text;
  replacement_qty numeric; replacement_cost numeric;
  delta numeric; received numeric; qty numeric; factor numeric; next_qty numeric;
  cost numeric; stock_unit text; bill_unit text; rate numeric;
begin
  if tg_op = 'DELETE' then
    if old.key <> 'sea_slash_vendor_ledger_v1' then return old; end if;
    before_rows := old.value;
  else
    if new.key <> 'sea_slash_vendor_ledger_v1' then return new; end if;
    after_rows := new.value;
    if tg_op = 'UPDATE' then before_rows := old.value; end if;
  end if;
  if not exists (select 1 from jsonb_array_elements(before_rows || after_rows) r where r ? 'inventoryItemId' or r ? 'inventoryQuantity' or r ? 'inventoryUnit') then
    if tg_op = 'DELETE' then return old; end if; return new;
  end if;
  if not public.can_manage_restaurant() then raise exception 'Administrator or manager access required.' using errcode = '42501'; end if;
  select value into stock from public.app_state where key = 'sea_slash_inventory_v1' for update;
  if stock is null then raise exception 'Inventory is unavailable. No bill or stock change was saved.'; end if;
  for bill in select r from jsonb_array_elements(after_rows) r where r ? 'inventoryItemId' or r ? 'inventoryQuantity' or r ? 'inventoryUnit' loop
    -- Validate changed receipts only. Old quantityKg receipts and receipts whose
    -- item/unit changed later must not block unrelated bills or payment edits.
    select r into previous_bill from jsonb_array_elements(before_rows) r where r ->> 'id' = bill ->> 'id';
    if previous_bill is not null and
      jsonb_build_array(bill -> 'inventoryItemId',bill -> 'inventoryQuantity',bill -> 'inventoryUnit',bill -> 'quantity',bill -> 'unit',bill -> 'unitPrice',bill -> 'quantityKg',bill -> 'pricePerKg',bill -> 'billed',bill -> 'inventoryUpdateMode',bill ? 'balanceAdjustment',bill -> 'balanceAdjustment')
      = jsonb_build_array(previous_bill -> 'inventoryItemId',previous_bill -> 'inventoryQuantity',previous_bill -> 'inventoryUnit',previous_bill -> 'quantity',previous_bill -> 'unit',previous_bill -> 'unitPrice',previous_bill -> 'quantityKg',previous_bill -> 'pricePerKg',previous_bill -> 'billed',previous_bill -> 'inventoryUpdateMode',previous_bill ? 'balanceAdjustment',previous_bill -> 'balanceAdjustment') then
      continue;
    end if;
    select r into item from jsonb_array_elements(stock) r where r ->> 'id' = bill ->> 'inventoryItemId';
    if item is null then
      select r into previous_bill from jsonb_array_elements(before_rows) r where r ->> 'id' = bill ->> 'id';
      -- Historical receipts may outlive a deleted ingredient. Keep their financial
      -- history without blocking unrelated bills or payments. New/changed stock
      -- links must still point to an item that exists.
      if previous_bill is not null and
        jsonb_build_array(bill -> 'inventoryItemId', bill -> 'inventoryQuantity', bill -> 'inventoryUnit', bill -> 'quantity', bill -> 'unit', bill -> 'unitPrice', bill -> 'billed', bill->'inventoryUpdateMode')
        = jsonb_build_array(previous_bill -> 'inventoryItemId', previous_bill -> 'inventoryQuantity', previous_bill -> 'inventoryUnit', previous_bill -> 'quantity', previous_bill -> 'unit', previous_bill -> 'unitPrice', previous_bill -> 'billed', previous_bill->'inventoryUpdateMode') then
        continue;
      end if;
      raise exception 'Selected inventory item no longer exists. Select an existing item or create a new one.';
    end if;
    if bill ? 'inventoryUpdateMode' and bill->>'inventoryUpdateMode' is distinct from 'replace' then raise exception 'Invalid inventory update mode.';end if;
    stock_unit := item ->> 'unit'; bill_unit := bill ->> 'unit';
    if jsonb_typeof(bill -> 'inventoryItemId') is distinct from 'string' or bill ->> 'inventoryUnit' is distinct from stock_unit
      or jsonb_typeof(bill -> 'inventoryQuantity') is distinct from 'number' or jsonb_typeof(bill -> 'quantity') is distinct from 'number'
      or jsonb_typeof(bill -> 'billed') is distinct from 'number' or jsonb_typeof(bill -> 'unitPrice') is distinct from 'number'
      or bill ? 'balanceAdjustment' then raise exception 'Invalid inventory-linked bill.'; end if;
    received := (bill ->> 'inventoryQuantity')::numeric; qty := (bill ->> 'quantity')::numeric; cost := (bill ->> 'billed')::numeric; rate := (bill ->> 'unitPrice')::numeric;
    if received <= 0 or received > 1000000000 or qty <= 0 or qty > 1000000000 or cost <= 0 or cost > 90071992547409 or rate <= 0 or rate > 90071992547409
      or received::text in ('NaN','Infinity','-Infinity') or qty::text in ('NaN','Infinity','-Infinity') or cost::text in ('NaN','Infinity','-Infinity') or rate::text in ('NaN','Infinity','-Infinity')
      or round(qty * rate, 2) <> cost then raise exception 'Enter a valid bill quantity, unit price, total and received stock quantity.'; end if;
    factor := case when bill_unit = stock_unit or (bill_unit = 'g' and stock_unit = 'gram') then 1
      when bill_unit = 'g' and stock_unit = 'kg' then 0.001 when bill_unit = 'kg' and stock_unit = 'gram' then 1000
      when bill_unit = 'ml' and stock_unit = 'liter' then 0.001 when bill_unit = 'dozen' and stock_unit = 'pcs' then 12
      when bill_unit = 'pair' and stock_unit = 'pcs' then 2 else null end;
    if factor is not null and round(qty * factor, 6) <> received then raise exception 'Received stock does not match the bill unit and quantity.'; end if;
  end loop;
  for item_id in select distinct r ->> 'inventoryItemId' from jsonb_array_elements(before_rows || after_rows) r where r ? 'inventoryItemId' loop
    select r into item from jsonb_array_elements(stock) r where r ->> 'id' = item_id;
    select coalesce(sum((r ->> 'inventoryQuantity')::numeric), 0) into delta from jsonb_array_elements(after_rows) r where r ->> 'inventoryItemId' = item_id and coalesce(r->>'inventoryUpdateMode','add')<>'replace';
    select delta - coalesce(sum((r ->> 'inventoryQuantity')::numeric), 0) into delta from jsonb_array_elements(before_rows) r where r ->> 'inventoryItemId' = item_id and coalesce(r->>'inventoryUpdateMode','add')<>'replace' and not exists(select 1 from jsonb_array_elements(after_rows) newer where newer->>'id'=r->>'id' and newer->>'inventoryUpdateMode'='replace');
    cost := null; replacement_qty:=null; replacement_cost:=null;
    for bill in select r from jsonb_array_elements(after_rows) with ordinality rows(r,pos) where r ->> 'inventoryItemId' = item_id order by r->>'date',pos desc loop
      select r into previous_bill from jsonb_array_elements(before_rows) r where r ->> 'id' = bill ->> 'id';
      if jsonb_build_array(bill -> 'inventoryItemId', bill -> 'inventoryQuantity', bill -> 'inventoryUnit', bill -> 'billed', bill->'inventoryUpdateMode')
        is distinct from jsonb_build_array(previous_bill -> 'inventoryItemId', previous_bill -> 'inventoryQuantity', previous_bill -> 'inventoryUnit', previous_bill -> 'billed', previous_bill->'inventoryUpdateMode') then
        if bill->>'inventoryUpdateMode'='replace' then
          replacement_qty:=(bill->>'inventoryQuantity')::numeric;replacement_cost:=(bill->>'billed')::numeric/replacement_qty;
        else cost := (bill ->> 'billed')::numeric / (bill ->> 'inventoryQuantity')::numeric;end if;
      end if;
    end loop;
    if delta = 0 and cost is null and replacement_qty is null then continue; end if;
    -- A deleted item has no stock to reverse. Apply the receipt to the newly
    -- selected item (if any), while leaving all other existing stock intact.
    if item is null then continue; end if;
    if replacement_qty is null and exists (select 1 from jsonb_array_elements(before_rows) r where r ->> 'inventoryItemId' = item_id and r ->> 'inventoryUnit' is distinct from item ->> 'unit') then
      raise exception 'Inventory unit changed; correct the linked bill before changing stock.';
    end if;
    next_qty := round(coalesce(replacement_qty,(item ->> 'currentStock')::numeric + delta), 6);
    if replacement_qty is not null then cost:=replacement_cost;end if;
    if next_qty < 0 or next_qty > 1000000000 then raise exception 'This bill change would make stock negative or too large. No changes saved.'; end if;
    item := item || jsonb_build_object('currentStock', next_qty, 'lastUpdated', (now() at time zone 'Asia/Dhaka')::date::text);
    if cost is not null then item := item || jsonb_build_object('unitCost', round(cost, 6)); end if;
    select jsonb_agg(case when r ->> 'id' = item_id then item else r end order by pos) into stock from jsonb_array_elements(stock) with ordinality rows(r,pos);
  end loop;
  update public.app_state set value = stock, updated_at = now() where key = 'sea_slash_inventory_v1' and value is distinct from stock;
  if tg_op = 'DELETE' then return old; end if; return new;
end;
$$;
revoke all on function public.sync_vendor_bill_inventory() from public;
drop trigger if exists sync_vendor_bill_inventory on public.app_state;
create trigger sync_vendor_bill_inventory after insert or update or delete on public.app_state
for each row execute function public.sync_vendor_bill_inventory();
create or replace function public.vendor_inventory_sync_ready()
returns boolean language sql stable set search_path = '' as $$
  select public.can_manage_restaurant() and exists (select 1 from pg_catalog.pg_trigger where tgname = 'sync_vendor_bill_inventory' and tgrelid = 'public.app_state'::regclass and tgenabled = 'O');
$$;
revoke all on function public.vendor_inventory_sync_ready() from public, anon;
grant execute on function public.vendor_inventory_sync_ready() to authenticated;
create or replace function public.vendor_inventory_replace_ready()
returns boolean language sql stable set search_path = '' as $$
  select public.vendor_inventory_sync_ready() and position('inventoryUpdateMode' in pg_catalog.pg_get_functiondef('public.sync_vendor_bill_inventory()'::regprocedure))>0;
$$;
revoke all on function public.vendor_inventory_replace_ready() from public,anon;
grant execute on function public.vendor_inventory_replace_ready() to authenticated;
commit;
