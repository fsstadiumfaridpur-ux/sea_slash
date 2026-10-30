import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
test('real sessions are private, revocation cascades refresh tokens and revoked JWTs lose roles and RLS access',async()=>{
 const db=new PGlite();
 const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='00000000-0000-4000-8000-000000000002';
 const current='10000000-0000-4000-8000-000000000001',second='10000000-0000-4000-8000-000000000002',foreign='10000000-0000-4000-8000-000000000003',expired='10000000-0000-4000-8000-000000000004';
 const jwt=(user:string,id:string)=>db.query("select set_config('test.jwt',$1,false)",[JSON.stringify({sub:user,session_id:id,email:user===owner?'officialseaslash@gmail.com':'other@example.com'})]);
 const list=async()=>(await db.query<{value:any[]}>('select public.list_my_account_sessions() value')).rows[0].value;
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
   create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default now(),updated_at timestamptz default now(),refreshed_at timestamptz,not_after timestamptz,user_agent text,ip text);
   create table auth.refresh_tokens(session_id uuid references auth.sessions(id) on delete cascade,token text);
   create table public.sea_slash_owner(id boolean primary key,user_id uuid,email text);
   insert into public.sea_slash_owner values(true,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','officialseaslash@gmail.com');
   create table public.restaurant_investment_partners(user_id uuid,active boolean);
   create table public.restaurant_staff(id text,access_role text,profile jsonb);
   create table public.restaurant_staff_accounts(staff_id text,user_id uuid);
   create table public.app_state(key text primary key,value jsonb);
   alter table public.app_state enable row level security;
   create policy existing_access on public.app_state for all to authenticated using(true) with check(true);
   grant select,insert,update,delete on public.app_state to authenticated;
   insert into public.app_state values('private','{"secret":true}');`);
  await db.query(`insert into auth.sessions(id,user_id,user_agent) values($1,$2,'Chrome Mac OS'),($3,$2,'Chrome Android'),($4,$5,'Safari iPhone')`,[current,owner,second,foreign,other]);
  await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()-interval '1 day')",[expired,owner]);
  await db.query('insert into auth.refresh_tokens values($1,$2)',[second,'must-never-be-returned']);
  const sql=await readFile(new URL('../../supabase-account-security.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  await db.exec('set role authenticated');await jwt(owner,current);
  const sessions=await list();assert.equal(sessions.length,2);assert.equal(sessions.find(s=>s.id===current)?.current,true);assert.equal(sessions.some(s=>s.id===foreign),false);assert.equal(JSON.stringify(sessions).includes('must-never'),false);
  assert.equal((await db.query<{value:string}>('select public.restaurant_access_role() value')).rows[0].value,'admin');
  await db.query('select public.revoke_my_account_session($1)',[foreign]); // Cannot terminate another account.
  await db.query('select public.revoke_my_account_session($1)',[second]);assert.equal((await list()).length,1);
  await db.exec('reset role');assert.equal((await db.query<{n:number}>('select count(*)::int n from auth.refresh_tokens')).rows[0].n,0);assert.equal((await db.query<{n:number}>('select count(*)::int n from auth.sessions where id=$1',[foreign])).rows[0].n,1);
  await db.exec('set role authenticated');await jwt(owner,second);
  assert.equal((await db.query<{value:string|null}>('select public.restaurant_access_role() value')).rows[0].value,null);
  await assert.rejects(list(),/session has ended/);await assert.rejects(db.query('select public.revoke_my_account_session($1)',[current]),/session has ended/);
  assert.equal((await db.query('select * from public.app_state')).rows.length,0);
  await assert.rejects(db.query("insert into public.app_state values('bypass','{}')"),/row-level security/);
  await jwt(owner,current);assert.equal((await db.query('select * from public.app_state')).rows.length,1);
  const removed=(await db.query<{n:number}>('select public.revoke_my_other_sessions() n')).rows[0].n;assert.equal(removed,1);assert.equal((await list()).length,1);
  await db.query('select public.revoke_my_account_session($1)',[current]);await assert.rejects(list(),/session has ended/);
  await db.exec('set role anon');await assert.rejects(list(),/permission denied/);
 }finally{await db.close();}
});
