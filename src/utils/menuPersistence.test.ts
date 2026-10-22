import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

test('menu saves await the server and merge into the latest persisted list', async t => {
  const recipe = { id: 'dish-one', dishName: ' Kebab ', portionSize: '1 plate', sellingPrice: 300, estimatedCOGS: 0, ingredients: [] };
  let current: any = { value: [{ ...recipe, sellingPrice: 200 }], updated_at: 'revision-1' };
  let admin = true;
  let networkError = false;
  let conflict = false;
  let writes = 0;
  const client = {
    rpc: async () => ({ data: admin, error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: structuredClone(current), error: null }) }) }),
      insert: async (row: any) => { writes++; current = row; return { error: null }; },
      update: (row: any) => ({ eq: () => ({ eq: () => ({ select: async () => {
        writes++;
        if (networkError) return { error: { message: 'Network unavailable' } };
        if (conflict) { conflict = false; current = { value: [...current.value, { ...recipe, id: 'dish-two', dishName: 'Curry' }], updated_at: 'revision-2' }; return { data: [], error: null }; }
        current = row; return { data: [{ value: row.value }], error: null };
      } }) }) }),
    }),
  };
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../lib/menu.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs',
    define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'mock-supabase', setup(build) { build.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'mock:supabase', external: true })); } }],
  });
  const module = { exports: {} as any };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: () => ({ supabase: client, isSupabaseConfigured: true }), Date, Number, Error });
  const api = module.exports;
  await t.test('non-admin callers cannot write', async () => {
    admin = false;
    await assert.rejects(api.saveMenuItem(recipe), /Administrator/);
    assert.equal(writes, 0); admin = true;
  });
  await t.test('failed writes never return a falsely saved recipe', async () => {
    networkError = true;
    await assert.rejects(api.saveMenuItem(recipe), /Network unavailable/);
    assert.equal(current.value[0].sellingPrice, 200); networkError = false;
  });
  await t.test('concurrent saves preserve other menu items and trim names', async () => {
    conflict = true;
    const saved = await api.saveMenuItem(recipe);
    assert.equal(saved.length, 2);
    assert.equal(saved[0].sellingPrice, 300);
    assert.equal(saved[0].dishName, 'Kebab');
    assert.equal(saved[1].dishName, 'Curry');
  });
  await t.test('deleting one saved item preserves the other dish', async () => {
    const saved = await api.deleteMenuItem('dish-one');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, 'dish-two');
  });
});
