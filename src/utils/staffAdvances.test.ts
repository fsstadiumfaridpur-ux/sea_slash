import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { mergeAdvanceChanges } from './staffAdvances';
import type { StaffAdvance } from '../types';
const advance: StaffAdvance = { id: 'a1', staffId: 'staff', date: '2026-10-18', amount: 500, reason: 'Travel', repaid: false, paymentMode: 'cash' };
test('managers add new advances but only admins edit them; concurrent records are retained', () => {
  const added = { ...advance, id: 'new' };
  const concurrent = { ...advance, id: 'concurrent' };
  assert.deepEqual(mergeAdvanceChanges([advance], [added, advance], [advance, concurrent], false), [added, advance, concurrent]);
  assert.throws(() => mergeAdvanceChanges([advance], [{ ...advance, amount: 600 }], [advance], false), /Only administrators/);
  assert.throws(() => mergeAdvanceChanges([advance], [{ ...advance, repaid: true }], [advance], false), /Only administrators/);
  assert.throws(() => mergeAdvanceChanges([advance], [], [advance], false), /Only administrators/);
  assert.equal(mergeAdvanceChanges([advance], [{ ...advance, amount: 600 }], [advance], true)[0].amount, 600);
  assert.throws(() => mergeAdvanceChanges([advance], [{ ...advance, amount: 600 }], [{ ...advance, amount: 700 }], true), /another session/);
});
test('database blocks manager edits, removals and repaid toggles even through direct upserts', async () => {
  const db = new PGlite();
  const key = 'sea_slash_advances_v1';
  const write = (rows: unknown) => db.query('insert into public.app_state(key,value) values ($1,$2::jsonb) on conflict(key) do update set value=excluded.value', [key, JSON.stringify(rows)]);
  try {
    await db.exec(`create role authenticated; create table public.app_state(key text primary key,value jsonb not null);
      grant all on public.app_state to authenticated;
      create function public.is_restaurant_admin() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true) = 'admin',false)$$;
      create function public.can_manage_restaurant() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true) in ('admin','manager'),false)$$;`);
    const sql = await readFile(new URL('../../supabase-advance-security.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec("set role authenticated; select set_config('test.role','manager',false)");
    await write([advance]); await write([advance, { ...advance, id: 'new' }]);
    for (const changed of [{ ...advance, amount: 600 }, { ...advance, repaid: true }, { ...advance, staffId: 'other' }, { ...advance, reason: 'Changed' }, { ...advance, date: '2026-10-19' }, { ...advance, paymentMode: 'bank' }]) await assert.rejects(write([changed, { ...advance, id: 'new' }]), /Only administrators/);
    await assert.rejects(write([advance, { ...advance, id: 'new' }, { ...advance, id: 'forged', repaid: true }]), /start unpaid/);
    await assert.rejects(write([]), /Only administrators/);
    await assert.rejects(db.query('delete from public.app_state where key=$1', [key]), /Only administrators/);
    await db.exec("select set_config('test.role','admin',false)");
    await write([{ ...advance, amount: 600, repaid: true }]);
    await db.exec("select set_config('test.role','manager',false)");
    await write([{ ...advance, amount: 600, repaid: true }, { ...advance, id: 'next' }]);
    await db.exec("select set_config('test.role','chef',false)");
    await assert.rejects(write([advance]), /manager access/);
  } finally { await db.close(); }
});
