# Matrix HQ business modules

Matrix HQ (`/platform`) is where Matrix Infotech Ltd. runs its own business, alongside the MatrixPOS shop customers.

## Who can get in

- **Owner:** a back office owner whose confirmed email is in `PLATFORM_ADMIN_EMAILS`. Sees everything, including the POS shop customers and HQ staff.
- **HQ staff:** invited under *HQ staff*. Each gets their own login (an invite link to choose a password, valid 2 days) and one role:

| Role | Can do |
|---|---|
| Manager | Every business module, but not HQ staff or POS shop customers |
| Sales | Clients, leads, quotes, contracts and renewals. Sees invoices and projects |
| Accounts | Clients, invoices, payments, catalogue, exchange rates, contracts and the books (bank, bills, suppliers, journals, reports, lock date). Sees quotes and projects |
| Project staff | Projects, tasks and their own time. Sees clients, contracts and the catalogue, but no prices or invoices |
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

## Projects, time and contracts (phase 3)

- **Projects** belong to a client (or are internal) and are billed at a fixed price, by the hour, or not at all. Each has a task board (To do, In progress, Review, Done) with who it's for, priority, due date and an estimate. The project page shows hours against budget, unbilled time, what's been invoiced and, with bills marked for the project, the profit so far. Invoices and bills can be tied to a project.
- **Time:** start a timer (one per person; over 12 hours is capped as left running) or log time afterwards (`1:30`, `2h`, `45m`). The weekly timesheet shows anyone's week to those who can see projects. Project staff can move their own tasks along.
- **Invoice the time:** on an hourly project, *Make draft invoice* puts the unbilled hours up to a date on a draft invoice at the hourly rate, one line per task or per entry. Deleting or voiding that invoice frees the time to be invoiced again; billed time can't be deleted.
- **Contracts and renewals:** support and care plans, hosting, development retainers and resold third-party licences, with start and end dates, value and cost per term, and an optional link to the repeating invoice that bills it. The daily cron gives contracts that renew themselves their next term once they end, and emails the first `PLATFORM_ADMIN_EMAILS` address once per end date when a contract enters its reminder period. Others are renewed with one click.

Pure logic (durations, time-to-invoice lines, renewal dates) is in `src/lib/hq/projects.ts` and unit tested.

## VAT, Making Tax Digital and year end (phase 4)

- **MatrixPOS billing in the books.** Subscription invoices (`SubscriptionInvoice`) post as sales to 4020 (Dr debtors, Cr MatrixPOS subscriptions and VAT). Paid by card, the money goes to 1250 Stripe and PayPal balances; by bank transfer, to 1200. A voided one is reversed. Opening *Books* brings in any not yet posted.
- **VAT registration.** *Books → VAT* holds the registration date, the quarters (stagger) and the VAT number. `CHARGE_VAT=true` and `INVOICE_VAT_NUMBER` in Vercel stay the master switch (they also add VAT to MatrixPOS plans and Stripe); HQ documents dated before the registration date never carry VAT. The page tracks sales in the last 12 months against the £90,000 threshold, and the HQ dashboard warns from 75%.
- **VAT returns** are worked out from the books (standard, invoice-based accounting): box 1 and 4 from the VAT accounts, box 6 all income before VAT, box 7 costs and equipment before VAT less wages, depreciation, exchange differences and Corporation Tax. Boxes 2, 8 and 9 are nil (Northern Ireland trade only). Filing re-checks the figures, moves the VAT to 2202 *VAT owed to HMRC* and locks the books to the end of the period. Match the payment or refund to 2202 in *Bank*.
- **Making Tax Digital.** Register the app on the HMRC Developer Hub (VAT (MTD) API), set `HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET` and `HMRC_ENV` (`sandbox` until HMRC approves production), and give HMRC the redirect `https://<site>/api/hmrc/callback`. The owner connects with the VAT Government Gateway account; tokens are encrypted with `SECRETS_ENCRYPTION_KEY`. HMRC's open returns are listed with their period keys, and a return can be submitted with HMRC's declaration. Fraud prevention headers are sent as `WEB_APP_VIA_SERVER` with the browser's details and a device ID kept in the browser. On Vercel the client's port and the server's public IP aren't known, so `Gov-Client-Public-Port` and `Gov-Vendor-Public-IP` are left out: check with HMRC's *Test Fraud Prevention Headers* API in the sandbox before asking for production access. Without HMRC set up, returns can still be worked out here and recorded as filed elsewhere.
- **Year end.** *Books → Year end* holds the accounting reference date, then for each company year shows profit before tax, a Corporation Tax estimate (19% up to £50k, 25% from £250k, marginal relief between, limits cut for a short year; assumes no associated companies and that accounting profit is taxable profit), and the deadlines (accounts at 9 months, tax at 9 months and a day, CT600 at 12 months). *Put aside* posts the tax (Dr 8000, Cr 2300); *Close the year* moves the profit to 3100 Retained profit and locks the books. These two entries can be made even when the lock date already covers the year end (filing a VAT return locks the books), since they change no VAT. The owner can reopen a closed year, which takes the closing entry out. Trial balance, general ledger and profit and loss download as CSV for the accountant.
- Reports, the VAT return and the threshold leave out year-end and VAT return journals. Payroll will come from a separate app.

Pure logic (VAT boxes and quarters, Corporation Tax, closing journal, deadlines, HMRC headers and return body) is in `src/lib/hq/books.ts` and `src/lib/hq/hmrc.ts`, tested in `tests/hq-tax.test.ts`.
