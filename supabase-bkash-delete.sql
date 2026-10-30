-- Sea Slash: run in Supabase SQL Editor. Safe to run again.
begin;
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
commit;
