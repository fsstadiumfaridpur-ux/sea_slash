import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'POST required.' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return respond({ error: 'Server configuration is missing.' }, 503);
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return respond({ error: 'Administrator login required.' }, 401);
  const server = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await server.auth.getUser(token);
  if (identityError || !identity.user) return respond({ error: 'Your session expired. Sign in again.' }, 401);
  // Verify the role on the database with the caller's JWT, never user_metadata.
  const caller = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: admin, error: roleError } = await caller.rpc('is_restaurant_admin');
  if (roleError || admin !== true) return respond({ error: 'Administrator access required.' }, 403);

  try {
    const { staffId, email, password, action } = await request.json();
    if (typeof staffId !== 'string' || !['create', 'reset_password', 'update_login'].includes(action)) return respond({ error: 'Invalid account request.' }, 400);
    if (!(action === 'update_login' && password === '') && (typeof password !== 'string' || password.length < 10 || password.length > 128)) return respond({ error: 'Use a password with 10 to 128 characters.' }, 400);
    const { data: employee, error: employeeError } = await server.from('restaurant_staff').select('profile').eq('id', staffId).maybeSingle();
    if (employeeError) return respond({ error: 'Run supabase-staff-security.sql before creating accounts.' }, 503);
    if (!employee?.profile.active || employee.profile.archivedAt) return respond({ error: 'Choose an active staff member.' }, 400);
    const { data: account, error: accountError } = await server.from('restaurant_staff_accounts').select('user_id,email').eq('staff_id', staffId).maybeSingle();
    if (accountError) throw accountError;
    if (action === 'update_login') {
      if (!account) return respond({ error: 'Create a login for this employee first.' }, 400);
      if (account.user_id === identity.user.id || account.email.toLowerCase() === (Deno.env.get('RESTAURANT_ADMIN_EMAIL') || '').toLowerCase()) return respond({ error: 'You cannot change your own login here.' }, 403);
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return respond({ error: 'Enter a valid login email.' }, 400);
      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail === (Deno.env.get('RESTAURANT_ADMIN_EMAIL') || '').toLowerCase()) return respond({ error: 'Choose a separate staff email.' }, 400);
      const emailChanged = normalizedEmail !== account.email.toLowerCase();
      if (emailChanged) {
        const { error } = await server.auth.admin.updateUserById(account.user_id, { email: normalizedEmail, email_confirm: true });
        if (error) return respond({ error: error.message }, 400);
        const { error: linkError } = await server.from('restaurant_staff_accounts').update({ email: normalizedEmail }).eq('staff_id', staffId).eq('user_id', account.user_id);
        if (linkError) {
          const { error: rollbackError } = await server.auth.admin.updateUserById(account.user_id, { email: account.email, email_confirm: true });
          return respond({ error: rollbackError ? 'Login email could not be synchronized. Check the Auth user and staff email in Supabase before retrying.' : 'Email change could not be saved. The original email was restored.' }, 500);
        }
      }
      if (password) {
        const { error } = await server.auth.admin.updateUserById(account.user_id, { password });
        if (error) return respond({ error: `${emailChanged ? 'Email saved, but password was not changed. ' : ''}${error.message}` }, 400);
      }
      return respond({ success: true });
    }
    if (action === 'reset_password') {
      if (!account) return respond({ error: 'Create a login for this employee first.' }, 400);
      const { error } = await server.auth.admin.updateUserById(account.user_id, { password });
      if (error) return respond({ error: error.message }, 400);
      // Staff access is independently checked against active status on each database request.
      return respond({ success: true });
    }
    if (account) return respond({ error: 'This employee already has a login. Use Reset Password.' }, 409);
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return respond({ error: 'Enter a valid login email.' }, 400);
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail === (Deno.env.get('RESTAURANT_ADMIN_EMAIL') || '').toLowerCase()) return respond({ error: 'Choose a separate staff email.' }, 400);
    const { data: created, error: createError } = await server.auth.admin.createUser({ email: normalizedEmail, password, email_confirm: true });
    if (createError || !created.user) return respond({ error: createError?.message || 'Account creation failed.' }, 400);
    const { error: bindError } = await server.rpc('bind_restaurant_staff_account', { p_staff_id: staffId, p_user_id: created.user.id, p_email: normalizedEmail });
    if (bindError) {
      const { error: cleanupError } = await server.auth.admin.deleteUser(created.user.id);
      return respond({ error: cleanupError ? 'Account could not be linked. An administrator must remove the unlinked Auth user in Supabase before retrying.' : bindError.message }, 409);
    }
    return respond({ success: true });
  } catch {
    // Never log the request body: it contains a staff password.
    return respond({ error: 'Account request failed. Please try again.' }, 500);
  }
});
