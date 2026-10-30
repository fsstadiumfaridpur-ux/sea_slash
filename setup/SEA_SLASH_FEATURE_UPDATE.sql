-- SEA SLASH ONLY: project xrgttljzokzrvqfdbmdu. Update an existing installation.
-- Preserves accounts, transactions, menu, settings and partner investments.
begin;
do $guard$ begin
 if to_regclass('public.sea_slash_owner') is null then raise exception 'This update requires an existing Sea Slash installation.';end if;
 if not exists(select 1 from public.sea_slash_owner where email='officialseaslash@gmail.com') then raise exception 'Sea Slash owner verification failed.';end if;
end $guard$;

-- vendor-inventory
-- Run after supabase-role-security.sql and the corrected supabase-balance-security.sql.
-- Vendor ledger and inventory are changed in the same database transaction.
-- Re-run this file to enable current-quantity replacements from vendor bills.
-- Historical additive receipts retain their original semantics; payment-only edits never reset stock.

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


-- vendor-history-delete
-- Run in Sea Slash Supabase SQL Editor. Safe to run again.
-- Managers retain add/edit access; only admins may remove vendor history.

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


-- customer-orders
-- Run in Sea Slash Supabase SQL Editor, after supabase-role-security.sql
-- and supabase-public-menu.sql. Orders are separate from accounting ledgers.

