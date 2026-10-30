import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

test('bill receipts update original stock atomically, edits apply deltas and retries do not duplicate stock', async () => {
  const db = new PGlite();
  const stock = [{ id: 'rice', name: 'Rice', currentStock: 10, unit: 'kg', unitCost: 100 }, { id: 'oil', name: 'Oil', currentStock: 2, unit: 'liter', unitCost: 200 }];
  const key = 'sea_slash_vendor_ledger_v1';
  const bill = { id: 'b1', vendorId: 'v', description: 'Rice', date: '2026-10-18', quantity: 5, unit: 'kg', unitPrice: 120, billed: 600, paid: 0, inventoryItemId: 'rice', inventoryQuantity: 5, inventoryUnit: 'kg' };
  const write = (rows: unknown) => db.query('insert into public.app_state(key,value) values ($1,$2::jsonb) on conflict(key) do update set value=excluded.value,updated_at=now()', [key, JSON.stringify(rows)]);
  const inventory = async () => (await db.query<{value: typeof stock}>('select value from public.app_state where key=$1', ['sea_slash_inventory_v1'])).rows[0].value;
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public.app_state(key text primary key,value jsonb not null,updated_at timestamptz default now());
      create function public.can_manage_restaurant() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true) in ('admin','manager'),false)$$;
      create function public.is_restaurant_admin() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true) = 'admin',false)$$;
      grant select,insert,update,delete on public.app_state to authenticated;`);
    const sql = await readFile(new URL('../../supabase-vendor-inventory.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec(await readFile(new URL('../../supabase-balance-security.sql', import.meta.url), 'utf8'));
    await db.query('insert into public.app_state(key,value) values ($1,$2::jsonb)', ['sea_slash_inventory_v1', JSON.stringify(stock)]);
    await db.exec("set role authenticated; select set_config('test.role','manager',false)");
    assert.equal((await db.query<{ready: boolean}>('select public.vendor_inventory_sync_ready() ready')).rows[0].ready, true);
    await write([bill]); assert.equal((await inventory())[0].currentStock, 15); assert.equal((await inventory())[0].unitCost, 120);
    await write([bill]); assert.equal((await inventory())[0].currentStock, 15);
    const edited = { ...bill, quantity: 7, inventoryQuantity: 7, billed: 840 };
    await write([edited]); assert.equal((await inventory())[0].currentStock, 17);
    await write([{ ...edited, paid: 100 }]); assert.equal((await inventory())[0].currentStock, 17);
    await write([{ ...bill, inventoryItemId: 'oil', unit: 'ml', quantity: 500, unitPrice: 1.2, inventoryQuantity: 0.5, inventoryUnit: 'liter' }]);
    assert.equal((await inventory())[0].currentStock, 10); assert.equal((await inventory())[1].currentStock, 2.5);
    await assert.rejects(write([{ ...bill, inventoryQuantity: 500 }]), /does not match/);
    assert.equal((await inventory())[0].currentStock, 10); assert.equal((await inventory())[1].currentStock, 2.5);
    await assert.rejects(write([{ ...bill, inventoryItemId: 'missing' }]), /no longer exists/);
    await write([{ ...bill, inventoryItemId: 'oil', unit: 'bottle', quantity: 2, unitPrice: 300, inventoryQuantity: 1.5, inventoryUnit: 'liter' }]);
    assert.equal((await inventory())[1].currentStock, 3.5);
    // Consumed inventory cannot be silently driven negative by removing an old receipt.
    await db.exec(`update public.app_state set value=jsonb_set(value,'{1,currentStock}','0') where key='sea_slash_inventory_v1'`);
    await assert.rejects(write([]), /negative/);
    assert.equal((await db.query<{value: unknown[]}>('select value from public.app_state where key=$1', [key])).rows[0].value.length, 1);
    await db.exec("select set_config('test.role','chef',false)");
    await assert.rejects(write([bill]), /manager access/);
  } finally { await db.close(); }
});

test('deleted inventory receipts do not block new bills, payments, or replacement items', async () => {
  const db = new PGlite();
  const key = 'sea_slash_vendor_ledger_v1';
  const stockKey = 'sea_slash_inventory_v1';
  const bill = { id: 'old-bill', vendorId: 'v', description: 'Rice', date: '2026-10-18', quantity: 5, unit: 'kg', unitPrice: 100, billed: 500, paid: 0, inventoryItemId: 'deleted-rice', inventoryQuantity: 5, inventoryUnit: 'kg' };
  const write = (rows: unknown[]) => db.query('update public.app_state set value=$2::jsonb where key=$1', [key, JSON.stringify(rows)]);
  const inventory = async () => (await db.query<{value: any[]}>('select value from public.app_state where key=$1', [stockKey])).rows[0].value;
  const ledger = async () => (await db.query<{value: any[]}>('select value from public.app_state where key=$1', [key])).rows[0].value;
  const create = async (row: unknown) => (await db.query<{value: any}>('select public.save_vendor_bill_inventory_item($1::jsonb) value', [JSON.stringify(row)])).rows[0].value;
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public.app_state(key text primary key,value jsonb not null,updated_at timestamptz default now());
      create function public.can_manage_restaurant() returns boolean language sql stable as $$select true$$;
      create function public.is_restaurant_admin() returns boolean language sql stable as $$select true$$;
      grant all on public.app_state to authenticated;`);
    await db.exec(await readFile(new URL('../../supabase-vendor-inventory.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../../supabase-vendor-inventory-create.sql', import.meta.url), 'utf8'));
    await db.query('insert into public.app_state(key,value) values ($1,$2::jsonb),($3,$4::jsonb),($5,$6::jsonb)', [stockKey, JSON.stringify([
      {id: 'deleted-rice', name: 'Rice', currentStock: 0, unit: 'kg', unitCost: 100},
      {id: 'existing', name: 'Existing Rice', currentStock: 10, unit: 'kg', unitCost: 90},
    ]), key, '[]', 'sea_slash_vendors_v1', '[{"id":"v","name":"Vendor"}]']);
    await write([bill]);
    await db.query('update public.app_state set value=$2::jsonb where key=$1', [stockKey, JSON.stringify((await inventory()).filter(item => item.id !== 'deleted-rice'))]);
    const newBill = { ...bill, id: 'new-bill', description: 'Existing Rice', inventoryItemId: 'existing', quantity: 2, inventoryQuantity: 2, unitPrice: 110, billed: 220 };
    await write([bill, newBill]);
    assert.equal((await inventory())[0].currentStock, 12);
    await write([{ ...bill, paid: 50 }, newBill]);
    assert.equal((await inventory())[0].currentStock, 12);
    await assert.rejects(write([{ ...bill, inventoryQuantity: 6, quantity: 6, billed: 600 }, newBill]), /Select an existing item/);
    await assert.rejects(write([bill, newBill, { ...bill, id: 'invalid-new-link' }]), /no longer exists/);
    // Relink the deleted receipt to an existing item: add its full quantity once.
    const replacement = { ...bill, inventoryItemId: 'existing', description: 'Existing Rice' };
    await write([replacement, newBill]);
    assert.equal((await inventory())[0].currentStock, 17);
    await write([replacement, newBill]);
    assert.equal((await inventory())[0].currentStock, 17);
    // Deleting that target must also permit creating a genuinely new product.
    await db.query('update public.app_state set value=$2::jsonb where key=$1', [stockKey, '[]']);
    const created = await create({ ...bill, description: 'New Rice', createInventoryItem: true });
    assert.equal(created.created, true);
    assert.equal(created.inventory.length, 1);
    assert.equal(created.inventory[0].currentStock, 5);
    const retry = await create({ ...bill, description: 'New Rice', createInventoryItem: true });
    assert.equal(retry.inventory[0].currentStock, 5);
    assert.equal((await ledger()).reduce((sum, row) => sum + row.billed, 0), 720);
  } finally { await db.close(); }
});

