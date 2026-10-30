import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('only admins delete bKash transfers or source payments; manager additions remain available',async()=>{
 const db=new PGlite();const key='sea_slash_bkash_account_v1';
 const transfer={id:'t1',date:'2026-10-29',direction:'in',amount:1000,description:'Deposit',reference:''};
 const account={opening:{date:'2026-10-16',amount:0},transfers:[transfer]};
 const write=(k:string,value:unknown)=>db.query('insert into public.app_state(key,value) values($1,$2::jsonb) on conflict(key) do update set value=excluded.value',[k,JSON.stringify(value)]);
 const remove=(expected:unknown=transfer)=>db.query<{account:any}>('select public.delete_bkash_transfer($1,$2::jsonb) account',['t1',JSON.stringify(expected)]);
 try{
  await db.exec(`create role anon;create role authenticated;create table public.app_state(key text primary key,value jsonb not null,updated_at timestamptz default now());
   create function public.is_restaurant_admin() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true)='admin',false)$$;
   grant all on public.app_state to authenticated;`);
  const sql=await readFile(new URL('../../supabase-bkash-delete.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  await db.exec("set role authenticated;select set_config('test.role','admin',false)");await write(key,account);
  await db.exec("select set_config('test.role','manager',false)");
  const out={...transfer,id:'t2',direction:'out',amount:100};await write(key,{...account,transfers:[transfer,out]});
  await assert.rejects(remove(),/Only an administrator/);
  await assert.rejects(write(key,{...account,transfers:[out]}),/Only an administrator/);
  await assert.rejects(write(key,{...account,transfers:[{...transfer,amount:1},out]}),/Only an administrator/);
  await assert.rejects(db.query('delete from public.app_state where key=$1',[key]),/Only an administrator/);
  await assert.rejects(write(key,{...account,opening:{date:'2026-10-16',amount:10}}),/Only an administrator/);
  for(const source of ['expenses','purchases','advances','sales']){
   const sourceKey=`sea_slash_${source}_v1`;
   const bkash={id:'linked',paymentMode:'bkash',bkashSales:100};const cash={id:'cash',paymentMode:'cash',bkashSales:0};
   await write(sourceKey,[bkash,cash]);
   await assert.rejects(write(sourceKey,[cash]),/Only an administrator/);
   await assert.rejects(db.query('delete from public.app_state where key=$1',[sourceKey]),/Only an administrator/);
   await write(sourceKey,[bkash]); // Removing unrelated cash rows remains unaffected.
   await db.exec("select set_config('test.role','admin',false)");await write(sourceKey,[]);await db.exec("select set_config('test.role','manager',false)");
  }
  await db.exec("select set_config('test.role','admin',false)");
  await assert.rejects(remove({...transfer,amount:50}),/changed in another session/);
  const result=(await remove()).rows[0].account;assert.deepEqual(result.transfers,[out]);assert.deepEqual(result.opening,account.opening);
  await assert.rejects(remove(),/already deleted/);
  await db.exec('set role anon');await assert.rejects(remove(),/permission denied/);
 }finally{await db.close();}
});
