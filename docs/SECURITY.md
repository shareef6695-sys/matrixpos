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
