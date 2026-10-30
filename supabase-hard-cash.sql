-- Sea Slash: run once in Supabase SQL Editor. Safe to run again.
begin;
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
commit;