test('replacement bills set the original quantity and value without replaying consumed stock or reversing old receipts',async()=>{
 const db=new PGlite();const stockKey='sea_slash_inventory_v1';const ledgerKey='sea_slash_vendor_ledger_v1';
 const write=(rows:unknown[])=>db.query('insert into public.app_state(key,value) values($1,$2::jsonb) on conflict(key) do update set value=excluded.value',[ledgerKey,JSON.stringify(rows)]);
 const stock=async()=>(await db.query<{value:any[]}>('select value from public.app_state where key=$1',[stockKey])).rows[0].value;
 const bill={id:'replace-1',vendorId:'v',date:'2026-10-20',description:'Rice',quantity:10,unit:'kg',unitPrice:120,billed:1200,paid:0,inventoryItemId:'rice',inventoryQuantity:10,inventoryUnit:'kg',inventoryUpdateMode:'replace'};
 try{
  await db.exec(`create role anon;create role authenticated;
   create table public.app_state(key text primary key,value jsonb,updated_at timestamptz default now());
   create function public.can_manage_restaurant() returns boolean language sql stable as $$select true$$;
   create function public.is_restaurant_admin() returns boolean language sql stable as $$select true$$;
   grant all on public.app_state to authenticated;`);
  await db.exec(await readFile(new URL('../../supabase-vendor-inventory.sql',import.meta.url),'utf8'));
  await db.query('insert into public.app_state(key,value) values($1,$2::jsonb)',[stockKey,JSON.stringify([{id:'rice',name:'Rice',currentStock:5,unit:'kg',unitCost:90}])]);
  await write([bill]);assert.equal((await stock()).length,1);assert.equal((await stock())[0].currentStock,10);assert.equal((await stock())[0].unitCost,120);
  assert.equal((await stock())[0].currentStock*(await stock())[0].unitCost,1200);
  await db.exec(`update public.app_state set value=jsonb_set(value,'{0,currentStock}','8') where key='sea_slash_inventory_v1'`);
  await write([{...bill,paid:200}]);assert.equal((await stock())[0].currentStock,8);
  await write([bill]);assert.equal((await stock())[0].currentStock,8);
  const edited={...bill,quantity:12,inventoryQuantity:12,unitPrice:150,billed:1800};
  await write([edited]);assert.equal((await stock())[0].currentStock,12);assert.equal((await stock())[0].unitCost,150);
  const second={...bill,id:'replace-2',quantity:3,inventoryQuantity:3,unitPrice:100,billed:300};
  await write([edited,second]);assert.equal((await stock())[0].currentStock,3);
  await write([edited,second,{id:'pay',vendorId:'v',date:'2026-10-20',description:'Payment',billed:0,paid:50}]);assert.equal((await stock())[0].currentStock,3);
  await write([edited]);assert.equal((await stock())[0].currentStock,3);
  await assert.rejects(write([edited,{...second,inventoryQuantity:100}]),/does not match/);assert.equal((await stock())[0].currentStock,3);
  const legacy={...bill,id:'legacy',inventoryUpdateMode:undefined,quantity:2,inventoryQuantity:2,unitPrice:90,billed:180};
  await write([edited,legacy]);assert.equal((await stock())[0].currentStock,5);
  await write([edited,{...legacy,inventoryUpdateMode:'replace'}]);assert.equal((await stock())[0].currentStock,2);
  await write([]);assert.equal((await stock())[0].currentStock,2);
 }finally{await db.close();}
});

