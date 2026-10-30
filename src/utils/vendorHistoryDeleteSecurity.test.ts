import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ledgerKey='sea_slash_vendor_ledger_v1';
const expenseKey='sea_slash_expenses_v1';
const stockKey='sea_slash_inventory_v1';
test('only admin can delete bills and source expense payments; atomic stock and stale-record protections remain',async()=>{
  const db=new PGlite();
  const bill={id:'b1',vendorId:'v1',date:'2026-10-29',description:'Rice',quantity:5,unit:'kg',unitPrice:100,billed:500,paid:0,inventoryItemId:'rice',inventoryQuantity:5,inventoryUnit:'kg',inventoryUpdateMode:'replace'};
  const payment={id:'p1',vendorId:'v1',date:'2026-10-29',description:'Paid',billed:0,paid:200};
  const expense={id:'e1',vendorId:'v1',title:'Vendor paid',category:'ingredients',date:'2026-10-29',paymentMode:'bkash',amount:100};
  const read=async(key:string)=>(await db.query<{value:any[]}>('select value from public.app_state where key=$1',[key])).rows[0]?.value??[];
  const write=async(key:string,rows:unknown[])=>db.query('insert into public.app_state(key,value) values ($1,$2) on conflict(key) do update set value=excluded.value',[key,JSON.stringify(rows)]);
  const remove=async(key:string,entry:any)=>db.query<{result:any}>('select public.delete_vendor_history_entry($1,$2,$3::jsonb) result',[key,entry.id,JSON.stringify(entry)]);
  try{
    await db.exec(`create role anon; create role authenticated;
      create table public.app_state(key text primary key,value jsonb not null,updated_at timestamptz default now());
      create function public.can_manage_restaurant() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true) in ('admin','manager'),false)$$;
      create function public.is_restaurant_admin() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true)='admin',false)$$;
      grant all on public.app_state to authenticated;`);
    for(const file of ['supabase-balance-security.sql','supabase-vendor-inventory.sql','supabase-vendor-history-delete.sql','supabase-vendor-history-delete.sql']) await db.exec(await readFile(new URL('../../'+file,import.meta.url),'utf8'));
    await db.exec("set role authenticated; select set_config('test.role','admin',false)");
    await write(stockKey,[{id:'rice',name:'Rice',currentStock:10,unit:'kg',unitCost:90}]);
    await write(ledgerKey,[bill,payment]);
    await write(expenseKey,[expense,{id:'misc',title:'Cleaning',amount:10,category:'other'}]);
    await db.exec("select set_config('test.role','manager',false)");
    await assert.rejects(remove(ledgerKey,payment),/Only an administrator/);
    await assert.rejects(write(ledgerKey,[bill]),/Only an administrator/);
    await assert.rejects(db.query('delete from public.app_state where key=$1',[ledgerKey]),/administrator|manager/i);
    await assert.rejects(write(expenseKey,[]),/Only an administrator/);
    await assert.rejects(db.query('delete from public.app_state where key=$1',[expenseKey]),/Only an administrator/);
    // Normal editing, adding and paying remain available to managers.
    const edited={...payment,paid:250};
    await write(ledgerKey,[bill,edited,{...payment,id:'p2',paid:50}]);
    await write(expenseKey,[expense]); // Removing a non-vendor expense remains unaffected.
    await db.exec("select set_config('test.role','admin',false)");
    await assert.rejects(remove(ledgerKey,payment),/changed in another session/);
    const result=(await remove(ledgerKey,edited)).rows[0].result;
    assert.deepEqual(result.ledger.map((r:any)=>r.id),['b1','p2']);
    assert.equal(result.inventory[0].currentStock,5);
    await remove(ledgerKey,bill);
    assert.equal((await read(stockKey))[0].currentStock,5); // Replacement receipt deletion leaves current stock alone.
    const removedExpense=(await remove(expenseKey,expense)).rows[0].result;
    assert.deepEqual(removedExpense.expenses,[]);
    assert.deepEqual(removedExpense.ledger.map((r:any)=>r.id),['p2']);
    await assert.rejects(remove(expenseKey,expense),/already deleted/);
    // An old additive receipt cannot drive consumed stock negative; the whole delete rolls back.
    const oldBill={...bill,id:'legacy',inventoryUpdateMode:undefined};
    await write(ledgerKey,[oldBill]);
    await write(stockKey,[{id:'rice',name:'Rice',currentStock:0,unit:'kg',unitCost:100}]);
    await assert.rejects(remove(ledgerKey,oldBill),/negative/);
    assert.equal((await read(ledgerKey))[0].id,'legacy');
    await db.exec('set role anon');
    await assert.rejects(remove(ledgerKey,oldBill),/permission denied/);
  }finally{await db.close();}
});
