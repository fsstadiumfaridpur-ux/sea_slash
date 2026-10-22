import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {buildSetup} from '../../scripts/build-setup.mjs';
import {initialInventory,initialWastes,initialSalesHistory,initialStaff,initialPurchases,initialMonthlyExpenses,initialBazaarPhotos,initialRecipes,defaultSettings} from '../data/seedData';

test('Sea Slash cold install starts empty and grants only its own administrator',async()=>{
 const db=new PGlite();const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email',current_setting('request.jwt.claim.email',true)) $$;
   grant usage on schema auth to anon,authenticated,service_role;
   grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;`);
  await db.query('insert into auth.users values($1,$2)',[owner,'admin@sea-slash.example']);
  const sql=await buildSetup('admin@sea-slash.example');assert.doesNotMatch(sql,/410baf80|officialmughalmahal|fc_stall_/);
  await db.exec(sql);
  const query=async(statement:string)=>(await db.query<any>(statement)).rows;
  for(const name of ['sales','expenses','vendor_ledger','inventory','staff','attendance','advances','purchases','wastes','recipes'])assert.deepEqual((await query(`select value from app_state where key='sea_slash_${name}_v1'`))[0].value,[]);
  assert.equal((await query('select count(*)::int as n from restaurant_staff'))[0].n,0);
  assert.deepEqual((await query('select get_public_restaurant_menu() as menu'))[0].menu.items,[]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.email',$2,false)",[owner,'admin@sea-slash.example']);
  await db.exec('set role authenticated');assert.equal((await query('select restaurant_access_role() as role'))[0].role,'admin');
  await assert.rejects(db.exec('select * from public.sea_slash_owner'),/permission denied/);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.email',$2,false)",['410baf80-c3ed-4b8c-b312-3e0519a61948','officialmughalmahal@gmail.com']);
  await db.exec('set role authenticated');assert.equal((await query('select restaurant_access_role() as role'))[0].role,null);
  await db.exec('reset role;set role anon');assert.equal((await query('select count(*)::int as n from app_state'))[0].n,0);
  await assert.rejects(db.exec("insert into app_state(key,value) values('sea_slash_sales_v1','[]')"),/row-level security/);
  await db.exec('reset role');await assert.rejects(db.exec(sql),/fresh Sea Slash database/);await db.exec('rollback');
 }finally{await db.close();}
});
test('Sea Slash production defaults contain no demo inventory or transactions',()=>{
 for(const rows of [initialInventory,initialWastes,initialSalesHistory,initialStaff,initialPurchases,initialMonthlyExpenses,initialBazaarPhotos,initialRecipes])assert.deepEqual(rows,[]);
 assert.equal(defaultSettings.stallName,'Sea Slash');assert.equal(defaultSettings.monthlyRent,0);assert.equal(defaultSettings.commissionRate,0);
});
