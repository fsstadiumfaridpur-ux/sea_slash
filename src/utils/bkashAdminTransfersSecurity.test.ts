import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('manual bKash account is admin-only, including inserts, upserts and key renames; vendor payments remain available',async()=>{
 const db=new PGlite();const key='sea_slash_bkash_account_v1';
 const account={opening:{date:'2026-10-16',amount:0},transfers:[]};
 const transfer={id:'t1',date:'2026-10-29',direction:'in',amount:100,description:'Deposit',reference:''};
 const write=(k:string,value:unknown)=>db.query('insert into public.app_state(key,value) values($1,$2::jsonb) on conflict(key) do update set value=excluded.value',[k,JSON.stringify(value)]);
 try{
  await db.exec(`create role anon;create role authenticated;create table public.app_state(key text primary key,value jsonb not null,updated_at timestamptz default now());
   create function public.is_restaurant_admin() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true)='admin',false)$$;
   grant all on public.app_state to authenticated;`);
  for(const file of ['supabase-bkash-delete.sql','supabase-bkash-admin-transfers.sql','supabase-bkash-admin-transfers.sql'])await db.exec(await readFile(new URL('../../'+file,import.meta.url),'utf8'));
  await db.exec('set role authenticated');
  for(const role of ['manager','chef','']){
   await db.query("select set_config('test.role',$1,false)",[role]);await assert.rejects(write(key,account),/Only an administrator/);
   await write('other',account);await assert.rejects(db.query('update public.app_state set key=$1 where key=\'other\'',[key]),/Only an administrator/);
  }
  await db.exec("select set_config('test.role','admin',false)");await write(key,account);await write(key,{...account,transfers:[transfer]});
  await db.exec("select set_config('test.role','manager',false)");
  await assert.rejects(write(key,{...account,transfers:[transfer,{...transfer,id:'out',direction:'out'}]}),/Only an administrator/);
  await assert.rejects(write(key,account),/Only an administrator/);
  await assert.rejects(db.query('delete from public.app_state where key=$1',[key]),/Only an administrator/);
  await assert.rejects(db.query('update public.app_state set key=\'renamed\' where key=$1',[key]),/Cannot rename|Only an administrator/);
  // Recording bKash vendor payments as expenses never mutates the manual account.
  await write('sea_slash_expenses_v1',[{id:'vendor-payment',paymentMode:'bkash',vendorId:'v',amount:50}]);
  const current=(await db.query<{value:any}>('select value from public.app_state where key=$1',[key])).rows[0].value;
  assert.equal(current.transfers.length,1);
  await db.exec("select set_config('test.role','admin',false)");
  await db.query('select public.delete_bkash_transfer($1,$2::jsonb)',['t1',JSON.stringify(transfer)]);
  await write(key,{...account,transfers:[{...transfer,id:'admin-out',direction:'out'}]});
 }finally{await db.close();}
});
