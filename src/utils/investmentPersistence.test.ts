import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

test('investment writes gate security, preserve concurrent entries and report failures', async () => {
  const entry = { id: 'oven', date: '2026-10-05', description: 'Oven', category: 'Equipment', amount: 1000, notes: '' };
  let current: any = { value: [], updated_at: 'revision-1' };
  let ready = false, conflict = false, networkError = false, writes = 0;
  const client = {
    rpc: async (name:string) => name==='get_investment_workspace'?{data:null,error:{code:'PGRST202'}}:({ data: ready, error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: structuredClone(current), error: null }) }) }),
      insert: (row: any) => ({ select: async () => { writes++; current = row; return { data: [{ value: row.value }], error: null }; } }),
      update: (row: any) => ({ eq: () => ({ eq: () => ({ select: async () => {
        writes++;
        if (networkError) return { error: { message: 'Network unavailable' } };
        if (conflict) { conflict = false; current = { value: [{ ...entry, id: 'deposit', amount: 500 }], updated_at: 'revision-2' }; return { data: [], error: null }; }
        current = row; return { data: [{ value: row.value }], error: null };
      } }) }) }),
    }),
  };
  const result = await build({ entryPoints: [fileURLToPath(new URL('../lib/investments.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'mock-supabase', setup(build) {
      build.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'mock:supabase', external: true }));
      build.onResolve({ filter: /^\.\/appState$/ }, () => ({ path: 'mock:appState', external: true }));
    } }],
  });
  const module = { exports: {} as any };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: (name: string) => name === 'mock:supabase' ? { supabase: client } : { loadAppState: async () => structuredClone(current?.value ?? []) }, Date, Number, Error });
  const api = module.exports;
  await assert.rejects(api.recordInvestment(entry), /supabase-investment-security.sql/);
  await assert.rejects(api.loadInvestments(), /supabase-investment-security.sql/);
  await assert.rejects(api.deleteInvestment('oven'), /supabase-investment-security.sql/);
  assert.equal(writes, 0);
  ready = true; conflict = true;
  await api.recordInvestment(entry); await api.recordInvestment(entry);
  assert.equal(current.value.length, 2);
  assert.equal(current.value.find((row: any) => row.id === 'deposit').amount, 500);
  networkError = true;
  await assert.rejects(api.recordInvestment({ ...entry, amount: 2000 }), /Network/);
  assert.equal(current.value.find((row: any) => row.id === 'oven').amount, 1000);
  networkError = false;
  await api.importInvestments([{ ...entry, amount: 1500 }]);
  assert.equal(current.value.length, 2);
  await api.deleteInvestment('oven');
  assert.equal(current.value[0].id, 'deposit');
  current = null; await api.recordInvestment(entry);
  assert.equal(current.value[0].id, 'oven');
});
