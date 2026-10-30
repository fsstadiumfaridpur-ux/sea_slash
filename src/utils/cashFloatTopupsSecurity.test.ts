import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
test('cash top-ups add to the saved float, require the confirmed balance, and never duplicate on retries',async()=>{
 const db=new PGlite();const key='sea_slash_cash_float_v1_2026-10-29';
 const add=(id:number,amount:number,expected:number)=>(db.query<{value:{total:number;alreadyApplied:boolean}}>('select public.add_daily_cash_float($1,$2,$3,$4) value',[`00000000-0000-4000-8000-${String(id).padStart(12,'0')}`,'2026-10-29',amount,expected]));
 const total=async()=>(await db.query<{value:number}>('select value from public.app_state where key=$1',[key])).rows[0]?.value;
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;
   create function public.can_manage_restaurant() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true) in ('admin','manager'),false)$$;
   create table public.app_state(key text primary key,value jsonb,updated_at timestamptz);
   grant all on public.app_state to authenticated;`);
  const sql=await readFile(new URL('../../supabase-cash-float-topups.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  await db.exec("set role authenticated;select set_config('test.role','admin',false)");
  assert.equal((await add(1,900,0)).rows[0].value.total,900);
  assert.equal((await add(2,300,900)).rows[0].value.total,1200);
  assert.equal((await add(2,300,900)).rows[0].value.alreadyApplied,true);assert.equal(await total(),1200);
  await assert.rejects(add(2,500,1200),/reference was already used/);
  await assert.rejects(add(3,100,900),/changed in another session/);assert.equal(await total(),1200);
  await add(3,100,1200);assert.equal(await total(),1300);
  await assert.rejects(add(4,-100,1300),/positive cash top-up/);
  await assert.rejects(add(4,0,1300),/positive cash top-up/);
  await assert.rejects(add(4,0.001,1300),/positive cash top-up/);
  await assert.rejects(db.query('update public.app_state set value=\'300\' where key=$1',[key]),/only increase/);
  await assert.rejects(db.query('delete from public.app_state where key=$1',[key]),/cannot be withdrawn/);
  await assert.rejects(db.query("update public.app_state set key='moved' where key=$1",[key]),/Cannot move/);
  await assert.rejects(db.query('select * from public.restaurant_cash_float_additions'),/permission denied/);
  await db.exec("select set_config('test.role','manager',false)");await add(4,0.25,1300);assert.equal(await total(),1300.25);
  await db.exec("select set_config('test.role','chef',false)");await assert.rejects(add(5,10,1300.25),/manager access/);
  await db.exec('set role anon');await assert.rejects(add(5,10,1300.25),/permission denied/);
 }finally{await db.close();}
});
