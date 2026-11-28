# MatrixPOS

Point of sale for UK supermarkets, convenience stores and small businesses. It runs in a web browser, so any tablet, laptop or till PC can be a till.

- **Till:** barcode scanning with any USB or Bluetooth scanner, quick keys, product search, `6*barcode` quantity entry, weighed goods priced per kg, deli and butcher scale labels (price or weight in the barcode), open-price items, line discounts, voids and refunds with supervisor PINs, and Challenge 25 prompts for age-restricted products.
- **Payments:** cash with change and quick-cash buttons, split tender, a separate card machine (cashier keys the amount), and integrated Stripe Terminal, SumUp and Dojo. Each business switches on only the methods it uses.
- **UK VAT:** 20%, 5%, zero-rated and exempt goods, VAT receipts with your VAT number and per-rate summary, and a VAT report for your return.
- **Offers:** meal deals, multibuys like "3 for £2", buy X get Y free and percentage off, applied automatically. Each saving is split across the lines it came from, so mixed-VAT deals report VAT correctly.
- **Works offline:** the till caches the catalogue, keeps selling when the internet drops, and syncs each sale once it's back. Sales are idempotent, so nothing is ever counted twice.
- **Shifts:** opening float, cash in and out, safe drops, X reports and Z reports with over/short.
- **Back office:** dashboard, products with CSV import and export, stock per store, transfers, waste, suppliers and purchase orders with delivery booking, sales and receipt lookup, reports (takings, VAT, best sellers, busiest hours, payment methods, by store), loyalty customers with UK GDPR erasure, staff and roles, stores and tills, and feature settings.
- **Accounts:** double-entry bookkeeping that runs itself. Every sale, refund, void, stock write-off, till cash drop and over/short is posted automatically, along with cost of goods sold. You can record supplier bills and expenses with VAT, pay suppliers, bank cash and card payouts, and post opening balances. Reports cover profit and loss, balance sheet, trial balance and the general ledger, plus a 9-box HMRC VAT return.
- **Plans and HQ:** Starter, Business and Enterprise plans with a 14-day free trial, plan limits on shops, tills and staff, and a private HQ dashboard at `/platform` where the platform owner sees every business, sign-ups, trading activity and revenue, and can mark payments, extend trials or suspend accounts.
- **Multi-business and multi-branch:** each customer business signs up and gets its own isolated data. Products and offers are shared across its branches, and stock is kept per branch.

## Tech

Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Prisma 6 and PostgreSQL 16. Designed for hosting on Vercel (London region) with the database on your own UK VPS.

## Run it locally

```bash
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET
npm install
npx prisma migrate dev        # create tables
npm run db:seed               # demo shop with products, offers and staff
npm run dev
```

Open http://localhost:3000.

- Back office: `owner@demo.matrixpos.uk` / `demo1234`
- Till PINs: owner 9999, manager 2222, supervisor 3333, cashier 1111

To make a device a till, sign in to the back office as a manager or owner, go to `/till`, and pick the till. After that, staff sign in with their PIN.

## Tests

```bash
npm test          # pricing, VAT, offers, barcodes, London dates
npm run typecheck
```

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md) for the UK VPS database setup and Vercel deployment.

## Security and secrets

> **Warning: this repository is public.** Anything ever committed, including in old commits, can be read by anyone.
> If a real secret is ever committed by mistake, deleting it in a later commit is not enough: the old value is still in git history.
> **Rotate it immediately** (create a new key in Stripe, Resend, your SMTP provider or the database, update it in Vercel, then revoke the old one).

- All credentials are environment variables, set in Vercel (Project > Settings > Environment Variables) or a local `.env` file. `.env` and `.env.*` are git-ignored; only [.env.example](.env.example), with placeholders, is committed.
- Every variable is server-side only. Nothing uses a `NEXT_PUBLIC_` prefix, which would copy the value into the browser. Keep it that way.
- Shops' own card machine keys (Stripe Terminal, SumUp, Dojo) are stored in the database, used only on the server, and never sent to the browser or included in data exports.
- Errors from Stripe, card providers and email are passed through `src/lib/server/redact.ts` before they are logged or returned, so keys, tokens and connection-string passwords are masked.
- The database is only reached by Prisma on the server. On self-hosted Supabase, MatrixPOS tables live in the `matrixpos` schema (not exposed by the REST API), have row level security switched on, and Supabase's `anon` and `authenticated` roles have no access to them. Never put a Supabase `service_role` key anywhere in this app.
- `npm test` includes a secret scan (`tests/secrets.test.ts`) that fails CI if anything shaped like a live key, token, private key or password-bearing database URL is committed.
- The demo seed (`owner@demo.matrixpos.uk` / `demo1234`) refuses to run in production. If it was ever run against the live database, delete that account.

A full scan of the git history on 28 November 2026 found no real secrets ever committed, so nothing needs rotating today.

## Hardware

- **Barcode scanners:** any scanner in keyboard (HID) mode. The till keeps its scan box focused.
- **Receipt printers:** the receipt is formatted for 80mm paper and printed through the browser, so any printer with a driver works. Set the printer driver to open the cash drawer after printing if your drawer is connected to the printer.
- **Scales:** enter the weight shown on the scale, or scan labels printed by a label scale (EAN-13 starting with 2, PLU in digits 3 to 7, price in pence or weight in grams in digits 8 to 12).
- **Card machines:** any standalone terminal, or Stripe Terminal, SumUp Solo and Dojo readers linked under Stores & tills.

## Project layout

```
prisma/              schema, migrations and demo seed
src/lib/pos/         pricing, VAT, offers, barcodes (pure, unit tested)
src/lib/server/      database, auth, till API logic, card providers, reports
src/app/till/        the till (client app, works offline)
src/app/admin/       back office
src/app/api/         till and payment APIs
deploy/vps/          Docker Compose for PostgreSQL with SSL and nightly backups
```
