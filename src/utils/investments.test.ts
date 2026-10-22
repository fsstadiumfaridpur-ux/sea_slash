import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { investmentTotals, validateInvestment } from './investments';

const entry = { id: 'equipment-1', date: '2026-10-05', description: 'Oven', category: 'Equipment', amount: 0.1, notes: '' };
test('investment calculator starts empty and sums actual entries without decimal drift', () => {
  assert.deepEqual(investmentTotals([]), { total: 0, categories: {} });
  assert.deepEqual(investmentTotals([entry, { ...entry, id: 'equipment-2', amount: 0.2 }, { ...entry, id: 'deposit', category: 'Rent deposit', amount: 5000 }]), { total: 5000.3, categories: { Equipment: 0.3, 'Rent deposit': 5000 } });
});
test('investment records require valid amounts, dates and descriptions', () => {
  validateInvestment(entry);
  for (const amount of [0, -1, NaN, Infinity, 0.001]) assert.throws(() => validateInvestment({ ...entry, amount }));
  for (const date of ['', '2026-02-30', 'not-a-date']) assert.throws(() => validateInvestment({ ...entry, date }));
  assert.throws(() => validateInvestment({ ...entry, description: ' ' }));
});
test('investment SQL is repeatable and restricts reads and writes to admin', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('request.jwt.claim.email', true)) $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
      create table public.app_state(key text primary key, value jsonb not null, updated_at timestamptz default now());
      insert into public.app_state values ('sea_slash_investments_v1','[]'),('sea_slash_purchases_v1','[]');`);
    await db.exec(await readFile(new URL('../../supabase-admin-security.sql', import.meta.url), 'utf8'));
    const sql = await readFile(new URL('../../supabase-investment-security.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec('set role anon');
    assert.equal((await db.query("select * from public.app_state where key='sea_slash_investments_v1'")).rows.length, 0);
    assert.equal((await db.query("select * from public.app_state where key='sea_slash_purchases_v1'")).rows.length, 1);
    await assert.rejects(db.exec("insert into public.app_state values ('sea_slash_investments_v1','[]') on conflict(key) do update set value=excluded.value"), /row-level security/);
    await assert.rejects(db.exec('select public.restaurant_investment_security_ready()'), /permission denied/);
    await db.exec("reset role; select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false); select set_config('request.jwt.claim.email','staff@example.com',false); set role authenticated;");
    assert.equal((await db.query("select * from public.app_state where key='sea_slash_investments_v1'")).rows.length, 0);
    assert.equal((await db.query<{ ready: boolean }>('select public.restaurant_investment_security_ready() as ready')).rows[0].ready, false);
    await db.exec("reset role; select set_config('request.jwt.claim.sub','410baf80-c3ed-4b8c-b312-3e0519a61948',false); select set_config('request.jwt.claim.email','officialmughalmahal@gmail.com',false); set role authenticated;");
    assert.equal((await db.query<{ ready: boolean }>('select public.restaurant_investment_security_ready() as ready')).rows[0].ready, true);
    await db.exec("update public.app_state set value='[{\"id\":\"real-investment\"}]' where key='sea_slash_investments_v1'");
    assert.equal((await db.query("select * from public.app_state where key='sea_slash_investments_v1'")).rows.length, 1);
  } finally { await db.close(); }
});
