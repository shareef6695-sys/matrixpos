# Matrix HQ business modules

Matrix HQ (`/platform`) is where Matrix Infotech Ltd. runs its own business, alongside the MatrixPOS shop customers.

## Who can get in

- **Owner:** a back office owner whose confirmed email is in `PLATFORM_ADMIN_EMAILS`. Sees everything, including the POS shop customers and HQ staff.
- **HQ staff:** invited under *HQ staff*. Each gets their own login (an invite link to choose a password, valid 2 days) and one role:

| Role | Can do |
|---|---|
| Manager | Every business module, but not HQ staff or POS shop customers |
| Sales | Clients, leads and quotes. Sees invoices |
| Accounts | Clients, invoices, payments, catalogue, exchange rates and the books (bank, bills, suppliers, journals, reports, lock date). Sees quotes |
| Project staff | Sees clients and the catalogue (projects arrive in phase 3) |
| Read only | Sees the business modules and the books, changes nothing |

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

## Accounts (phase 2)

A separate double-entry ledger for Matrix Infotech Ltd (`HqAccount`, `HqJournal`, `HqJournalLine`), in GBP pence, never mixed with any shop's books. The pure maths is in `src/lib/hq/books.ts` (unit tested); posting is in `src/lib/server/hq-books.ts`.

- **Automatic posting.** Sending an invoice posts it (Dr debtors, Cr income per line); voiding posts a reversal on the void date. Payments, credit notes, bills, bill payments and bank lines post as they're saved. Each document posts once (`@@unique([source, sourceId])`). Changing a sent invoice or deleting a payment removes and re-posts its entry. Opening *Books* brings in anything not yet posted, so invoices and payments from before phase 2 are included.
- **Income accounts.** Each catalogue item can name its income account; otherwise POS plans go to 4020, third-party apps to 4030, support plans to 4040 and the rest to 4000.
- **Currencies.** Debtors and creditors are cleared at the document's rate; the bank gets what actually arrived at the rate on the day; the difference goes to 7900 Exchange gains and losses. A bank account can be in any currency; its lines keep the amount in that currency too.
- **Bills and expenses.** A bill is paid later (record the payment, or match it from the bank). An expense is paid as it's saved, from the bank account chosen. Suppliers are optional.
- **Credit notes** (`MPC-YEAR-CODE`) reduce what's left to pay on an invoice, spread over its lines. Voiding one reopens the invoice.
- **Repeating invoices** are made by the daily cron (`/api/cron/daily`) on their date, as drafts or emailed automatically. *Make any due now* runs it by hand.
- **Bank.** Upload a CSV statement (Lloyds' layout and any bank with Date plus Amount or Paid in / Paid out columns, `src/lib/hq/bank-csv.ts`). The same line is never imported twice. Each line can be matched to an entry already in the books (same amount within 10 days), recorded as a payment for an open invoice or bill, put straight to an account (fees, subscriptions, interest), or ignored.
- **Manual journals** for opening balances, the director's loan, depreciation and year-end adjustments. Bank accounts in a foreign currency can't be used in a manual journal.
- **Reports:** profit and loss (cost of sales and overheads), balance sheet, cash flow, trial balance, aged debtors and aged creditors. All printable.
- **Lock date.** Nothing dated on or before it can be added, changed or removed. Only the owner can unlock or move it back.

A live bank feed (Open Banking through a provider such as GoCardless Bank Account Data, TrueLayer or Plaid) can be added later; it would use the same reconciliation screen.

## Coming next

Phase 3 (projects, tasks, time tracking, contracts and renewals) and phase 4 (VAT registration and Making Tax Digital, year-end).