create table if not exists public.restaurant_ordering_settings (
 id boolean primary key default true check(id), settings jsonb not null,
 updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.restaurant_customer_orders (
 id uuid primary key default gen_random_uuid(), token uuid not null unique,
 fingerprint jsonb not null, created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 status text not null default 'pending' check(status in ('pending','accepted','preparing','out_for_delivery','completed','cancelled')),
 customer_name text not null, phone text not null, address text not null, area text not null, notes text not null default '',
 items jsonb not null, subtotal numeric(12,2) not null check(subtotal>=0),
 delivery_fee numeric(12,2) check(delivery_fee in (20,40,60)),
 total numeric(12,2) not null check(total>=0), paid_amount numeric(12,2) not null default 0 check(paid_amount>=0),
 payment_method text not null check(payment_method in ('cod','bkash')),
 payment_status text not null check(payment_status in ('unpaid','unverified','part_paid','paid')),
 transaction_id text not null default '', staff_note text not null default ''
);
create index if not exists restaurant_orders_created on public.restaurant_customer_orders(created_at desc);
create index if not exists restaurant_orders_phone on public.restaurant_customer_orders(phone,created_at desc);
alter table public.restaurant_ordering_settings enable row level security;
alter table public.restaurant_customer_orders enable row level security;
revoke all on public.restaurant_ordering_settings,public.restaurant_customer_orders from public,anon,authenticated;
grant all on public.restaurant_ordering_settings,public.restaurant_customer_orders to service_role;
insert into public.restaurant_ordering_settings(id,settings) values(true,
 '{"acceptingOrders":false,"deliveryFees":[20,40,60],"whatsappNumber":"","bkashNumber":"","bkashType":"merchant","bkashEnabled":false,"notice":"Delivery charge is ৳20, ৳40 or ৳60 depending on location. The restaurant confirms your order and charge. For bKash, pay the food subtotal now; delivery is collected separately."}') on conflict(id) do nothing;
create or replace function public.get_restaurant_ordering_settings()
returns jsonb language sql stable security definer set search_path='' as $$
 select settings from public.restaurant_ordering_settings where id=true;
$$;
create or replace function public.save_restaurant_ordering_settings(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare clean jsonb; b text; w text;
begin
 if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
 if jsonb_typeof(p_settings) is distinct from 'object' or jsonb_typeof(p_settings->'acceptingOrders') is distinct from 'boolean' or jsonb_typeof(p_settings->'bkashEnabled') is distinct from 'boolean' then raise exception 'Choose valid order settings.';end if;
 b:=coalesce(p_settings->>'bkashNumber','');w:=coalesce(p_settings->>'whatsappNumber','');
 if w !~ '^01[0-9]{9}$' or ((p_settings->>'bkashEnabled')::boolean and b !~ '^01[0-9]{9}$') or coalesce(p_settings->>'bkashType','') not in ('personal','merchant') or length(coalesce(p_settings->>'notice',''))>600 then raise exception 'Enter valid WhatsApp and bKash numbers, payment type and notice.';end if;
 clean:=jsonb_build_object('acceptingOrders',p_settings->'acceptingOrders','deliveryFees',jsonb_build_array(20,40,60),'whatsappNumber',w,'bkashNumber',b,'bkashType',p_settings->>'bkashType','bkashEnabled',p_settings->'bkashEnabled','notice',coalesce(p_settings->>'notice',''));
 update public.restaurant_ordering_settings set settings=clean,updated_at=clock_timestamp() where id=true;
 return clean;
end;$$;
-- Receipt lookup returns no customer contact details or payment transaction IDs.
create or replace function public.get_restaurant_order_receipt(p_token uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'created_at',created_at,'status',status,'items',items,'subtotal',subtotal,'delivery_fee',delivery_fee,'total',total,'paid_amount',paid_amount,'payment_method',payment_method,'payment_status',payment_status)
 from public.restaurant_customer_orders where token=p_token;
$$;
create or replace function public.place_restaurant_order(p_token uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare settings jsonb; menu jsonb; line jsonb; dish jsonb; clean_lines jsonb:='[]'; ids text[]:='{}'; qty integer; item_id text; subtotal numeric:=0; count_items integer:=0; customer text; clean_phone text; address text; area text; notes text; method text; tx text; prior public.restaurant_customer_orders%rowtype;
begin
 if p_token is null or p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid order.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_token::text,0));
 select * into prior from public.restaurant_customer_orders where token=p_token;
 if found then
   if prior.fingerprint is distinct from p_payload then raise exception 'This checkout has already been used. Start a new order.';end if;
   return public.get_restaurant_order_receipt(p_token);
 end if;
 select s.settings into settings from public.restaurant_ordering_settings s where id=true;
 if coalesce((settings->>'acceptingOrders')::boolean,false) is not true then raise exception 'Online orders are paused. Please contact the restaurant.';end if;
 customer:=btrim(coalesce(p_payload->>'name',''));clean_phone:=regexp_replace(coalesce(p_payload->>'phone',''),'[ ()-]','','g');address:=btrim(coalesce(p_payload->>'address',''));area:=btrim(coalesce(p_payload->>'area',''));notes:=btrim(coalesce(p_payload->>'notes',''));method:=coalesce(p_payload->>'paymentMethod','');tx:=upper(btrim(coalesce(p_payload->>'transactionId','')));
 if length(customer) not between 2 and 100 or clean_phone !~ '^\+?[0-9]{10,15}$' or length(address) not between 8 and 400 or length(area) not between 2 and 100 or length(notes)>400 or coalesce(p_payload->>'website','')<>'' then raise exception 'Enter your name, phone number, delivery area and full address.';end if;
 if method not in ('cod','bkash') or (method='bkash' and (coalesce((settings->>'bkashEnabled')::boolean,false) is not true or tx !~ '^[A-Z0-9]{6,30}$')) then raise exception 'Choose cash on delivery or enter a valid bKash transaction ID.';end if;
 if jsonb_typeof(p_payload->'items') is distinct from 'array' then raise exception 'Add dishes to your order.';end if;
 if jsonb_array_length(p_payload->'items') not between 1 and 20 then raise exception 'Choose between 1 and 20 different dishes.';end if;
 perform pg_advisory_xact_lock(hashtextextended(clean_phone,1));
 if (select count(*) from public.restaurant_customer_orders where restaurant_customer_orders.phone=clean_phone and created_at>clock_timestamp()-interval '15 minutes')>=5 then raise exception 'Too many orders for this phone number. Please contact the restaurant.';end if;
 select m.menu into menu from public.restaurant_public_menu m where id=true for share;
 for line in select value from jsonb_array_elements(p_payload->'items') loop
   item_id:=line->>'id';
   if jsonb_typeof(line->'quantity') is distinct from 'number' then raise exception 'Choose a valid quantity.';end if;
   if (line->>'quantity')::numeric not between 1 and 20 or trunc((line->>'quantity')::numeric)<>(line->>'quantity')::numeric then raise exception 'Quantity must be 1 to 20.';end if;
   qty:=(line->>'quantity')::integer;
   if item_id is null or item_id=any(ids) then raise exception 'Duplicate or missing dish.';end if;ids:=array_append(ids,item_id);
   select value into dish from jsonb_array_elements(menu->'items') where value->>'id'=item_id;
   if dish is null or dish->>'published' is distinct from 'true' or dish->>'available' is distinct from 'true' then raise exception 'A dish is unavailable. Refresh your cart.';end if;
   subtotal:=subtotal+(dish->>'price')::numeric*qty;count_items:=count_items+qty;
   clean_lines:=clean_lines||jsonb_build_array(jsonb_build_object('id',item_id,'name',dish->>'name','quantity',qty,'price',(dish->>'price')::numeric,'photoUrl',dish->>'photoUrl'));
 end loop;
 if count_items>100 or subtotal<=0 or subtotal>1000000 then raise exception 'This order is too large or has an invalid total. Contact the restaurant.';end if;
 if jsonb_typeof(p_payload->'expectedSubtotal') is distinct from 'number' then raise exception 'Refresh your menu before ordering.';end if;
 if (p_payload->>'expectedSubtotal')::numeric<>subtotal then raise exception 'Menu prices changed. Refresh your menu and review the total before ordering.';end if;
 insert into public.restaurant_customer_orders(token,fingerprint,customer_name,phone,address,area,notes,items,subtotal,total,payment_method,payment_status,transaction_id)
 values(p_token,p_payload,customer,clean_phone,address,area,notes,clean_lines,subtotal,subtotal,method,case when method='bkash' then 'unverified' else 'unpaid' end,case when method='bkash' then tx else '' end);
 return public.get_restaurant_order_receipt(p_token);
end;$$;
create or replace function public.list_restaurant_orders(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_manage_restaurant() then raise exception 'Administrator or manager access required.' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(to_jsonb(o)-'token'-'fingerprint' order by created_at desc),'[]') from (select * from public.restaurant_customer_orders order by created_at desc limit greatest(1,least(coalesce(p_limit,100),500))) o);
end;$$;
create or replace function public.update_restaurant_order(p_id uuid,p_expected_updated_at timestamptz,p_status text,p_delivery_fee numeric,p_paid_amount numeric,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.restaurant_customer_orders%rowtype; changed public.restaurant_customer_orders%rowtype;
begin
 if not public.can_manage_restaurant() then raise exception 'Administrator or manager access required.' using errcode='42501';end if;
 select * into prior from public.restaurant_customer_orders where id=p_id for update;
 if not found then raise exception 'Order not found.';end if;
 if prior.updated_at is distinct from p_expected_updated_at then raise exception 'Order changed in another session. Refresh before saving.' using errcode='40001';end if;
 if p_status is null or p_status not in ('pending','accepted','preparing','out_for_delivery','completed','cancelled') or (p_delivery_fee is not null and p_delivery_fee not in (20,40,60)) or p_paid_amount is null or p_paid_amount<0 or p_paid_amount>prior.subtotal+coalesce(p_delivery_fee,0) or round(p_paid_amount,2)<>p_paid_amount or length(coalesce(p_note,''))>400 then raise exception 'Choose a valid status, ৳20/৳40/৳60 delivery fee and received amount.';end if;
 if p_status<>prior.status and not ((prior.status='pending' and p_status in ('accepted','cancelled')) or (prior.status='accepted' and p_status in ('preparing','cancelled')) or (prior.status='preparing' and p_status in ('out_for_delivery','cancelled')) or (prior.status='out_for_delivery' and p_status in ('completed','cancelled'))) then raise exception 'Invalid order status change.';end if;
 if p_status in ('out_for_delivery','completed') and p_delivery_fee is null then raise exception 'Set the delivery charge first.';end if;
 if prior.status in ('completed','cancelled') and (p_delivery_fee is distinct from prior.delivery_fee) then raise exception 'A finished order cannot be repriced.';end if;
 update public.restaurant_customer_orders set status=p_status,delivery_fee=p_delivery_fee,total=subtotal+coalesce(p_delivery_fee,0),paid_amount=p_paid_amount,payment_status=case when p_paid_amount>=subtotal+coalesce(p_delivery_fee,0) and p_delivery_fee is not null then 'paid' when p_paid_amount>0 then 'part_paid' when payment_method='bkash' then 'unverified' else 'unpaid' end,staff_note=coalesce(p_note,''),updated_at=clock_timestamp() where id=p_id returning * into changed;
 return to_jsonb(changed)-'token'-'fingerprint';
end;$$;
create or replace function public.get_restaurant_pending_order_count()
returns integer language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_manage_restaurant() then raise exception 'Administrator or manager access required.' using errcode='42501';end if;
 return (select count(*)::integer from public.restaurant_customer_orders where status='pending');
end;$$;
revoke all on function public.get_restaurant_pending_order_count() from public,anon,authenticated;
grant execute on function public.get_restaurant_pending_order_count() to authenticated;
revoke all on function public.get_restaurant_ordering_settings(),public.save_restaurant_ordering_settings(jsonb),public.get_restaurant_order_receipt(uuid),public.place_restaurant_order(uuid,jsonb),public.list_restaurant_orders(integer),public.update_restaurant_order(uuid,timestamptz,text,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.get_restaurant_ordering_settings(),public.get_restaurant_order_receipt(uuid),public.place_restaurant_order(uuid,jsonb) to anon,authenticated;
grant execute on function public.save_restaurant_ordering_settings(jsonb),public.list_restaurant_orders(integer),public.update_restaurant_order(uuid,timestamptz,text,numeric,numeric,text) to authenticated;


-- hard-cash
-- Sea Slash: run once in Supabase SQL Editor. Safe to run again.

create table if not exists public.restaurant_hard_cash (
  id uuid primary key,
  date date not null,
  direction text not null check(direction in ('in','out')),
  amount numeric(14,2) not null check(amount>0 and amount<=999999999.99),
  reason text not null check(length(trim(reason)) between 1 and 500),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.restaurant_hard_cash enable row level security;
revoke all on public.restaurant_hard_cash from public,anon,authenticated;
-- Only the admin-checked functions below expose this ledger.
create or replace function public.hard_cash_snapshot()
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.is_restaurant_admin(),false) then raise exception 'Administrator access required for Hard Cash.'; end if;
  return (select jsonb_build_object(
    'entries',coalesce(jsonb_agg(to_jsonb(c) order by date desc,created_at desc,id),'[]'::jsonb),
    'totalIn',coalesce(sum(amount) filter(where direction='in'),0),
    'totalOut',coalesce(sum(amount) filter(where direction='out'),0),
    'balance',coalesce(sum(case when direction='in' then amount else -amount end),0)
  ) from public.restaurant_hard_cash c);
end $$;
create or replace function public.add_hard_cash_entry(p_id uuid,p_date date,p_direction text,p_amount numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare existing public.restaurant_hard_cash;
begin
  if not coalesce(public.is_restaurant_admin(),false) then raise exception 'Administrator access required for Hard Cash.'; end if;
  if p_amount is null or p_amount<>round(p_amount,2) then raise exception 'Use an amount with at most two decimal places.'; end if;
  insert into public.restaurant_hard_cash(id,date,direction,amount,reason)
    values(p_id,p_date,p_direction,p_amount,trim(p_reason)) on conflict(id) do nothing;
  select * into existing from public.restaurant_hard_cash where id=p_id;
  if existing.date is distinct from p_date or existing.direction is distinct from p_direction
    or existing.amount is distinct from p_amount or existing.reason is distinct from trim(p_reason)
    then raise exception 'This entry changed. Refresh before trying again.'; end if;
  return public.hard_cash_snapshot();
end $$;
create or replace function public.delete_hard_cash_entry(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.is_restaurant_admin(),false) then raise exception 'Administrator access required for Hard Cash.'; end if;
  delete from public.restaurant_hard_cash where id=p_id;
  return public.hard_cash_snapshot();
end $$;
revoke all on function public.hard_cash_snapshot() from public,anon;
revoke all on function public.add_hard_cash_entry(uuid,date,text,numeric,text) from public,anon;
revoke all on function public.delete_hard_cash_entry(uuid) from public,anon;
grant execute on function public.hard_cash_snapshot(),public.add_hard_cash_entry(uuid,date,text,numeric,text),public.delete_hard_cash_entry(uuid) to authenticated;
notify pgrst,'reload schema';


-- bkash-admin-transfers
-- Sea Slash: run in Supabase SQL Editor. Safe to run again.
-- Protects manual bKash account changes; normal sales and expense payments stay separate.

create or replace function public.guard_bkash_manual_account()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (TG_OP<>'INSERT' and OLD.key='sea_slash_bkash_account_v1')
   or (TG_OP<>'DELETE' and NEW.key='sea_slash_bkash_account_v1') then
  if not coalesce(public.is_restaurant_admin(),false) then
   raise exception 'Only an administrator can add money, transfer out, or change the manual bKash account.';
  end if;
 end if;
 if TG_OP='DELETE' then return OLD;else return NEW;end if;
end $$;
drop trigger if exists guard_bkash_manual_account on public.app_state;
create trigger guard_bkash_manual_account before insert or update or delete on public.app_state
for each row execute function public.guard_bkash_manual_account();
revoke all on function public.guard_bkash_manual_account() from public,anon,authenticated;
notify pgrst,'reload schema';


-- bkash-delete
-- Sea Slash: run in Supabase SQL Editor. Safe to run again.

create or replace function public.guard_bkash_deletions()
returns trigger language plpgsql security definer set search_path=public as $$
declare previous jsonb; remaining jsonb; record jsonb;
begin
 if OLD.key not in ('sea_slash_bkash_account_v1','sea_slash_expenses_v1','sea_slash_sales_v1','sea_slash_purchases_v1','sea_slash_advances_v1') then
  if TG_OP='DELETE' then return OLD;else return NEW;end if;
 end if;
 if TG_OP='UPDATE' and NEW.key is distinct from OLD.key then raise exception 'Cannot rename financial records.';end if;
 if coalesce(public.is_restaurant_admin(),false) then
  if TG_OP='DELETE' then return OLD;else return NEW;end if;
 end if;
 if OLD.key='sea_slash_bkash_account_v1' then
  if TG_OP='DELETE' or OLD.value->'opening' is distinct from NEW.value->'opening' then raise exception 'Only an administrator can delete bKash transactions or change the opening balance.';end if;
  previous:=coalesce(OLD.value->'transfers','[]');remaining:=coalesce(NEW.value->'transfers','[]');
  for record in select row from jsonb_array_elements(previous) row loop
   if not exists(select 1 from jsonb_array_elements(remaining) next where next=record) then raise exception 'Only an administrator can delete or change saved bKash transfers.';end if;
  end loop;
 else
  previous:=OLD.value;remaining:=case when TG_OP='DELETE' then '[]'::jsonb else NEW.value end;
  for record in select row from jsonb_array_elements(previous) row where not exists(select 1 from jsonb_array_elements(remaining) next where next->>'id'=row->>'id') loop
   if record->>'paymentMode'='bkash' or (OLD.key='sea_slash_sales_v1' and coalesce((record->>'bkashSales')::numeric,0)>0) then raise exception 'Only an administrator can delete bKash transactions. Delete the original record as admin.';end if;
  end loop;
 end if;
 if TG_OP='DELETE' then return OLD;else return NEW;end if;
end $$;
drop trigger if exists guard_bkash_deletions on public.app_state;
create trigger guard_bkash_deletions before update or delete on public.app_state for each row execute function public.guard_bkash_deletions();
create or replace function public.delete_bkash_transfer(p_id text,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare account jsonb; original jsonb; transfers jsonb;
begin
 if not coalesce(public.is_restaurant_admin(),false) then raise exception 'Only an administrator can delete bKash transactions.';end if;
 select value into account from public.app_state where key='sea_slash_bkash_account_v1' for update;
 select row into original from jsonb_array_elements(coalesce(account->'transfers','[]')) row where row->>'id'=p_id;
 if original is null then raise exception 'This transfer was already deleted. Reload the account.';end if;
 if original is distinct from p_expected then raise exception 'This transfer changed in another session. Reload before deleting.';end if;
 select coalesce(jsonb_agg(row order by position),'[]') into transfers from jsonb_array_elements(account->'transfers') with ordinality as entries(row,position) where row->>'id' is distinct from p_id;
 account:=jsonb_set(account,'{transfers}',transfers);
 update public.app_state set value=account,updated_at=clock_timestamp() where key='sea_slash_bkash_account_v1';
 return account;
end $$;
revoke all on function public.guard_bkash_deletions() from public,anon,authenticated;
revoke all on function public.delete_bkash_transfer(text,jsonb) from public,anon;
grant execute on function public.delete_bkash_transfer(text,jsonb) to authenticated;
notify pgrst,'reload schema';


-- cash-float-topups
-- Sea Slash: run in Supabase SQL Editor. Safe to run again.

create table if not exists public.restaurant_cash_float_additions(
 id uuid primary key,date date not null,amount numeric(14,2) not null check(amount>0),
 previous_total numeric(14,2) not null,total numeric(14,2) not null,
 user_id uuid not null,created_at timestamptz not null default clock_timestamp()
);
alter table public.restaurant_cash_float_additions enable row level security;
revoke all on public.restaurant_cash_float_additions from public,anon,authenticated;
create or replace function public.guard_daily_cash_float()
returns trigger language plpgsql security definer set search_path='' as $$
declare prior numeric; next_amount numeric;
begin
 if TG_OP<>'INSERT' and OLD.key like 'sea_slash_cash_float_v1_%' then
  if TG_OP='DELETE' then raise exception 'Change float cannot be withdrawn here. Use the end-of-day cash process.';end if;
  if NEW.key<>OLD.key then raise exception 'Cannot move change float to another date.';end if;
  prior:=(OLD.value #>> '{}')::numeric;
 end if;
 if TG_OP<>'DELETE' and NEW.key like 'sea_slash_cash_float_v1_%' then
  if TG_OP='UPDATE' and OLD.key<>NEW.key then raise exception 'Cannot move change float to another date.';end if;
  if jsonb_typeof(NEW.value)<>'number' then raise exception 'Invalid change float.';end if;
  next_amount:=(NEW.value #>> '{}')::numeric;
  if next_amount<0 or next_amount>1000000000000 or next_amount<>round(next_amount,2) then raise exception 'Invalid change float.';end if;
  if prior is not null and next_amount<prior then raise exception 'Change float can only increase. It cannot be taken back during the day.';end if;
 end if;
 if TG_OP='DELETE' then return OLD;else return NEW;end if;
end $$;
drop trigger if exists guard_daily_cash_float on public.app_state;
create trigger guard_daily_cash_float before insert or update or delete on public.app_state for each row execute function public.guard_daily_cash_float();
create or replace function public.add_daily_cash_float(p_id uuid,p_date date,p_amount numeric,p_expected numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare state_key text; previous numeric; total numeric; existing public.restaurant_cash_float_additions;
begin
 if not coalesce(public.can_manage_restaurant(),false) then raise exception 'Administrator or manager access required.' using errcode='42501';end if;
 if p_id is null or p_date is null or p_amount is null or p_amount<=0 or p_amount>1000000000000 or p_amount<>round(p_amount,2)
  or p_expected is null or p_expected<0 or p_expected>1000000000000 then raise exception 'Enter a positive cash top-up with up to two decimal places.';end if;
 state_key:='sea_slash_cash_float_v1_'||to_char(p_date,'YYYY-MM-DD');
 insert into public.app_state(key,value,updated_at) values(state_key,'0',clock_timestamp()) on conflict(key) do nothing;
 select (value #>> '{}')::numeric into previous from public.app_state where key=state_key for update;
 select * into existing from public.restaurant_cash_float_additions where id=p_id;
 if found then
  if existing.user_id is distinct from auth.uid() or existing.date<>p_date or existing.amount<>p_amount then raise exception 'This top-up reference was already used. Refresh and try again.';end if;
  return jsonb_build_object('total',previous,'alreadyApplied',true);
 end if;
 if previous<>p_expected then raise exception 'The saved float changed in another session. Review the updated total and confirm again.' using errcode='40001';end if;
 total:=previous+p_amount;
 if total>1000000000000 then raise exception 'The total change float is too large.';end if;
 insert into public.restaurant_cash_float_additions(id,date,amount,previous_total,total,user_id) values(p_id,p_date,p_amount,previous,total,auth.uid());
 update public.app_state set value=to_jsonb(total),updated_at=clock_timestamp() where key=state_key;
 return jsonb_build_object('total',total,'alreadyApplied',false);
end $$;
revoke all on function public.guard_daily_cash_float() from public,anon,authenticated;
revoke all on function public.add_daily_cash_float(uuid,date,numeric,numeric) from public,anon;
grant execute on function public.add_daily_cash_float(uuid,date,numeric,numeric) to authenticated;
notify pgrst,'reload schema';


-- account-security
-- Sea Slash: run after supabase-role-security.sql in Supabase SQL Editor.
-- Uses real Supabase Auth sessions. Never exposes tokens or other users' sessions.

create or replace function public.restaurant_session_is_active()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s where s.user_id=auth.uid()
  and s.id::text=auth.jwt()->>'session_id'
  and (s.not_after is null or s.not_after>now()));
$$;
create or replace function public.list_my_account_sessions()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.restaurant_session_is_active() then raise exception 'Your session has ended. Please sign in again.' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'createdAt',s.created_at,'refreshedAt',coalesce(to_jsonb(s)->>'refreshed_at',s.updated_at::text,s.created_at::text),
  'userAgent',to_jsonb(s)->>'user_agent','ip',to_jsonb(s)->>'ip',
  'current',s.id::text=auth.jwt()->>'session_id'
 ) order by s.created_at desc),'[]'::jsonb)
 from auth.sessions s where s.user_id=auth.uid() and (s.not_after is null or s.not_after>now()));
end $$;
create or replace function public.revoke_my_account_session(p_session_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.restaurant_session_is_active() then raise exception 'Your session has ended. Please sign in again.' using errcode='42501';end if;
 -- Supabase's FK cascades deletion to this session's refresh tokens.
 delete from auth.sessions where user_id=auth.uid() and id=p_session_id;
end $$;
create or replace function public.revoke_my_other_sessions()
returns integer language plpgsql security definer set search_path='' as $$
declare count_removed integer;
begin
 if not public.restaurant_session_is_active() then raise exception 'Your session has ended. Please sign in again.' using errcode='42501';end if;
 delete from auth.sessions where user_id=auth.uid() and id::text<>auth.jwt()->>'session_id';
 get diagnostics count_removed=row_count;return count_removed;
end $$;
-- Deny revoked JWTs restaurant roles immediately, not just after token expiry.
create or replace function public.restaurant_access_role()
returns text language sql stable security definer set search_path='' as $$
 select case when not public.restaurant_session_is_active() then null
  when auth.uid()=(select user_id from public.sea_slash_owner where id=true)
  and lower(auth.jwt()->>'email')=(select email from public.sea_slash_owner where id=true) then 'admin'
  when exists(select 1 from public.restaurant_investment_partners where user_id=auth.uid() and active=true) then 'partner'
  else (select s.access_role from public.restaurant_staff s join public.restaurant_staff_accounts a on a.staff_id=s.id
   where a.user_id=auth.uid() and (s.profile->>'active')::boolean=true and coalesce(s.profile->>'archivedAt','')='') end;
$$;
-- An additional restrictive policy protects direct reads/writes with revoked JWTs.
-- Existing public/anonymous menu and ordering policies remain in force.
do $$ declare target record;begin
 for target in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity loop
  execute format('drop policy if exists "Active restaurant session" on public.%I',target.relname);
  execute format('create policy "Active restaurant session" on public.%I as restrictive for all to authenticated using ((select public.restaurant_session_is_active())) with check ((select public.restaurant_session_is_active()))',target.relname);
 end loop;
end $$;
revoke all on function public.restaurant_session_is_active(),public.list_my_account_sessions(),public.revoke_my_account_session(uuid),public.revoke_my_other_sessions() from public,anon;
grant execute on function public.restaurant_session_is_active(),public.list_my_account_sessions(),public.revoke_my_account_session(uuid),public.revoke_my_other_sessions() to authenticated;
notify pgrst,'reload schema';


commit;
