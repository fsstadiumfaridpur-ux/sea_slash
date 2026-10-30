# Account security

Open Settings in the top bar, then Account security. Each browser session appears separately, including local and live logins. Supabase supplies the browser agent, IP, sign-in time and refresh time; these are not hardware fingerprints or a continuous activity tracker.

Run `supabase-account-security.sql` after the role-security migration. Re-running it is safe. It uses security-definer functions with an empty search path and the authenticated user's ID. Tokens and other users' sessions are never returned. Deleting an Auth session cascades to its refresh tokens. The restaurant role check and an additional restrictive policy on existing public RLS tables reject revoked sessions. The UI checks session status every 30 seconds and on focus.

Password changes verify the current password through an isolated, non-persistent Supabase Auth client. Its temporary verification session is immediately signed out. The active client updates the password through `auth.updateUser`; optional email reauthentication codes are supported when required by the project. Passwords are never added to application storage or database records. Signing out other sessions after a password change is enabled by default and can be deselected.

Important platform boundary: Supabase-issued JWTs cannot be invalidated cryptographically before expiry. Restaurant role checks and protected table policies enforce immediate denial within this app. Other Supabase services and already displayed/offline data may remain accessible until their token expires. See https://supabase.com/docs/guides/auth/sessions and https://supabase.com/docs/reference/javascript/auth-signout.

Run the migration again after adding new RLS tables or replacing the role function so they retain session protection. Do not change the Auth schema directly outside these narrow session operations. No service-role key belongs in the browser.
