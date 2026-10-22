-- SEA SLASH ONLY: run after the initial database setup. Repeatable; existing contributions are preserved.
begin;
create table if not exists public.restaurant_investment_partners (
 user_id uuid primary key references auth.users(id),email text not null unique,active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.restaurant_investment_partners enable row level security;
revoke all on public.restaurant_investment_partners from public,anon,authenticated;
create table if not exists public.restaurant_investment_funding (
 id boolean primary key default true check(id),funding jsonb not null,updated_at timestamptz not null default clock_timestamp()
);
alter table public.restaurant_investment_funding enable row level security;
revoke all on public.restaurant_investment_funding from public,anon,authenticated;
insert into public.restaurant_investment_funding(id,funding) values(true,
 '{"target":null,"investors":[{"id":"owner","name":"Owner","share":50,"openingPaid":260000},{"id":"nazmul","name":"Nazmul Hossain","share":50,"openingPaid":240000}],"payments":[]}'::jsonb
) on conflict(id) do nothing;
-- Enable the named partner only if their login already exists. Reruns preserve revocations.
insert into public.restaurant_investment_partners(user_id,email,active)
 select u.id,lower(u.email),true from auth.users u where lower(u.email)='seaslash.nazmul@gmail.com'
 and not exists(select 1 from public.sea_slash_owner where user_id=u.id)
 and not exists(select 1 from public.restaurant_staff_accounts where user_id=u.id)
 on conflict(user_id) do nothing;
create or replace function public.restaurant_access_role()
returns text language sql stable security definer set search_path='' as $$
 select case when auth.uid()=(select user_id from public.sea_slash_owner where id=true)
  and lower(auth.jwt()->>'email')=(select email from public.sea_slash_owner where id=true) then 'admin'
  when exists(select 1 from public.restaurant_investment_partners where user_id=auth.uid() and active=true) then 'partner'
  else (select s.access_role from public.restaurant_staff s join public.restaurant_staff_accounts a on a.staff_id=s.id
   where a.user_id=auth.uid() and (s.profile->>'active')::boolean=true and coalesce(s.profile->>'archivedAt','')='') end;
$$;
revoke all on function public.restaurant_access_role() from public;
grant execute on function public.restaurant_access_role() to anon,authenticated;
create or replace function public.get_investment_workspace()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(public.restaurant_access_role(),'') not in ('admin','partner') then raise exception 'Investment access required.' using errcode='42501';end if;
 return (select jsonb_build_object('funding',funding,'updatedAt',updated_at,'entries',coalesce((select value from public.app_state where key='sea_slash_investments_v1'),'[]'::jsonb)) from public.restaurant_investment_funding where id=true);
end;
$$;
create or replace function public.save_investment_funding(p_funding jsonb,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare investor jsonb;payment jsonb;ids text[]:='{}';payments text[]:='{}';shares numeric:=0;amount numeric;
begin
 if not public.is_restaurant_admin() then raise exception 'Only the administrator can change investment contributions.' using errcode='42501';end if;
 if jsonb_typeof(p_funding) is distinct from 'object' or jsonb_typeof(p_funding->'investors') is distinct from 'array' or jsonb_typeof(p_funding->'payments') is distinct from 'array' or jsonb_array_length(p_funding->'investors') not between 2 and 10 or jsonb_array_length(p_funding->'payments')>10000 then raise exception 'Invalid investment funding records.';end if;
 if p_funding->'target' is distinct from 'null'::jsonb then
  if jsonb_typeof(p_funding->'target') is distinct from 'number' then raise exception 'Invalid investment budget.';end if;
  amount:=(p_funding->>'target')::numeric;if amount<0 or amount>1000000000000 or round(amount,2)<>amount then raise exception 'Invalid investment budget.';end if;
 end if;
 for investor in select value from jsonb_array_elements(p_funding->'investors') loop
  if coalesce(investor->>'id','')='' or investor->>'id'=any(ids) or length(investor->>'id')>100 or coalesce(btrim(investor->>'name'),'')='' or length(investor->>'name')>100 or jsonb_typeof(investor->'share') is distinct from 'number' or jsonb_typeof(investor->'openingPaid') is distinct from 'number' then raise exception 'Invalid investor.';end if;
  ids:=array_append(ids,investor->>'id');amount:=(investor->>'share')::numeric;
  if amount<=0 or amount>100 or round(amount,2)<>amount then raise exception 'Invalid share.';end if;shares:=shares+amount;
  amount:=(investor->>'openingPaid')::numeric;if amount<0 or amount>1000000000000 or round(amount,2)<>amount then raise exception 'Invalid opening contribution.';end if;
 end loop;
 if shares<>100 then raise exception 'Shares must total 100 percent.';end if;
 for payment in select value from jsonb_array_elements(p_funding->'payments') loop
  if coalesce(payment->>'id','')='' or payment->>'id'=any(payments) or not coalesce(payment->>'investorId'=any(ids),false) or coalesce(payment->>'date','')!~'^\d{4}-\d{2}-\d{2}$' or to_char((payment->>'date')::date,'YYYY-MM-DD')<>payment->>'date' or jsonb_typeof(payment->'amount') is distinct from 'number' or jsonb_typeof(payment->'note') is distinct from 'string' or length(payment->>'note')>500 then raise exception 'Invalid contribution.';end if;
  payments:=array_append(payments,payment->>'id');amount:=(payment->>'amount')::numeric;
  if amount<=0 or amount>1000000000000 or round(amount,2)<>amount then raise exception 'Invalid contribution amount.';end if;
 end loop;
 update public.restaurant_investment_funding set funding=p_funding,updated_at=clock_timestamp() where id=true and updated_at=p_expected_updated_at;
 if not found then raise exception 'Investment contributions changed in another session. Refresh before saving.';end if;
 return public.get_investment_workspace();
end;
$$;
create or replace function public.list_investment_partners()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'email',email,'active',active) order by email),'[]'::jsonb) from public.restaurant_investment_partners);
end;
$$;
create or replace function public.set_investment_partner(p_email text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare identifier uuid;
begin
 if not public.is_restaurant_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
 if p_active is null then raise exception 'Choose whether access is enabled.';end if;
 select id into identifier from auth.users where lower(email)=lower(btrim(p_email));
 if identifier is null then raise exception 'Create this partner account in Supabase Authentication > Users first, then enable access here.';end if;
 if exists(select 1 from public.sea_slash_owner where user_id=identifier) or exists(select 1 from public.restaurant_staff_accounts where user_id=identifier) then raise exception 'Use a separate partner account, not an administrator or staff account.';end if;
 insert into public.restaurant_investment_partners(user_id,email,active) values(identifier,lower(btrim(p_email)),p_active)
 on conflict(user_id) do update set email=excluded.email,active=excluded.active;
end;
$$;
revoke all on function public.get_investment_workspace(),public.save_investment_funding(jsonb,timestamptz),public.list_investment_partners(),public.set_investment_partner(text,boolean) from public,anon,authenticated;
grant execute on function public.get_investment_workspace(),public.save_investment_funding(jsonb,timestamptz),public.list_investment_partners(),public.set_investment_partner(text,boolean) to authenticated;
commit;
