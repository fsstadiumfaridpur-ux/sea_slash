-- Sea Slash: run in Supabase SQL Editor. Safe to run again.
-- Protects manual bKash account changes; normal sales and expense payments stay separate.
begin;
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
commit;
