import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {buildSetup} from '../../scripts/build-setup.mjs';
import {buildFeatureUpdate} from '../../scripts/build-feature-update.mjs';
test('Sea Slash upgrade preserves records and partner access, uses its own owner and rejects revoked sessions',async()=>{
 const db=new PGlite();
 const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',partner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const ownerSession='10000000-0000-4000-8000-000000000001',partnerSession='10000000-0000-4000-8000-000000000002';
 const query=async(sql:string)=>(await db.query<any>(sql)).rows;
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('request.jwt.claim.email',true),'session_id',current_setting('request.jwt.claim.session_id',true))$$;
   grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
   create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default now(),updated_at timestamptz default now(),not_after timestamptz);
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;`);
  await db.query('insert into auth.users values($1,$2),($3,$4)',[owner,'officialseaslash@gmail.com',partner,'seaslash.nazmul@gmail.com']);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[ownerSession,owner,partnerSession,partner]);
  await db.exec(await buildSetup('officialseaslash@gmail.com'));
  const before=await query('select key,value from app_state order by key');
  const fundingBefore=await query('select * from restaurant_investment_funding');
  const sql=await buildFeatureUpdate();assert.doesNotMatch(sql,/410baf80|officialmughalmahal|fc_stall_|01356154690|01516542905/);
  await db.exec(sql);await db.exec(sql);
  assert.deepEqual(await query('select key,value from app_state order by key'),before);
  assert.deepEqual(await query('select * from restaurant_investment_funding'),fundingBefore);
  const as=async(id:string,email:string,session:string)=>{
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.email',$2,false),set_config('request.jwt.claim.session_id',$3,false)",[id,email,session]);await db.exec('set role authenticated');
  };
  await as(owner,'officialseaslash@gmail.com',ownerSession);
  assert.equal((await query('select restaurant_access_role() role'))[0].role,'admin');
  assert.equal((await query('select hard_cash_snapshot() data'))[0].data.balance,0);
  await db.query('select add_daily_cash_float($1,$2,$3,$4)',['20000000-0000-4000-8000-000000000001','2026-10-30',900,0]);
  assert.equal((await db.query<any>('select add_daily_cash_float($1,$2,$3,$4) data',['20000000-0000-4000-8000-000000000002','2026-10-30',300,900])).rows[0].data.total,1200);
  await as(partner,'seaslash.nazmul@gmail.com',partnerSession);
  assert.equal((await query('select restaurant_access_role() role'))[0].role,'partner');
  assert.equal((await query('select get_investment_workspace() data'))[0].data.funding.investors[1].openingPaid,240000);
  await assert.rejects(db.exec('select hard_cash_snapshot()'),/Administrator/);
  await assert.rejects(db.exec('select list_restaurant_orders(100)'),/Administrator|manager/);
  assert.equal((await query('select count(*)::int n from app_state'))[0].n,0);
  await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[partnerSession]);await db.exec('set role authenticated');
  assert.equal((await query('select restaurant_access_role() role'))[0].role,null);
  await assert.rejects(db.exec('select get_investment_workspace()'),/Investment access/);
 }finally{await db.close();}
});
