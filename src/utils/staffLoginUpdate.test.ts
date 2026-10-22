import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

test('staff login email updates are admin-only, preserve passwords, and restore failed links', async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../../supabase/functions/staff-accounts/index.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['npm:*'] });
  for (const scenario of ['email', 'password', 'denied', 'duplicate', 'link-failure', 'self', 'owner-email']) {
    const updates: any[] = [];
    const links: any[] = [];
    let handler: (request: Request) => Promise<Response> = null!;
    const server = {
      rpc: async () => ({ data: scenario !== 'denied', error: null }),
      auth: {
        getUser: async () => ({ data: { user: { id: 'admin' } }, error: null }),
        admin: { updateUserById: async (_id: string, values: any) => { updates.push(values); return { error: scenario === 'duplicate' ? { message: 'Email already registered.' } : null }; } },
      },
      from: (table: string) => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'restaurant_staff' ? { profile: { active: true } } : { user_id: scenario === 'self' ? 'admin' : 'staff-user', email: 'old@example.com' }, error: null }) }) }),
        update: (values: any) => { links.push(values); return { eq: () => ({ eq: async () => ({ error: scenario === 'link-failure' ? { message: 'Database failed.' } : null }) }) }; },
      }),
    };
    vm.runInNewContext(result.outputFiles[0].text, { require: () => ({ createClient: () => server }), Response, Deno: { env: { get: (name: string) => name === 'RESTAURANT_ADMIN_EMAIL' ? 'owner@sea-slash.example' : 'configured' }, serve: (fn: typeof handler) => { handler = fn; } } });
    const response = await handler(new Request('https://example.com', { method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_login', staffId: 'staff', email: scenario === 'owner-email' ? 'owner@sea-slash.example' : ' New@Example.com ', password: scenario === 'password' ? 'new-password-123' : '' }) }));
    if (['denied', 'self'].includes(scenario)) {
      assert.equal(response.status, 403);
      assert.equal(updates.length, 0);
    } else if (scenario === 'owner-email') {
      assert.equal(response.status, 400);
      assert.equal(updates.length, 0);
    } else if (scenario === 'duplicate') {
      assert.equal(response.status, 400);
      assert.equal(links.length, 0);
    } else if (scenario === 'link-failure') {
      assert.equal(response.status, 500);
      assert.equal(updates[1].email, 'old@example.com');
    } else {
      assert.equal(response.status, 200);
      assert.equal(updates[0].email, 'new@example.com');
      assert.equal(links[0].email, 'new@example.com');
      assert.equal(updates.length, scenario === 'password' ? 2 : 1);
      assert.equal('password' in updates[0], false);
    }
  }
});
