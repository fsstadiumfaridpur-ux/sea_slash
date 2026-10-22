import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

test('staff account Edge Function validates the caller and keeps passwords server-only', async t => {
  const source = await readFile(new URL('../../supabase/functions/staff-accounts/index.ts', import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'cjs' });
  let handler: (req: Request) => Promise<Response>;
  let admin = true;
  let validToken = true;
  let active = true;
  let account: { user_id: string; email: string } | null = null;
  let bindingFails = false;
  let creates = 0;
  let resets = 0;
  let deletes = 0;
  let createdPayload: Record<string, unknown>;
  const server = {
    auth: {
      getUser: async () => ({ data: { user: validToken ? { id: 'admin-id' } : null }, error: validToken ? null : new Error('Invalid JWT') }),
      admin: {
        createUser: async (payload: Record<string, unknown>) => { creates++; createdPayload = payload; return { data: { user: { id: 'created-user' } }, error: null }; },
        updateUserById: async () => { resets++; return { error: null }; },
        deleteUser: async () => { deletes++; return { error: null }; },
      },
    },
    rpc: async (name: string) => name === 'is_restaurant_admin' ? { data: admin, error: null } : { error: bindingFails ? new Error('Binding failed') : null },
    from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'restaurant_staff' ? { profile: { active } } : account, error: null }) }) }) }),
  };
  vm.runInNewContext(code, {
    require: () => ({ createClient: () => server }),
    Response,
    Deno: { env: { get: (name: string) => name === 'RESTAURANT_ADMIN_EMAIL' ? 'owner@sea-slash.example' : name === 'SUPABASE_URL' ? 'https://example.supabase.co' : 'server-only-key' }, serve: (value: typeof handler) => { handler = value; } },
  });
  const call = (body: Record<string, unknown>, auth = true) => handler(new Request('https://example.supabase.co/functions/v1/staff-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer verified-token' } : {}) }, body: JSON.stringify(body) }));
  const request = { staffId: 'chef-one', email: 'Chef@Example.com', password: 'example-test-password', action: 'create' };

  await t.test('missing, invalid or non-admin sessions cannot create credentials', async () => {
    assert.equal((await call(request, false)).status, 401);
    validToken = false;
    assert.equal((await call(request)).status, 401);
    validToken = true; admin = false;
    assert.equal((await call(request)).status, 403);
    assert.equal(creates, 0);
    admin = true;
  });
  await t.test('inactive staff, weak passwords and reserved emails are rejected', async () => {
    active = false;
    assert.equal((await call(request)).status, 400);
    active = true;
    assert.equal((await call({ ...request, password: 'short' })).status, 400);
    assert.equal((await call({ ...request, email: 'owner@sea-slash.example' })).status, 400);
    assert.equal(creates, 0);
  });
  await t.test('provisioning normalizes email and returns no password or server key', async () => {
    const response = await call(request);
    assert.equal(response.status, 200);
    assert.equal(createdPayload.email, 'chef@example.com');
    assert.equal(createdPayload.email_confirm, true);
    const result = await response.text();
    assert.equal(result, '{"success":true}');
    assert.ok(!result.includes(request.password));
    assert.ok(!result.includes('server-only-key'));
  });
  await t.test('failed database linkage removes the newly provisioned identity', async () => {
    bindingFails = true;
    assert.equal((await call(request)).status, 409);
    assert.equal(deletes, 1);
    bindingFails = false;
  });
  await t.test('password reset requires an existing linked staff identity', async () => {
    assert.equal((await call({ ...request, action: 'reset_password' })).status, 400);
    assert.equal(resets, 0);
    account = { user_id: 'staff-uid', email: 'chef@example.com' };
    assert.equal((await call({ ...request, action: 'reset_password' })).status, 200);
    assert.equal(resets, 1);
    assert.equal((await call(request)).status, 409);
  });
});
