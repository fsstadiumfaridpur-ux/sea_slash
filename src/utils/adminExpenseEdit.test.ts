import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { linkedExpenses } from './linkedExpenses';
import type { PurchaseRecord } from '../types';
const purchase: PurchaseRecord = { id: 'purchase', date: '2026-10-18', itemId: 'rice', itemName: 'Rice', quantity: 5, unit: 'kg', unitPrice: 100, totalCost: 500, supplier: 'Vendor', paymentMode: 'cash' };
test('admin purchase edits keep a single daily expense and atomically correct original stock', async () => {
  const db = new PGlite();
  const edit = async (previous: PurchaseRecord, next: PurchaseRecord) => (await db.query<{value: {purchases: PurchaseRecord[]; inventory: {currentStock: number}[]}}>('select public.edit_restaurant_purchase($1::jsonb,$2::jsonb) value', [JSON.stringify(previous), JSON.stringify(next)])).rows[0].value;
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public.app_state(key text primary key,value jsonb not null,updated_at timestamptz default now());
      grant all on public.app_state to authenticated;
      create function public.is_restaurant_admin() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true) = 'admin',false)$$;`);
    const migration = await readFile(new URL('../../supabase-admin-purchase-edit.sql', import.meta.url), 'utf8');
    await db.exec(migration); await db.exec(migration);
    await db.query('insert into public.app_state(key,value) values ($1,$2::jsonb),($3,$4::jsonb)', ['sea_slash_inventory_v1', JSON.stringify([{ id: 'rice', unit: 'kg', unitCost: 100, currentStock: 12 }]), 'sea_slash_purchases_v1', JSON.stringify([purchase])]);
    await db.exec("set role authenticated; select set_config('test.role','manager',false)");
    await assert.rejects(edit(purchase, { ...purchase, quantity: 7, totalCost: 700 }), /Administrator access/);
    await db.exec("select set_config('test.role','admin',false)");
    const next = { ...purchase, quantity: 7, totalCost: 700, date: '2026-10-19', paymentMode: 'bkash' as const };
    const result = await edit(purchase, next);
    assert.equal(result.inventory[0].currentStock, 14);
    const expenses = linkedExpenses([], result.purchases, [], [], []);
    assert.equal(expenses.length, 1); assert.equal(expenses[0].amount, 700); assert.equal(expenses[0].date, '2026-10-19');
    await assert.rejects(edit(purchase, next), /another session/);
    const financial = { ...next, unitPrice: 120, totalCost: 840 };
    assert.equal((await edit(next, financial)).inventory[0].currentStock, 14);
    await db.exec(`update public.app_state set value=jsonb_set(value,'{0,currentStock}','0') where key='sea_slash_inventory_v1'`);
    await assert.rejects(edit(financial, { ...financial, quantity: 1, totalCost: 120 }), /negative/);
    const current = (await db.query<{value: PurchaseRecord[]}>('select value from public.app_state where key=$1', ['sea_slash_purchases_v1'])).rows[0].value;
    assert.equal(current[0].quantity, 7);
    await assert.rejects(edit(financial, { ...financial, itemId: 'other' }), /ingredient and unit/);
  } finally { await db.close(); }
});
