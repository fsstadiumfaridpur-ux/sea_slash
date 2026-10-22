# Sea Slash setup

This is a separate application for Supabase project `xrgttljzokzrvqfdbmdu`.
Mughal Mahal files, accounts, storage and database were not copied or modified.

## Prepared

All operating features are retained. Startup records are empty: inventory,
vendors, sales, payments, attendance, staff, payroll and menu items. Rent and
commission start at 0 until configured. bKash opens at ৳0 on 22 October 2026.
Browser state uses the `sea_slash_` prefix. A project URL check prevents accidentally
connecting this copy to the Mughal Mahal database. The original logo is replaced
with a temporary Sea Slash wordmark; upload the final logo in Generate Menu.

## Database and admin

1. In Sea Slash Supabase, open Authentication → Users → Add user.
   Use `officialseaslash@gmail.com` and set the password yourself. Confirm the user.
2. The database file `setup/SEA_SLASH_DATABASE.sql` is already generated for
   `officialseaslash@gmail.com`.
3. In **Sea Slash** SQL Editor, run that generated file. The installer stops if
   it sees an existing installation or cannot find that administrator. It creates
   the schema, permissions, public-menu bucket and empty starting records in one
   transaction. Do not run individual legacy migration files for initial setup.
4. Sign in at http://localhost:3001/#/admin and configure shop details, schedule,
   staff, inventory and menu. Operational roles and permissions match the original.

## Edge Functions

Use the Supabase CLI signed into the owner account or the project's dashboard:

```sh
supabase functions deploy staff-accounts --project-ref xrgttljzokzrvqfdbmdu --no-verify-jwt
supabase functions deploy prepare-menu-photo --project-ref xrgttljzokzrvqfdbmdu --no-verify-jwt
```

Both handlers verify the signed-in user and database admin role themselves.
In Supabase → Edge Functions → Secrets, set `RESTAURANT_ADMIN_EMAIL` to the
admin email, and `REMOVE_BG_API_KEY` to the remove.bg API key directly there.
Built-in Supabase service credentials stay server-side. Do not share secrets in chat.
AI background removal requires that function and its key. Staff login creation
requires the staff-accounts function. Neither function is deployed by building
the frontend.

## Local and publishing

`npm run dev` uses port 3001. Mughal Mahal stays on port 3000.
`npm run build` creates this copy's own dist folder.
The local node_modules link reuses the installed runtime dependencies; on another
computer, use `npm ci` to install from this project's lockfile.
No Mughal Mahal hosting identity, deployment archive, environment secrets, or
source Git history is included. A new hosting destination must be created for
Sea Slash before its first publish. Never deploy this copy to Mughal Mahal.

## Investment-only partner access

Run `setup/SEA_SLASH_PARTNER_ACCESS.sql` once in Sea Slash SQL Editor after
creating the partner Auth account `seaslash.nazmul@gmail.com`. Re-running this
migration preserves all contributions and any access revocations.
The initial investor contributions are Owner ৳260,000 and Nazmul Hossain ৳240,000,
with 50% each. These are opening contributions with no invented payment date.
Admin can set the final budget, edit investor names/shares, record further
contributions, and enable/disable view-only access in Total Investment.
With no final budget, the minimum balanced investment is ৳520,000: Nazmul adds
৳20,000 to match the owner's ৳260,000. For a ৳600,000 budget, the remaining
contributions would be Owner ৳40,000 and Nazmul ৳60,000.
Partner signs in through the same `/#/admin` link and sees only investment costs,
contributions, shares, and amounts due, with no attendance check-in or editing.
Server RPCs enforce the scope even if someone bypasses the interface.
