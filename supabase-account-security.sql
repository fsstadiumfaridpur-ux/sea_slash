-- Sea Slash: run after supabase-role-security.sql in Supabase SQL Editor.
-- Uses real Supabase Auth sessions. Never exposes tokens or other users' sessions.
begin;
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
