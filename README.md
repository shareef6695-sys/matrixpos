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
