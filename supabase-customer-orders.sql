-- Run in Sea Slash Supabase SQL Editor, after supabase-role-security.sql
-- and supabase-public-menu.sql. Orders are separate from accounting ledgers.
begin;
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
commit;
