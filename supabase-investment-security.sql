begin;
alter table public.app_state enable row level security;
drop policy if exists "Private investment reads" on public.app_state;
drop policy if exists "Private investment inserts" on public.app_state;
drop policy if exists "Private investment updates" on public.app_state;
drop policy if exists "Private investment deletes" on public.app_state;
create policy "Private investment reads" on public.app_state as restrictive for select to anon, authenticated
  using (key <> 'sea_slash_investments_v1' or public.is_restaurant_admin());
create policy "Private investment inserts" on public.app_state as restrictive for insert to anon, authenticated
  with check (key <> 'sea_slash_investments_v1' or public.is_restaurant_admin());
create policy "Private investment updates" on public.app_state as restrictive for update to anon, authenticated
  using (key <> 'sea_slash_investments_v1' or public.is_restaurant_admin())
  with check (key <> 'sea_slash_investments_v1' or public.is_restaurant_admin());
create policy "Private investment deletes" on public.app_state as restrictive for delete to anon, authenticated
  using (key <> 'sea_slash_investments_v1' or public.is_restaurant_admin());
create or replace function public.restaurant_investment_security_ready()
returns boolean language sql stable set search_path = '' as $$
  select public.is_restaurant_admin();
$$;
revoke all on function public.restaurant_investment_security_ready() from public;
grant execute on function public.restaurant_investment_security_ready() to authenticated;
commit;
