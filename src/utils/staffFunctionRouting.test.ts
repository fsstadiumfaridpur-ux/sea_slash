import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

test('account provisioning uses configured URL slug instead of dashboard display name', async () => {
  for (const slug of ['clever-api', undefined]) {
    const calls: string[] = [];
    const result = await build({ entryPoints: [fileURLToPath(new URL('../lib/staff.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_STAFF_ACCOUNTS_FUNCTION: slug }) }, plugins: [{ name: 'mock-client', setup(build) { build.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'mock:supabase', external: true })); } }] });
    const module = { exports: {} as any };
    vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: () => ({ supabase: { functions: { invoke: async (name: string) => { calls.push(name); return { data: { success: true }, error: null }; } } } }) });
    await module.exports.setStaffLogin('test-only', 'test@example.com', 'test-password', false);
    assert.deepEqual(calls, [slug ?? 'staff-accounts']);
  }
});
