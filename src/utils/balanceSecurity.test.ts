import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('managers edit normal bills and payments; only admins adjust final balances', async () => {
  const db = new PGlite();
  const vendorKey = 'sea_slash_vendor_ledger_v1';
  const commissionKey = 'sea_slash_commission_tracking_v1';
  const expenseKey = 'sea_slash_expenses_v1';
  const bill = { id: 'bill-1', vendorId: 'vendor', billed: 100, paid: 0 };
  const payment = { id: 'commission-1', category: 'commission', amount: 100 };
  const write = (key: string, value: unknown) => db.query('insert into public.app_state(key,value) values ($1,$2::jsonb) on conflict(key) do update set value=excluded.value', [key, JSON.stringify(value)]);
  const role = (value: string) => db.query("select set_config('test.access_role',$1,false)", [value]);
  try {
    // Deliberately permissive table access: the trigger must stop API bypasses itself.
    await db.exec(`create role authenticated;
      create table public.app_state(key text primary key,value jsonb not null);
      grant select,insert,update,delete on public.app_state to authenticated;
      create function public.is_restaurant_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.access_role',true) = 'admin',false) $$;
      create function public.can_manage_restaurant() returns boolean language sql stable as $$ select coalesce(current_setting('test.access_role',true) in ('admin','manager'),false) $$;`);
    const sql = await readFile(new URL('../../supabase-balance-security.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec('set role authenticated');
    await role('manager');
    await write(vendorKey, [bill]);
    await write(vendorKey, [bill, { ...bill, id: 'bill-2', paid: 20 }]);
    await write(vendorKey, [{ ...bill, billed: 110, paid: 20 }]);
    await assert.rejects(write(vendorKey, [bill, bill]), /unique valid IDs/);
    const adjustment = { id: 'adjust-1', vendorId: 'vendor', billed: 0, paid: 0, balanceAdjustment: -13 };
    await assert.rejects(write(vendorKey, [bill, adjustment]), /Administrator access/);
    await assert.rejects(db.query('update public.app_state set key=$1 where key=$2', ['renamed', vendorKey]), /State keys/);
    await assert.rejects(write(commissionKey, { paidDates: {}, balanceAdjustments: { '2026-10-18': { amount: -13, reason: 'Rounding' } } }), /Administrator access/);
    await write(expenseKey, [payment]);
    await write(expenseKey, [{ ...payment, amount: 87 }]);
    await write(expenseKey, []);
    await role('admin');
    await write(vendorKey, [{ ...bill, billed: 50, paid: 10 }]);
    await write(commissionKey, { paidDates: { '2026-10-18': 100 } });
    await write(expenseKey, [{ ...payment, amount: 50 }]);
    await write(vendorKey, [bill, adjustment]);
    await role('manager');
    await write(vendorKey, [{ ...bill, paid: 20 }, adjustment]);
    await assert.rejects(write(vendorKey, [bill]), /Administrator access/);
    await assert.rejects(write(vendorKey, [bill, { ...adjustment, balanceAdjustment: 0 }]), /Administrator access/);
    await assert.rejects(write(vendorKey, [bill, { ...adjustment, balanceAdjustment: undefined }]), /Administrator access/);
    await assert.rejects(write(commissionKey, { paidDates: {} }), /Administrator access/);
    await assert.rejects(db.query('delete from public.app_state where key=$1', [commissionKey]), /Administrator access/);
    await role('chef');
    await assert.rejects(write(vendorKey, []), /manager access/);
    await role('admin');
    await db.query('delete from public.app_state where key=$1', [vendorKey]);
    assert.equal((await db.query('select * from public.app_state where key=$1', [vendorKey])).rows.length, 0);
  } finally { await db.close(); }
});
