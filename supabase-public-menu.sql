-- Run after supabase-role-security.sql. Publishes only customer-menu fields.
begin;
create table if not exists public.restaurant_public_menu (
  id boolean primary key default true check(id),
  menu jsonb not null,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.restaurant_public_menu enable row level security;
revoke all on public.restaurant_public_menu from public,anon,authenticated;
grant all on public.restaurant_public_menu to service_role;

create or replace function public.get_public_restaurant_menu()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('settings',m.menu->'settings','items',coalesce((
    select jsonb_agg(item order by (item->>'sortOrder')::integer,item->>'name')
    from jsonb_array_elements(m.menu->'items') item where item->>'published'='true'
  ),'[]'::jsonb)) from public.restaurant_public_menu m where id=true;
$$;
create or replace function public.get_admin_restaurant_menu()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
  return (select jsonb_build_object('menu',menu,'updatedAt',updated_at) from public.restaurant_public_menu where id=true);
end;
$$;
create or replace function public.save_public_restaurant_menu(p_menu jsonb,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_revision timestamptz; item jsonb; clean_items jsonb:='[]'::jsonb; settings jsonb; clean_menu jsonb; field text; price numeric;
begin
  if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
  if jsonb_typeof(p_menu) is distinct from 'object' or jsonb_typeof(p_menu->'settings') is distinct from 'object' or jsonb_typeof(p_menu->'items') is distinct from 'array' then raise exception 'Invalid menu.';end if;
  if jsonb_array_length(p_menu->'items')>500 then raise exception 'A menu can contain up to 500 dishes.';end if;
  settings:=p_menu->'settings';
  foreach field in array array['headline','subtitle','footer'] loop
    if jsonb_typeof(settings->field) is distinct from 'string' then raise exception 'Enter valid display text.';end if;
  end loop;
  if length(btrim(settings->>'headline')) not between 1 and 100 or length(settings->>'subtitle')>160 or length(settings->>'footer')>160
    or jsonb_typeof(settings->'slideSeconds') is distinct from 'number' then raise exception 'Enter valid display text and rotation time.';end if;
  if (settings->>'slideSeconds')::numeric not between 8 and 60 or (settings->>'slideSeconds')::numeric <> trunc((settings->>'slideSeconds')::numeric) then raise exception 'Rotation time must be 8 to 60 seconds.';end if;
  if coalesce(settings->>'layout','gallery') not in ('gallery','board') then raise exception 'Choose a valid menu layout.';end if;
  for item in select value from jsonb_array_elements(p_menu->'items') loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid dish.';end if;
    foreach field in array array['id','name','description','category','photoUrl','badge'] loop
      if jsonb_typeof(item->field) is distinct from 'string' then raise exception 'Enter valid dish details.';end if;
    end loop;
    if length(item->>'id') not between 1 and 100 or length(btrim(item->>'name')) not between 1 and 100
      or length(btrim(item->>'category')) not between 1 and 60 or length(item->>'description')>300 or length(item->>'badge')>30 then raise exception 'Enter a dish name, category and short description.';end if;
    if exists(select 1 from jsonb_array_elements(clean_items) r where r->>'id'=item->>'id') then raise exception 'Duplicate dish ID.';end if;
    if jsonb_typeof(item->'price') is distinct from 'number' or jsonb_typeof(item->'sortOrder') is distinct from 'number'
      or jsonb_typeof(item->'published') is distinct from 'boolean' or jsonb_typeof(item->'available') is distinct from 'boolean' then raise exception 'Invalid price or dish visibility.';end if;
    price:=(item->>'price')::numeric;
    if price < 0 or price>10000000 or round(price,2)<>price or (item->>'sortOrder')::numeric not between 0 and 1000000 or trunc((item->>'sortOrder')::numeric)<>(item->>'sortOrder')::numeric then raise exception 'Enter a valid price and display order.';end if;
    if length(item->>'photoUrl')>2000 or ((item->>'photoUrl')<>'' and (item->>'photoUrl') !~* '^https://[^[:space:]]+$') then raise exception 'Use an HTTPS photo URL.';end if;
    -- Rebuild safe customer-facing fields. Never copy costs, ingredients or payroll.
    clean_items:=clean_items||jsonb_build_array(jsonb_build_object('id',item->>'id','name',btrim(item->>'name'),'description',item->>'description',
      'category',btrim(item->>'category'),'price',item->'price','photoUrl',item->>'photoUrl','badge',item->>'badge','available',item->'available','published',item->'published','sortOrder',item->'sortOrder'));
  end loop;
  if coalesce(settings->>'priceStyle','ribbon') not in ('ribbon','brush','seal') then raise exception 'Choose a valid price label style.';end if;
  if settings ? 'hotDealIds' then
    if jsonb_typeof(settings->'hotDealIds') is distinct from 'array' then raise exception 'Choose existing dishes for Hot Deals.';end if;
    if jsonb_array_length(settings->'hotDealIds')>500 or exists(select 1 from jsonb_array_elements(settings->'hotDealIds') id where jsonb_typeof(id)<>'string' or not exists(select 1 from jsonb_array_elements(clean_items) dish where dish->>'id'=id#>>'{}'))
      or (select count(*) from jsonb_array_elements(settings->'hotDealIds'))<>(select count(distinct id) from jsonb_array_elements(settings->'hotDealIds') id) then raise exception 'Choose different existing dishes for Hot Deals.';end if;
  end if;
  if settings ? 'hotDealSeconds' then
    if jsonb_typeof(settings->'hotDealSeconds') is distinct from 'number' then raise exception 'Hot Deals timer must be 5 to 300 seconds.';end if;
    if (settings->>'hotDealSeconds')::numeric not between 5 and 300 or trunc((settings->>'hotDealSeconds')::numeric)<>(settings->>'hotDealSeconds')::numeric then raise exception 'Hot Deals timer must be 5 to 300 seconds.';end if;
  end if;
  clean_menu:=jsonb_build_object('settings',jsonb_build_object('headline',btrim(settings->>'headline'),'subtitle',settings->>'subtitle','footer',settings->>'footer','slideSeconds',settings->'slideSeconds','layout',coalesce(settings->>'layout','gallery'),'priceStyle',coalesce(settings->>'priceStyle','ribbon'),'hotDealIds',coalesce(settings->'hotDealIds','[]'::jsonb),'hotDealSeconds',coalesce(settings->'hotDealSeconds','10'::jsonb)),'items',clean_items);
  perform pg_advisory_xact_lock(hashtextextended('restaurant-public-menu',0));
  select updated_at into current_revision from public.restaurant_public_menu where id=true for update;
  if current_revision is distinct from p_expected_updated_at then raise exception 'The menu changed in another session. Reload before saving.' using errcode='40001';end if;
  insert into public.restaurant_public_menu(id,menu) values(true,clean_menu)
    on conflict(id) do update set menu=excluded.menu,updated_at=clock_timestamp();
  return public.get_admin_restaurant_menu();
end;
$$;

insert into public.restaurant_public_menu(id,menu) values(true,'{"settings":{"headline":"Sea Slash Menu","subtitle":"Welcome to Sea Slash.","footer":"Sea Slash","slideSeconds":15,"layout":"gallery"},"items":[]}') on conflict(id) do nothing;
revoke all on function public.get_public_restaurant_menu(),public.get_admin_restaurant_menu(),public.save_public_restaurant_menu(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.get_public_restaurant_menu() to anon,authenticated;
grant execute on function public.get_admin_restaurant_menu(),public.save_public_restaurant_menu(jsonb,timestamptz) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('menu-photos','menu-photos',true,4194304,array['image/jpeg','image/png','image/webp'])
  on conflict(id) do update set public=true,file_size_limit=4194304,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Customer menu photo reads" on storage.objects;
create policy "Customer menu photo reads" on storage.objects for select to anon,authenticated using(bucket_id='menu-photos');
drop policy if exists "Admin menu photo inserts" on storage.objects;
create policy "Admin menu photo inserts" on storage.objects for insert to authenticated with check(bucket_id='menu-photos' and public.is_restaurant_admin());
drop policy if exists "Admin menu photo updates" on storage.objects;
create policy "Admin menu photo updates" on storage.objects for update to authenticated using(bucket_id='menu-photos' and public.is_restaurant_admin()) with check(bucket_id='menu-photos' and public.is_restaurant_admin());
drop policy if exists "Admin menu photo deletes" on storage.objects;
create policy "Admin menu photo deletes" on storage.objects for delete to authenticated using(bucket_id='menu-photos' and public.is_restaurant_admin());
-- Keep older permissive storage policies from granting writes to menu photos.
drop policy if exists "Protect menu photo inserts" on storage.objects;
create policy "Protect menu photo inserts" on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'menu-photos' or public.is_restaurant_admin());
drop policy if exists "Protect menu photo updates" on storage.objects;
create policy "Protect menu photo updates" on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'menu-photos' or public.is_restaurant_admin()) with check(bucket_id<>'menu-photos' or public.is_restaurant_admin());
drop policy if exists "Protect menu photo deletes" on storage.objects;
create policy "Protect menu photo deletes" on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'menu-photos' or public.is_restaurant_admin());
commit;
