# Security settings and server checks

What the code enforces, and what has to be checked on the database server by hand.

## What the app enforces

| Area | Where | What happens |
| --- | --- | --- |
| Required settings | `src/lib/env.ts`, `next.config.ts`, `src/instrumentation.ts` | A production deploy fails at build time, and the server refuses to start, if `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `SECRETS_ENCRYPTION_KEY` or `CRON_SECRET` is missing or too short, if a database URL lacks `sslmode=require` or uses a default password, or if Stripe billing is on without `STRIPE_WEBHOOK_SECRET`. The error names the variable, never its value. |
| Errors | `src/lib/server/errors.ts` | API routes return `{ error, ref }`. Only messages written for users (`UserError`) are shown; anything else becomes "Something went wrong" plus a reference. The full error, redacted, is logged on the server with the same reference. Pages show Next.js's error code (digest) only. |
| Headers | `next.config.ts`, `src/middleware.ts` | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Referrer-Policy`, `Permissions-Policy`, and a Content-Security-Policy with a per-request nonce: scripts only from this site. |
| Rate limits | `src/lib/server/ratelimit.ts` | Sign-in: 5 attempts a minute per IP address, 5 wrong passwords per account in 15 minutes. Two-step code: 5 a minute per IP, 5 wrong per account in 15 minutes. Password reset requests: 3 an hour per email and 3 an hour per IP. Sign-up: 5 a minute and 10 an hour per IP. Till PIN: 5 wrong a minute per till. |
| Cross-origin | `src/middleware.ts` | No `Access-Control-Allow-Origin` header is ever sent. `POST`/`PUT`/`DELETE` to `/api/*` with another site's `Origin`, and all `OPTIONS` preflights, get 403. Server actions use Next.js's own same-origin check. |

The demo business's sign-in details are only shown on the live login page when `SHOW_DEMO_LOGIN=true`.

## Checks to run on the database server

The code can't see the VPS. Run these over SSH after each Supabase update.

### 1. Only the pooler is reachable from the internet

```
sudo ss -tlnp | grep -v '127.0.0.1\|::1'
docker ps --format '{{.Names}}\t{{.Ports}}' | grep '0.0.0.0'
sudo ufw status verbose
```

Expected: only SSH (22), `5432` and `6543` listen on a public address, and only the Supavisor pooler container publishes them. Studio and the API gateway (8000) must show `127.0.0.1:8000`. Docker ignores `ufw`, so the `docker ps` line is the one that matters. From your PC, `nmap -Pn -p 1-65535 <server IP>` should show the same three ports.

### 2. The database refuses unencrypted connections

From your PC (with `psql` installed), using the real tenant and password:

```
psql "postgresql://postgres.<TENANT_ID>:<PASSWORD>@<host>:6543/postgres?sslmode=disable" -c 'select 1'
```

This must fail. If it prints `1`, the pooler accepts plain-text connections: turn on SSL enforcement for the tenant in Supavisor.

### 3. No example passwords or keys left in Supabase's .env

```
sudo grep -nE 'your-super-secret|this_password_is_insecure|your-encryption-key|your-tenant-id|c3VwYWJhc2UtZGVtbyI' /opt/supabase/.env
```

No output means none of the example values from Supabase's `.env.example` are in use (the last pattern matches Supabase's public demo `ANON_KEY` / `SERVICE_ROLE_KEY`). If anything matches, generate new values, restart the stack, and update `DATABASE_URL` / `DIRECT_URL` on Vercel.

### 4. The database certificate (still to do)

The pooler uses a self-signed certificate, so the URLs carry `sslaccept=accept_invalid_certs`: traffic is encrypted, but the app doesn't check it is talking to your server. Point a name such as `db.matrixinfo.co.uk` at the VPS, put a Let's Encrypt certificate on the pooler, then remove `&sslaccept=accept_invalid_certs` from both URLs on Vercel. The app logs a warning on start until this is done.

## Attack test, November 2026

Tested against a local copy (never the live site or live Stripe). Fixed in the same change:

| # | What an attacker could do | Damage | Fix |
|---|---|---|---|
| 1 | Sign up, change their own staff email to an HQ address from `PLATFORM_ADMIN_EMAILS` that had no account yet, then open the "confirm your email" link from their own sign-up. | Full HQ access: every shop's data, billing, deleting shops, resetting two-step sign-in. | Changing an email cancels every link already sent (confirm email, reset password). |
| 2 | A manager (or anyone using the public demo login) saves an offer with a negative quantity. | Every sale in that shop loops forever, on the tills and on the server. Tills freeze, sales stop syncing. | Offers need quantities 1 to 100 and no negative prices; the pricing code also skips bad offers. |
| 3 | A cashier records "Cash out" of any amount, no approval. | Cash taken from the drawer is hidden from the Z report. | Cash out by a cashier needs a supervisor's PIN, signed for that one movement and usable once. One movement is at most £10,000. |
| 4 | An owner whose account was suspended presses "Keep my account". | Suspension lifted by the shop itself. | Only works on an account that is actually closing, and a suspended account stays suspended. |
| 5 | A till sends a sale line of millions of items. | Fake takings in reports, stock and loyalty points; heavy server load. | At most 9,999 items or 1,000 kg on one line. |
| 6 | Two refunds of one receipt sent at the same moment. | Paying back more than was bought. | The original sale is locked and the refund re-checked while saving. |
| 7 | The demo logins (password in this public repository) on the live database. | A known owner password. | Demo logins only work on the live site when `SHOW_DEMO_LOGIN=true`; demo addresses can't be used to sign up. |
| 8 | Email links built from the request's Host header when `APP_URL` isn't set. | A password reset link pointing at someone else's site. | On the live site, links use `APP_URL`, else Vercel's production domain. Set `APP_URL`. |
| 9 | Guessing a manager's PIN at the override prompt, moving between tills. | Approving own refunds and discounts. | 20 wrong override PINs an hour per business, on top of 5 per till. |
| 10 | Product CSV import with negative prices, any minimum age, huge files; negative PO costs; VAT bigger than the bill. | Negative-price items at the till, broken accounts. | Same rules as the product form; 20,000 rows max; costs can't be negative. |
| 11 | A cell with a lone carriage return in a CSV export. | A fake extra row in the spreadsheet. | Such cells are quoted. |
| 12 | Mass free-trial sign-ups. | Trial abuse. | 20 sign-ups a day per connection (on top of 10 an hour). |

Checked and found safe: every page and API that takes an id checks the business; no API works without a valid session (forged, `alg: none`, expired and garbled tokens are refused); roles are checked on the server for every action; no SQL built from text (Prisma only); React escapes all text, including receipts and invoices; CSV formulas are neutralised; `/.env`, `/.git`, API docs and source files are not served; `/api/health` says only ok or not; Studio is bound to localhost on the VPS.

Still worth doing: a real certificate on the database pooler (item 4 above); set `APP_URL` on Vercel; consider requiring two-step sign-in for HQ accounts.
