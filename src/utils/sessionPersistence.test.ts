import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

test('Supabase persists sessions and automatically refreshes tokens', async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../lib/supabase.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'https://xrgttljzokzrvqfdbmdu.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-test-key' }) } });
  let options: any;
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: () => ({ createClient: (_url: string, _key: string, config: any) => { options = config; return {}; } }) });
  assert.equal(options.auth.persistSession, true);
  assert.equal(options.auth.autoRefreshToken, true);
  assert.equal(options.auth.storageKey, undefined);
});

test('auth waits for the restored session before deciding whether to show login', async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../lib/adminAuth.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'mock-client', setup(build) { build.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'mock:supabase', external: true })); } }] });
  const states: any[] = [];
  const effects: (() => void)[] = [];
  let stateIndex = 0;
  let listener: (event: string, session: any) => void = null!;
  const userRef = { current: null };
  const module = { exports: {} as any };
  const client = { auth: { onAuthStateChange: (fn: typeof listener) => { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; } } };
  const react = {
    useState: (initial: any) => { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], (value: any) => { states[index] = value; }]; },
    useRef: () => userRef,
    useEffect: (fn: () => void) => { effects.push(fn); },
  };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: (id: string) => id === 'react' ? react : { supabase: client }, localStorage: {} });
  assert.equal(module.exports.useAdminAuth().authReady, false);
  for (const effect of effects) effect();
  assert.equal(states[3], false);
  const session = { user: { id: 'staff' } };
  listener('INITIAL_SESSION', session);
  assert.equal(states[0], session);
  assert.equal(states[3], false);
  assert.equal(states[4], true);
  states[1] = 'chef'; states[3] = true;
  listener('TOKEN_REFRESHED', { ...session, access_token: 'renewed' });
  assert.equal(states[1], 'chef');
  assert.equal(states[3], true);
});
