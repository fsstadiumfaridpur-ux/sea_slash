import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

test('expense writes confirm the server and merge concurrent records safely', async t => {
  const expense = { id: 'salary', title: 'Salary Payment', month: '2026-10', date: '2026-10-05', category: 'payroll', staffId: 'chef', salaryMonth: '2026-10', amount: 1000, paymentMode: 'cash', isRecurring: false };
  let current: any = { value: [], updated_at: 'revision-1' };
  let admin = true, ready = true, networkError = false, conflict = false;
  let writes = 0;
  const client = {
    rpc: async (name: string) => ({ data: name === 'can_manage_restaurant' ? admin : ready, error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: structuredClone(current), error: null }) }) }),
      insert: (row: any) => ({ select: async () => { writes++; current = row; return { data: [{ value: row.value }], error: null }; } }),
      update: (row: any) => ({ eq: () => ({ eq: () => ({ select: async () => {
        writes++;
        if (networkError) return { error: { message: 'Network unavailable' } };
        if (conflict) { conflict = false; current = { value: [...current.value, { ...expense, id: 'transport', category: 'transport', amount: 200 }], updated_at: 'revision-2' }; return { data: [], error: null }; }
        current = row; return { data: [{ value: row.value }], error: null };
      } }) }) }),
    }),
  };
  const result = await build({ entryPoints: [fileURLToPath(new URL('../lib/expenses.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'mock-supabase', setup(build) { build.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'mock:supabase', external: true })); } }],
  });
  const module = { exports: {} as any };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: () => ({ supabase: client }), Date, Number, Error });
  const api = module.exports;
  await t.test('salary data cannot save before privacy migration', async () => { ready = false; await assert.rejects(api.recordExpense(expense), /supabase-expense-security.sql/); assert.equal(writes, 0); ready = true; });
  await t.test('non-admin writes are rejected', async () => { admin = false; await assert.rejects(api.recordExpense(expense), /Administrator/); assert.equal(writes, 0); admin = true; });
  await t.test('network failures never report successful payments', async () => { networkError = true; await assert.rejects(api.recordExpense(expense), /Network/); assert.equal(current.value.length, 0); networkError = false; });
  await t.test('concurrent expenses survive salary payment and retries do not duplicate it', async () => { conflict = true; await api.recordExpense(expense); await api.recordExpense(expense); assert.equal(current.value.length, 2); assert.equal(current.value.find((r: any) => r.id === 'transport').amount, 200); });
  await t.test('deleting a payment preserves other expenses', async () => { await api.deleteExpense('salary'); assert.equal(current.value.length, 1); assert.equal(current.value[0].id, 'transport'); });
  await t.test('first expense inserts a new state row', async () => { current = null; await api.recordExpense(expense); assert.equal(current.value[0].id, 'salary'); });
});
