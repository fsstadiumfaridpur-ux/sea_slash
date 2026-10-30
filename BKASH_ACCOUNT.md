# bKash account

Expenses shows the recorded bKash balance on every expense view. The bKash
Account tab provides dated incoming/outgoing history, running balance, month
filtering, CSV export, money-added and transfer-out entries, and a vendor-payment
form. The opening balance is the amount before the first tracking day's activity.
Earlier and future-dated source transactions are excluded from the current balance.

Balance = opening + bKash sales receipts + manual deposits - bKash expenses -
manual transfers out. Sales are daily totals; history balances use date order,
with same-day entries grouped by source, not precise transaction timestamps.
Bazaar and older salary payment projections are included exactly once. Vendor
ledger entries with no payment method are not assumed to be bKash transactions.
Record those payments through the vendor payment form or Daily Expenses with
bKash selected. Returned money is a separate incoming transfer.

The vendor payment form saves one normal bKash expense linked to the vendor.
The existing vendor expense projection reduces the vendor balance without
creating a second payment record. This records a payment; it does not send money
through the bKash API. Sales, expense and account data refresh every 30 seconds,
on window focus and with Reload bKash account. Opening, sales and expense edits
recalculate the displayed history rather than persisting derived balances.

Opening setup and full backup restore require admin via the app's role RPC.
Managers/admins can append transfers and record expenses under existing app_state
RLS. The account uses sea_slash_bkash_account_v1, with validation, duplicate-safe
transfer IDs and optimistic concurrency retries. No extra SQL migration is needed
when supabase-role-security.sql is already installed. Keep those RLS policies:
the account must never be exposed to anonymous or chef logins. Full data backup
includes the opening settings and transfers; CSV includes the combined history.
