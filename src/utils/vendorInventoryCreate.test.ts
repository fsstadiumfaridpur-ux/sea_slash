import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { matchingInventoryNames } from './inventorySuggestions';
import type { InventoryItem } from '../types';
const bill = { id: 'new-bill', vendorId: 'v', date: '2026-10-19', description: 'New Milk', quantity: 3, unit: 'bottle' as const, unitPrice: 60, billed: 180, paid: 0 };

test('existing item identity ignores case, spaces and punctuation without fuzzy merging', () => {
  const items = [{ id: 'rice', name: 'Basmati Rice', unit: 'kg' }, { id: 'chicken', name: 'Boneless', unit: 'kg' }] as InventoryItem[];
  assert.equal(matchingInventoryNames(' BASMATI-RICE ', items)[0].id, 'rice');
  assert.equal(matchingInventoryNames('bone less', items)[0].id, 'chicken');
  assert.equal(matchingInventoryNames('Basmati Rice Premium', items).length, 0);
});
test('vendor bills restock originals without copies and explicitly create new items with categories', async () => {
  const db = new PGlite();
  const key = 'sea_slash_vendor_ledger_v1';
  const save = async (row: unknown) => (await db.query<{value: any}>('select public.save_vendor_bill_inventory_item($1::jsonb) value', [JSON.stringify(row)])).rows[0].value;
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public.app_state(key text primary key,value jsonb not null,updated_at timestamptz default now());
      grant all on public.app_state to authenticated;
      create function public.can_manage_restaurant() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true) in ('admin','manager'),false)$$;
      create function public.is_restaurant_admin() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true) = 'admin',false)$$;`);
    await db.exec(await readFile(new URL('../../supabase-vendor-inventory.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../../supabase-balance-security.sql', import.meta.url), 'utf8'));
    const sql = await readFile(new URL('../../supabase-vendor-inventory-create.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.query('insert into public.app_state(key,value) values ($1,$2::jsonb),($3,$4::jsonb)', ['sea_slash_vendors_v1','[{"id":"v","name":"Vendor"}]','sea_slash_inventory_v1','[{"id":"rice","name":"Rice","category":"rice_grain","unit":"kg","currentStock":10,"unitCost":100}]']);
    await db.exec("set role authenticated; select set_config('test.role','manager',false)");
    const created = await save(bill);
    assert.equal(created.created, true); assert.equal(created.inventory.length, 2);
    const milk = created.inventory.find((item: any) => item.name === 'New Milk');
    assert.equal(milk.currentStock, 3); assert.equal(milk.unit, 'bottle'); assert.equal(milk.category, 'uncategorized'); assert.equal(milk.unitCost, 60);
    assert.equal(created.ledger[0].inventoryItemId, milk.id);
    const retry = await save(bill);
    assert.equal(retry.created, false); assert.equal(retry.inventory.length, 2); assert.equal(retry.inventory.find((item: any) => item.id === milk.id).currentStock, 3);
    await assert.rejects(save({ ...bill, id: 'bad', description: 'Invalid product', date: 'not-a-date' }), /valid date/);
    assert.equal((await db.query<{value: any[]}>('select value from public.app_state where key=$1',['sea_slash_inventory_v1'])).rows[0].value.length, 2);
    const existing = await save({ ...bill, id: 'rice-bill', description: ' R I C E ', quantity: 5, unit: 'kg', unitPrice: 100, billed: 500 });
    assert.equal(existing.created, false); assert.equal(existing.inventory.length, 2);
    assert.equal(existing.inventory.find((item: any) => item.id === 'rice').currentStock, 15);
    const correction = await save({ ...bill, id: 'rice-bill', description: 'Rice', quantity: 7, unit: 'kg', unitPrice: 110, billed: 770 });
    assert.equal(correction.inventory.find((item: any) => item.id === 'rice').currentStock, 17);
    assert.equal(correction.inventory.find((item: any) => item.id === 'rice').unitCost, 110);
    assert.equal(correction.inventory.length, 2);
    await assert.rejects(save({ ...bill, id: 'category-denied', description: 'Distinct product', inventoryCategoryName: 'Custom' }), /Administrator access/);
    await db.exec("select set_config('test.role','admin',false)");
    const custom = await save({ ...bill, id: 'custom', description: 'New packaging', inventoryCategoryName: 'New Packaging' });
    const categoryRows = (await db.query<{value: any[]}>('select value from public.app_state where key=$1',['sea_slash_inventory_categories_v1'])).rows[0].value;
    assert.equal(categoryRows.length, 1);
    assert.equal(custom.inventory.find((item: any) => item.name === 'New packaging').category, categoryRows[0].id);
    await db.exec("select set_config('test.role','chef',false)");
    await assert.rejects(save({ ...bill, id: 'chef' }), /manager access/);
  } finally { await db.close(); }
});