test('unchanged legacy receipts never block an amount-only bill or a valid fractional replacement',async()=>{
 const db=new PGlite();const key='sea_slash_vendor_ledger_v1',stockKey='sea_slash_inventory_v1';
 // An earlier frontend stored quantities under quantityKg / pricePerKg.
 const historical={id:'legacy',vendorId:'old-vendor',date:'2026-10-18',description:'Old purchase',quantityKg:1,pricePerKg:100,billed:100,paid:0,inventoryItemId:'old-item',inventoryQuantity:1,inventoryUnit:'kg'};
 const amountOnly={id:'plain',vendorId:'aminul',date:'2026-10-22',description:'Kacha Morich / green chili',billed:25,paid:0};
 const measured={...amountOnly,id:'new-measured',quantity:.25,unit:'kg',unitPrice:100,inventoryItemId:'chili',inventoryQuantity:.25,inventoryUnit:'kg',inventoryUpdateMode:'replace'};
 const write=(rows:unknown[])=>db.query('update app_state set value=$2::jsonb where key=$1',[key,JSON.stringify(rows)]);
 const inventory=async()=>(await db.query<{value:any[]}>('select value from app_state where key=$1',[stockKey])).rows[0].value;
 try{
  await db.exec(`create role anon;create role authenticated;create table app_state(key text primary key,value jsonb,updated_at timestamptz default now());
   create function public.can_manage_restaurant() returns boolean language sql stable as $$select true$$;`);
  await db.query('insert into app_state(key,value) values($1,$2::jsonb),($3,$4::jsonb)',[key,JSON.stringify([historical]),stockKey,JSON.stringify([{id:'old-item',name:'Old item',unit:'kg',currentStock:2,unitCost:100},{id:'chili',name:'Kacha Morich / green chili',unit:'kg',currentStock:.5,unitCost:80}])]);
  await db.exec(await readFile(new URL('../../supabase-vendor-inventory.sql',import.meta.url),'utf8'));
  await write([historical,amountOnly]);assert.equal((await inventory())[1].currentStock,.5);
  await write([historical,amountOnly,measured]);assert.equal((await inventory())[1].currentStock,.25);assert.equal((await inventory())[1].unitCost,100);assert.equal((await inventory())[0].currentStock,2);
  await write([{...historical,paid:50},amountOnly,measured]);assert.equal((await inventory())[1].currentStock,.25);
  await assert.rejects(write([historical,amountOnly,{...measured,inventoryUnit:'liter'}]),/Invalid inventory-linked bill/);
  await assert.rejects(write([{...historical,quantityKg:2},amountOnly,measured]),/Invalid inventory-linked bill/);
  assert.equal((await inventory())[1].currentStock,.25);
 }finally{await db.close();}
});
