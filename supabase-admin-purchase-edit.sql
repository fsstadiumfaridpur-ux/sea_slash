-- Run after supabase-role-security.sql. Admin expense edits update purchase stock atomically.
begin;
create or replace function public.edit_restaurant_purchase(p_previous jsonb, p_purchase jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare stock jsonb; purchases jsonb; old_purchase jsonb; item jsonb; identifier text;
  qty numeric; price numeric; total numeric; next_stock numeric;
begin
  if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  if jsonb_typeof(p_purchase) is distinct from 'object' or jsonb_typeof(p_purchase -> 'id') is distinct from 'string' then raise exception 'Invalid purchase.'; end if;
  identifier := p_purchase ->> 'id';
  if identifier = '' or identifier is distinct from p_previous ->> 'id' then raise exception 'Purchase identity cannot change.'; end if;
  select value into stock from public.app_state where key = 'sea_slash_inventory_v1' for update;
  select value into purchases from public.app_state where key = 'sea_slash_purchases_v1' for update;
  select row into old_purchase from jsonb_array_elements(coalesce(purchases, '[]'::jsonb)) row where row ->> 'id' = identifier;
  if old_purchase is null then raise exception 'Original purchase no longer exists.'; end if;
  if old_purchase is distinct from p_previous then raise exception 'This purchase changed in another session. Reload before editing.'; end if;
  if p_purchase ->> 'itemId' is distinct from old_purchase ->> 'itemId' or p_purchase ->> 'unit' is distinct from old_purchase ->> 'unit'
    or p_purchase ->> 'itemName' is distinct from old_purchase ->> 'itemName' then raise exception 'The original ingredient and unit cannot change.'; end if;
  if jsonb_typeof(p_purchase -> 'quantity') is distinct from 'number' or jsonb_typeof(p_purchase -> 'unitPrice') is distinct from 'number' or jsonb_typeof(p_purchase -> 'totalCost') is distinct from 'number' then raise exception 'Enter valid purchase amounts.'; end if;
  qty := (p_purchase ->> 'quantity')::numeric; price := (p_purchase ->> 'unitPrice')::numeric; total := (p_purchase ->> 'totalCost')::numeric;
  if qty <= 0 or qty > 1000000000 or price <= 0 or price > 90071992547409 or total <= 0 or total > 90071992547409
    or qty::text in ('NaN','Infinity','-Infinity') or price::text in ('NaN','Infinity','-Infinity') or total::text in ('NaN','Infinity','-Infinity')
    or round(qty * price, 2) <> total then raise exception 'Quantity times unit price must equal the total bill.'; end if;
  if p_purchase ->> 'date' is null or p_purchase ->> 'date' !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p_purchase ->> 'date')::date, 'YYYY-MM-DD') <> p_purchase ->> 'date'
    or p_purchase ->> 'paymentMode' is null or p_purchase ->> 'paymentMode' not in ('cash','bkash','credit') then raise exception 'Choose a valid payment date and method.'; end if;
  select row into item from jsonb_array_elements(coalesce(stock, '[]'::jsonb)) row where row ->> 'id' = old_purchase ->> 'itemId';
  -- Financial corrections remain possible after an ingredient has been archived/deleted.
  if qty is distinct from (old_purchase ->> 'quantity')::numeric then
    if item is null then raise exception 'Original inventory item no longer exists; cannot change quantity.'; end if;
    if item ->> 'unit' is distinct from old_purchase ->> 'unit' then raise exception 'Inventory unit changed; cannot correct quantity in the old unit.'; end if;
    next_stock := round((item ->> 'currentStock')::numeric + qty - (old_purchase ->> 'quantity')::numeric, 6);
    if next_stock < 0 or next_stock > 1000000000 then raise exception 'This correction would make inventory stock negative or too large.'; end if;
    item := item || jsonb_build_object('currentStock', next_stock, 'lastUpdated', (now() at time zone 'Asia/Dhaka')::date::text);
  end if;
  if item is not null and item ->> 'unit' = old_purchase ->> 'unit' and
    (qty is distinct from (old_purchase ->> 'quantity')::numeric or price is distinct from (old_purchase ->> 'unitPrice')::numeric) then
    item := item || jsonb_build_object('unitCost', price);
    select jsonb_agg(case when row ->> 'id' = item ->> 'id' then item else row end order by pos) into stock from jsonb_array_elements(stock) with ordinality records(row,pos);
    update public.app_state set value = stock, updated_at = now() where key = 'sea_slash_inventory_v1';
  end if;
  select jsonb_agg(case when row ->> 'id' = identifier then p_purchase else row end order by pos) into purchases from jsonb_array_elements(purchases) with ordinality records(row,pos);
  update public.app_state set value = purchases, updated_at = now() where key = 'sea_slash_purchases_v1';
  return jsonb_build_object('purchases', purchases, 'inventory', coalesce(stock, '[]'::jsonb));
end;
$$;
revoke all on function public.edit_restaurant_purchase(jsonb,jsonb) from public, anon;
grant execute on function public.edit_restaurant_purchase(jsonb,jsonb) to authenticated;
commit;
