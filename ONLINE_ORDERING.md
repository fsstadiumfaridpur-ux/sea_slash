# Sea Slash online ordering

Customer page: `http://localhost:3001/#/order`.
Admin/manager: sign in → Online Orders. The header badge shows orders waiting for confirmation.

## Setup

Run `supabase-customer-orders.sql` in Sea Slash's Supabase SQL Editor after the role security and public menu scripts. The script is repeatable and does not erase existing orders or settings.

Online ordering starts paused, with blank WhatsApp and bKash numbers. Enter Sea Slash’s contact and payment details in Online Orders → Settings, then enable ordering. Delivery charge options are ৳20, ৳40 or ৳60.

Order settings let the administrator pause ordering, change contact/payment details and edit the customer notice. Managers can handle orders and payments but cannot edit these settings.

## Workflow

Customers select available published dishes, enter delivery details, then place an order. For bKash they pay the food subtotal and enter their transaction ID; delivery is confirmed and collected separately. Entering a transaction ID never verifies payment.

Orders are stored before the WhatsApp handoff. The customer must press “Send order to WhatsApp” and then Send in WhatsApp; this is not an automatic WhatsApp Business API integration. An order is pending until the team accepts it.

Select an order → choose delivery charge → enter only the amount verified as received → Save changes → Print receipt. Receipts show food subtotal, delivery charge, total, verified received amount and remaining due. Status progresses through accepted, preparing, out for delivery and delivered, or cancelled. Cancellation does not process a refund.

Orders do not automatically write sales or bKash account ledger entries. Include delivered orders in the regular end-of-day sales entry and record verified account movements through the existing accounting workflow.

## Data and verification

The server reads menu prices/availability, calculates totals, rejects stale prices, validates quantities and serializes checkout retries by a random request token. A five-order / fifteen-minute phone limit reduces accidental repeats and basic spam; this does not verify phone ownership.

Anonymous callers cannot list orders or read the order tables. Public receipt lookup requires a random token and excludes customer contact details, transaction IDs and staff notes. Only admin/manager functions expose the full order. Browser storage keeps dish quantities and a receipt token, not delivery addresses or payment transaction IDs.

Database tests run in an isolated PGlite database. Browser order submission and receipt-management QA use an isolated sample service, so no test orders or payments enter the real restaurant database.
