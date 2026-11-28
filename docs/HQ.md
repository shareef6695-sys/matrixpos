# Matrix HQ business modules

Matrix HQ (`/platform`) is where Matrix Infotech Ltd. runs its own business, alongside the MatrixPOS shop customers.

## Who can get in

- **Owner:** a back office owner whose confirmed email is in `PLATFORM_ADMIN_EMAILS`. Sees everything, including the POS shop customers and HQ staff.
- **HQ staff:** invited under *HQ staff*. Each gets their own login (an invite link to choose a password, valid 2 days) and one role:

| Role | Can do |
|---|---|
| Manager | Every business module, but not HQ staff or POS shop customers |
| Sales | Clients, leads and quotes. Sees invoices |
| Accounts | Clients, invoices, payments, catalogue and exchange rates. Sees quotes |
| Project staff | Sees clients and the catalogue (projects arrive in phase 3) |
| Read only | Sees the business modules, changes nothing |

Every HQ page and server action checks the role on the server (`requireHq` in `src/lib/server/hq.ts`, permissions in `src/lib/hq/roles.ts`). Anyone who isn't HQ gets a 404. HQ staff are users in the owner's account marked with an `HqMember` row: they can never open a shop's back office, sign in at a till (they have no usable PIN), appear on a shop's staff page, or count towards its plan's staff limit. Switching someone off signs them out everywhere at once.

## Modules (phase 1)

- **Catalogue:** everything sold. *Add the services from matrixinfo.co.uk* loads the website's services and the MatrixPOS plans once (`src/lib/hq/starter-catalogue.ts`).
- **Clients and contacts**, with a notes timeline.
- **Leads:** a pipeline board (New, Contacted, Qualified, Proposal sent, Won, Lost). A lead becomes a client and a quote in one click.
- **Quotes:** numbered `MPQ-YEAR-CODE`. Emailed with a private link where the client can view, print, accept or decline. An accepted quote turns into an invoice in one click.
- **Invoices:** numbered `MPI-YEAR-CODE`, sharing one number space with the MatrixPOS subscription invoices. Drafts until emailed or marked as sent; the bill-to details are fixed on the day it's sent. Private link for the client to view and print. Part payments, any payment method.
- **Currencies:** any ISO currency, GBP as the base. You type in rates (£1 = x). Each quote, invoice and payment keeps the rate it was made at, so GBP figures never change afterwards.
- **Dashboard:** owed to you, overdue, money received per month (GBP), open pipeline and aged debts.

No VAT is charged while `CHARGE_VAT` is off. Once Matrix Infotech registers for VAT, set `CHARGE_VAT=true` and `INVOICE_VAT_NUMBER`, and a VAT % column appears on quotes and invoices.

## Client links

`/q/<token>` and `/i/<token>` use a 256-bit random token as the only key. They are never indexed, never send a referrer, and never show drafts. Accepting or declining a quote is rate limited per connection.

## Coming next

Phase 2 (full accounts: ledger, bank import and reconciliation, expenses and bills, credit notes, recurring invoices, exchange gains and losses, P&L, balance sheet, lock dates), phase 3 (projects, tasks, time tracking, contracts and renewals) and phase 4 (VAT registration and Making Tax Digital, year-end).
