import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const adminId = '410baf80-c3ed-4b8c-b312-3e0519a61948';
const staffId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const profile = { id: 'chef-one', name: 'Test Chef', role: 'Kebab Chef', phone: '', salaryType: 'monthly', baseSalary: 20000, joinDate: '2026-01-01', active: true };

test('staff migration preserves history and enforces admin and employee permissions', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('request.jwt.claim.email', true)) $$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
      create table public.app_state(key text primary key, value jsonb not null, updated_at timestamptz default now());
    `);
    await db.query('insert into auth.users (id,email) values ($1,$2),($3,$4),($5,$6)', [adminId, 'officialmughalmahal@gmail.com', staffId, 'chef@example.com', otherId, 'other@example.com']);
    await db.query('insert into public.app_state (key,value) values ($1,$2),($3,$4),($5,$6),($7,$8)', [
      'sea_slash_staff_v1', JSON.stringify([profile]), 'sea_slash_attendance_v1', JSON.stringify([{ id: 'att1', staffId: profile.id, date: '2026-10-01', status: 'present' }, { id: 'other-att', staffId: 'other-chef', date: '2026-10-01', status: 'present' }]),
      'sea_slash_advances_v1', JSON.stringify([{ id: 'adv1', staffId: profile.id, amount: 500 }, { id: 'adv2', staffId: 'other-chef', amount: 999 }]), 'sea_slash_settings_v1', JSON.stringify({ stallName: 'Mughal Mahal' }),
    ]);
    await db.exec(await readFile(new URL('../../supabase-admin-security.sql', import.meta.url), 'utf8'));
    const migration = await readFile(new URL('../../supabase-staff-security.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const asUser = async (role: string, uid = '', email = '') => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.email', $2, false)", [uid, email]);
      await db.exec(`set role ${role}`);
    };
    const scalar = async <T,>(sql: string, args: unknown[] = []) => (await db.query<{ value: T }>(sql, args)).rows[0].value;

    await t.test('anonymous users cannot read or write private payroll', async () => {
      await asUser('anon');
      assert.equal(await scalar<number>("select count(*)::int as value from public.app_state where key in ('sea_slash_staff_v1','sea_slash_attendance_v1','sea_slash_advances_v1')"), 0);
      await assert.rejects(db.query('select public.list_restaurant_staff()'), /permission denied/);
      await assert.rejects(db.query("insert into public.app_state(key,value) values ('sea_slash_attendance_v1','[]') on conflict(key) do update set value=excluded.value"), /row-level security/);
      assert.equal(await scalar<number>("select count(*)::int as value from public.app_state where key='sea_slash_settings_v1'"), 1);
    });
    await t.test('admin manages profiles while preserving employment status', async () => {
      await asUser('authenticated', adminId, 'officialmughalmahal@gmail.com');
      const original = await scalar<any[]>('select public.list_restaurant_staff() as value');
      assert.equal(original[0].id, profile.id);
      const updated = await scalar<any[]>('select public.save_restaurant_staff($1::jsonb) as value', [JSON.stringify({ ...profile, name: 'Updated Chef', baseSalary: 24000, password: 'must-not-store', authUserId: otherId })]);
      assert.equal(updated[0].baseSalary, 24000);
      assert.equal(updated[0].password, undefined);
      assert.equal(updated[0].authUserId, null);
      await assert.rejects(db.query('select public.save_restaurant_staff($1::jsonb)', [JSON.stringify({ ...profile, baseSalary: -1 })]), /Invalid salary/);
    });
    await t.test('only the service can bind identities to active staff', async () => {
      await assert.rejects(db.query('select public.bind_restaurant_staff_account($1,$2,$3)', [profile.id, staffId, 'chef@example.com']), /permission denied/);
      await asUser('service_role');
      await db.query('select public.bind_restaurant_staff_account($1,$2,$3)', [profile.id, staffId, 'chef@example.com']);
      await assert.rejects(db.query('select public.bind_restaurant_staff_account($1,$2,$3)', [profile.id, otherId, 'other@example.com']), /duplicate key/);
    });
    let agreementId: string;
    await t.test('admin issues versioned agreements but cannot accept on behalf of staff', async () => {
      await asUser('authenticated', adminId, 'officialmughalmahal@gmail.com');
      const agreement = await scalar<any>("select to_jsonb(public.issue_staff_agreement($1,'Employment Agreement','Exact agreed text')) as value", [profile.id]);
      agreementId = agreement.id;
      assert.equal(agreement.version, 1);
      await assert.rejects(db.query('select public.accept_staff_agreement($1,$2)', [agreementId, 'Updated Chef']), /active staff login/);
    });
    await t.test('staff sees only own payroll and accepts only own agreements', async () => {
      await asUser('authenticated', staffId, 'chef@example.com');
      const portal = await scalar<any>('select public.get_staff_portal() as value');
      assert.equal(portal.profile.name, 'Updated Chef');
      assert.equal(portal.attendance.length, 1);
      assert.equal(portal.advances[0].amount, 500);
      assert.equal(await scalar<number>('select count(*)::int as value from public.app_state'), 0);
      assert.equal(await scalar<number>('select count(*)::int as value from public.restaurant_staff'), 0);
      await assert.rejects(db.query('select public.save_restaurant_staff($1::jsonb)', [JSON.stringify(profile)]), /Administrator access/);
      await assert.rejects(db.query("update public.restaurant_staff_agreements set document='Changed text' where id=$1", [agreementId]), /permission denied/);
      const accepted = await scalar<any>('select to_jsonb(public.accept_staff_agreement($1,$2)) as value', [agreementId, 'Updated Chef']);
      assert.equal(accepted.status, 'accepted');
      assert.equal(accepted.accepted_by, staffId);
      assert.equal(accepted.document, 'Exact agreed text');
      assert.ok(accepted.accepted_at);
      const repeated = await scalar<any>('select to_jsonb(public.accept_staff_agreement($1,$2)) as value', [agreementId, 'Another name']);
      assert.equal(repeated.accepted_name, 'Updated Chef');
      await asUser('authenticated', otherId, 'other@example.com');
      assert.equal(await scalar('select public.get_staff_portal() as value'), null);
      assert.equal(await scalar<number>('select count(*)::int as value from public.restaurant_staff_agreements'), 0);
      await assert.rejects(db.query('select public.accept_staff_agreement($1,$2)', [agreementId, 'Other']), /active staff login/);
    });
    await t.test('firing revokes existing employee database access without destroying accepted history', async () => {
      await asUser('authenticated', adminId, 'officialmughalmahal@gmail.com');
      const next = await scalar<any>("select to_jsonb(public.issue_staff_agreement($1,'Updated Agreement','Version 2')) as value", [profile.id]);
      assert.equal(next.version, 2);
      await db.query("select public.terminate_restaurant_staff($1,'2026-10-01','Employment ended',false)", [profile.id]);
      await asUser('authenticated', staffId, 'chef@example.com');
      assert.equal(await scalar('select public.get_staff_portal() as value'), null);
      assert.equal(await scalar<number>('select count(*)::int as value from public.restaurant_staff_agreements'), 0);
      await assert.rejects(db.query('select public.accept_staff_agreement($1,$2)', [next.id, 'Updated Chef']), /active staff login/);
      await asUser('authenticated', adminId, 'officialmughalmahal@gmail.com');
      assert.equal(await scalar<string>('select status as value from public.restaurant_staff_agreements where id=$1', [agreementId]), 'accepted');
      assert.equal(await scalar<string>('select status as value from public.restaurant_staff_agreements where id=$1', [next.id]), 'withdrawn');
      const stillFired = await scalar<any[]>('select public.save_restaurant_staff($1::jsonb) as value', [JSON.stringify({ ...profile, active: true })]);
      assert.equal(stillFired[0].active, false);
      await db.query("select public.terminate_restaurant_staff($1,'2026-10-01','Archived',true)", [profile.id]);
      await assert.rejects(db.query('select public.save_restaurant_staff($1::jsonb)', [JSON.stringify(profile)]), /Deleted profiles/);
      await db.exec('reset role');
      await db.exec(migration);
      assert.equal(await scalar<boolean>("select (profile->>'active')::boolean as value from public.restaurant_staff where id=$1", [profile.id]), false);
    });
    await t.test('one-time demo cleanup preserves real archives, logins and agreements and cannot resurrect demos', async () => {
      await db.exec('reset role');
      const samples = [
        { ...profile, id: 'staff-1', name: 'Md. Rafiqul Baburchi', active: false, archivedAt: '2026-10-05T00:00:00Z' },
        { ...profile, id: 'staff-2', name: 'A Real Employee', active: false, archivedAt: '2026-10-05T00:00:00Z' },
        { ...profile, id: 'staff-3', name: 'Belal Mia', active: false, archivedAt: '2026-10-05T00:00:00Z' },
        { ...profile, id: 'staff-4', name: 'Sohel Rana', active: false, archivedAt: '2026-10-05T00:00:00Z' },
      ];
      for (const sample of samples) await db.query('insert into public.restaurant_staff(id,profile) values ($1,$2)', [sample.id, JSON.stringify(sample)]);
      await db.query('insert into public.restaurant_staff_accounts(staff_id,user_id,email) values ($1,$2,$3)', ['staff-3', otherId, 'other@example.com']);
      await db.query("insert into public.restaurant_staff_agreements(staff_id,version,title,document,created_by) values ('staff-4',1,'Protected history','Agreement text',$1)", [adminId]);
      await db.query("update public.app_state set value=value || $1::jsonb where key='sea_slash_staff_v1'", [JSON.stringify(samples)]);
      await db.query("update public.app_state set value=value || $1::jsonb where key='sea_slash_attendance_v1'", [JSON.stringify(samples.map(s => ({ id: `test-att-${s.id}`, staffId: s.id })))]);
      await db.query("update public.app_state set value=value || $1::jsonb where key='sea_slash_advances_v1'", [JSON.stringify(samples.map(s => ({ id: `test-adv-${s.id}`, staffId: s.id, amount: 100 })))]);
      const cleanup = await readFile(new URL('../../supabase-remove-demo-staff.sql', import.meta.url), 'utf8');
      await db.exec(cleanup);
      assert.equal(await scalar<number>("select count(*)::int as value from public.restaurant_staff where id='staff-1'"), 0);
      assert.equal(await scalar<number>("select count(*)::int as value from public.restaurant_staff where id in ('staff-2','staff-3','staff-4')"), 3);
      assert.equal(await scalar<number>("select count(*)::int as value from public.restaurant_staff where id=$1", [profile.id]), 1);
      const legacy = await scalar<any[]>("select value from public.app_state where key='sea_slash_staff_v1'");
      assert.ok(!legacy.some(s => s.id === 'staff-1'));
      const attendance = await scalar<any[]>("select value from public.app_state where key='sea_slash_attendance_v1'");
      assert.ok(!attendance.some(a => a.staffId === 'staff-1'));
      assert.ok(attendance.some(a => a.staffId === profile.id));
      const advances = await scalar<any[]>("select value from public.app_state where key='sea_slash_advances_v1'");
      assert.ok(!advances.some(a => a.staffId === 'staff-1'));
      assert.ok(advances.some(a => a.staffId === 'staff-2'));
      await db.exec(cleanup);
      await db.exec(migration);
      assert.equal(await scalar<number>("select count(*)::int as value from public.restaurant_staff where id='staff-1'"), 0);
      assert.equal(await scalar<string>("select profile->>'archivedAt' as value from public.restaurant_staff where id='staff-2'"), '2026-10-05T00:00:00Z');
    });
  } finally { await db.close(); }
});
