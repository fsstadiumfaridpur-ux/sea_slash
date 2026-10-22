import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
import {buildSetup} from '../../scripts/build-setup.mjs';import {investmentFundingSummary,validateInvestmentFunding,type InvestmentFunding} from './investmentFunding';import {canAccessSection,isRestaurantRole,managementSections} from './access';
const funding:InvestmentFunding={target:null,investors:[{id:'owner',name:'Owner',share:50,openingPaid:260000},{id:'nazmul',name:'Nazmul Hossain',share:50,openingPaid:240000}],payments:[]};
test('50/50 contributions calculate equalisation, future budget and new payments without double counting costs',()=>{
 const current=investmentFundingSummary(funding,0);assert.equal(current.totalPaid,500000);assert.equal(current.basis,520000);assert.equal(current.investors[0].overpaid,0);assert.equal(current.investors[1].due,20000);
 const future=investmentFundingSummary({...funding,target:600000},300000);assert.equal(future.investors[0].due,40000);assert.equal(future.investors[1].due,60000);
 const settled=investmentFundingSummary({...funding,payments:[{id:'pay',investorId:'nazmul',date:'2026-10-22',amount:20000,note:'Additional contribution'}]},0);assert.equal(settled.totalPaid,520000);assert.equal(settled.investors[1].due,0);assert.equal(settled.investors[0].due,0);
 assert.throws(()=>validateInvestmentFunding({...funding,investors:funding.investors.map(row=>({...row,share:40}))}),/100%/);
 assert.throws(()=>validateInvestmentFunding({...funding,payments:[{id:'bad',investorId:'unknown',date:'2026-10-22',amount:1,note:''}]}));
 const cents=investmentFundingSummary({...funding,target:0.01},0);assert.equal(cents.investors.reduce((sum,row)=>sum+row.required,0),0.01);
});
test('partner navigation is limited to investment',()=>{assert.equal(isRestaurantRole('partner'),true);for(const section of [...managementSections,'attendance','profile'])assert.equal(canAccessSection('partner',section),section==='investment');});
test('database partner access permits only investment reads, enforces admin changes and revokes immediately',async()=>{
 const db=new PGlite();const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',partner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',stranger='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const query=async(sql:string)=>(await db.query<any>(sql)).rows;
 const as=async(id:string,email:string,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.email',$2,false)",[id,email]);await db.exec(`set role ${role}`);};
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email',current_setting('request.jwt.claim.email',true)) $$;
   grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;`);
  await db.query('insert into auth.users values($1,$2),($3,$4),($5,$6)',[owner,'officialseaslash@gmail.com',partner,'seaslash.nazmul@gmail.com',stranger,'other@example.com']);
  await db.exec(await buildSetup('officialseaslash@gmail.com'));
  await as(partner,'seaslash.nazmul@gmail.com');assert.equal((await query('select restaurant_access_role() as role'))[0].role,'partner');assert.equal((await query('select can_manage_restaurant() as allowed'))[0].allowed,false);
  const workspace=(await query('select get_investment_workspace() as data'))[0].data;assert.equal(workspace.funding.investors[0].openingPaid,260000);assert.equal(workspace.funding.investors[1].openingPaid,240000);assert.deepEqual(workspace.entries,[]);
  assert.equal((await query('select count(*)::int as count from app_state'))[0].count,0);
  await assert.rejects(db.exec("insert into app_state(key,value) values('sea_slash_investments_v1','[]')"),/row-level security|Administrator/);
  await assert.rejects(db.query('select save_investment_funding($1,$2)',[funding,workspace.updatedAt]),/administrator/);
  await assert.rejects(db.exec('select list_investment_partners()'),/Administrator/);
  await assert.rejects(db.exec("select set_investment_partner('other@example.com',true)"),/Administrator/);
  await assert.rejects(db.exec('select get_admin_restaurant_menu()'),/Administrator/);
  await assert.rejects(db.exec('select list_restaurant_staff()'),/Administrator|manager/i);
  await assert.rejects(db.exec('select * from restaurant_investment_funding'),/permission denied/);
  await as(stranger,'other@example.com');await assert.rejects(db.exec('select get_investment_workspace()'),/Investment access/);
  await as(owner,'officialseaslash@gmail.com');const next={...funding,target:600000,payments:[{id:'p1',investorId:'nazmul',date:'2026-10-22',amount:20000,note:'Paid'}]};await db.query('select save_investment_funding($1,$2)',[next,workspace.updatedAt]);
  await assert.rejects(db.query('select save_investment_funding($1,$2)',[next,workspace.updatedAt]),/another session/);
  const latest=(await query('select get_investment_workspace() as data'))[0].data;await assert.rejects(db.query('select save_investment_funding($1,$2)',[{...next,investors:next.investors.map(row=>({...row,share:20}))},latest.updatedAt]),/100/);
  await db.exec("select set_investment_partner('seaslash.nazmul@gmail.com',false)");await as(partner,'seaslash.nazmul@gmail.com');assert.equal((await query('select restaurant_access_role() as role'))[0].role,null);await assert.rejects(db.exec('select get_investment_workspace()'),/Investment access/);
  await db.exec('reset role');await db.exec(await readFile(new URL('../../supabase-investment-partner.sql',import.meta.url),'utf8'));
  assert.equal((await query('select active from restaurant_investment_partners'))[0].active,false);assert.equal((await query("select (funding->>'target')::int as target from restaurant_investment_funding"))[0].target,600000);
 }finally{await db.close();}
});
