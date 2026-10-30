import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('Hard Cash is private to admins, totals are exact and retries never duplicate transactions',async()=>{
 const db=new PGlite();
 const id='00000000-0000-4000-8000-000000000001',outId='00000000-0000-4000-8000-000000000002';
 const add=(entryId:string,direction:string,amount:number,reason='Opening cash')=>db.query<{snapshot:any}>('select public.add_hard_cash_entry($1,$2,$3,$4,$5) snapshot',[entryId,'2026-10-29',direction,amount,reason]);
 const read=async()=>(await db.query<{snapshot:any}>('select public.hard_cash_snapshot() snapshot')).rows[0].snapshot;
 try{
  await db.exec(`create role anon;create role authenticated;
   create function public.is_restaurant_admin() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true)='admin',false)$$;`);
  const sql=await readFile(new URL('../../supabase-hard-cash.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  await db.exec("set role authenticated;select set_config('test.role','admin',false)");
  assert.deepEqual(await read(),{entries:[],balance:0,totalIn:0,totalOut:0});
  await add(id,'in',1000.25);await add(id,'in',1000.25);
  await add(outId,'out',200.10,'Supplier payment');
  let snapshot=await read();assert.equal(snapshot.entries.length,2);assert.equal(snapshot.balance,800.15);assert.equal(snapshot.totalIn,1000.25);assert.equal(snapshot.totalOut,200.1);
  await assert.rejects(add(id,'in',2000),/changed/);
  for(const value of [0,-1,1.001,1000000000])await assert.rejects(add('00000000-0000-4000-8000-000000000003','in',value));
  await assert.rejects(add('00000000-0000-4000-8000-000000000003','in',10,'   '));
  await assert.rejects(add('00000000-0000-4000-8000-000000000003','invalid',10));
  for(const role of ['manager','chef','']){
   await db.query("select set_config('test.role',$1,false)",[role]);
   await assert.rejects(read(),/Administrator access required/);
   await assert.rejects(add('00000000-0000-4000-8000-000000000003','in',10),/Administrator access required/);
   await assert.rejects(db.query('select public.delete_hard_cash_entry($1)',[id]),/Administrator access required/);
   await assert.rejects(db.query('select * from public.restaurant_hard_cash'),/permission denied/);
   await assert.rejects(db.query('delete from public.restaurant_hard_cash'),/permission denied/);
   await assert.rejects(db.query('insert into public.restaurant_hard_cash(id,date,direction,amount,reason) values($1,current_date,\'in\',10,\'bypass\')',['00000000-0000-4000-8000-000000000003']),/permission denied/);
  }
  await db.exec("select set_config('test.role','admin',false)");
  await db.query('select public.delete_hard_cash_entry($1)',[outId]);snapshot=await read();assert.equal(snapshot.balance,1000.25);assert.equal(snapshot.totalOut,0);
  await db.query('select public.delete_hard_cash_entry($1)',[id]);assert.equal((await read()).balance,0);
  await db.exec('set role anon');await assert.rejects(read(),/permission denied/);
 }finally{await db.close();}
});
