-- Sea Slash: run in Supabase SQL Editor. Safe to run again.
begin;
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
commit;
