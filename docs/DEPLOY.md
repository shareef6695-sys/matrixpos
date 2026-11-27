# Deploying MatrixPOS

> Using self-hosted Supabase as the database instead of plain PostgreSQL? See [SUPABASE.md](SUPABASE.md).

The app runs on **Vercel** in the London region (`lhr1`, set in `vercel.json`). The database runs on **your UK VPS** in Docker, with SSL, a firewall and nightly backups. All customer data stays in the UK.

## 1. Database on the VPS

You need a VPS with Ubuntu 22.04 or 24.04 (or Debian 12), at least 2 GB RAM, and SSH access as root or a sudo user. A domain name for the database is optional (e.g. `db.yourdomain.co.uk` pointing at the VPS), otherwise use the server's IP address.

```bash
# on the VPS
git clone https://github.com/shareef6695-sys/matrixpos.git
cd matrixpos/deploy/vps
sudo ./setup.sh db.yourdomain.co.uk     # or the server's IP address
```

The script:

1. Installs Docker if it's missing.
2. Creates `.env` with a long random database password (readable only by root).
3. Creates a TLS certificate so every connection is encrypted.
4. Opens only SSH and port 5432 in the firewall (`ufw`).
5. Starts PostgreSQL 16 and a backup service that writes a compressed dump every night at 02:30 UK time, keeping 14 days.
6. Prints the `DATABASE_URL` to give to Vercel.

The database only accepts encrypted password connections from outside the server (`pg_hba.conf`).

**About the certificate:** the script makes a self-signed certificate, so the connection string uses `sslaccept=accept_invalid_certs`. Traffic is encrypted but the certificate isn't verified. For full verification, put a Let's Encrypt certificate for your database hostname in `deploy/vps/certs/` (as `server.crt` and `server.key`) and remove `sslaccept=accept_invalid_certs` from the URL.

**Backups:** copy `deploy/vps/backups/` off the server regularly (for example with `rclone` to cloud storage in a UK region). To restore: `./restore.sh backups/<file>.sql.gz`.

## 2. App on Vercel

1. In Vercel, **Add New → Project** and import the `matrixpos` GitHub repository. The framework is detected as Next.js.
2. Under **Environment Variables**, add for Production and Preview:
   - `DATABASE_URL` and `DIRECT_URL`: both set to the URL printed by `setup.sh`
   - `AUTH_SECRET`: a long random string, e.g. the output of `openssl rand -base64 48`
3. Deploy. The build runs `prisma migrate deploy` (via the `vercel-build` script), so the database tables are created on the first deploy and updated on later ones.
4. Optional: load the demo shop once from your computer with `DATABASE_URL=... npm run db:seed`. Skip this for a real shop.
5. Add your own domain under **Settings → Domains** (e.g. `pos.yourdomain.co.uk`).

The connection string includes `connection_limit=5`, which keeps Vercel's serverless functions from opening too many database connections. If you get very busy, add PgBouncer on the VPS.

## 3. First shop

1. Go to `/signup` and create the business, first shop, owner login and PIN.
2. **Settings:** add VAT and company numbers and switch on the payment methods and features the shop uses.
3. **Products:** add products or import a CSV.
4. **Staff:** give each person a role and their own PIN.
5. On each till device, sign in as the owner or a manager, open `/till`, and pick the till. Use the browser's **Install app** option to make it full screen.

## Email

MatrixPOS sends emails to confirm new accounts and reset passwords. Set up one of these in Vercel's environment variables:

- **Resend** (resend.com, free for 3,000 emails a month): `RESEND_API_KEY`. Verify your domain in Resend first.
- **Any SMTP mailbox** (Zoho Mail, Hostinger, Microsoft 365, Gmail): `SMTP_HOST`, `SMTP_PORT` (465, or 587), `SMTP_USER` and `SMTP_PASSWORD`. For Zoho, the host is `smtp.zoho.eu` (or `smtp.zoho.com`). For Hostinger it is `smtp.hostinger.com`.

Also set `EMAIL_FROM`, for example `MatrixPOS <no-reply@matrixinfo.co.uk>`, using an address your provider lets you send from. Without email settings, nobody can confirm their email or reset a password.

## Daily clean-up

`vercel.json` runs `/api/cron/daily` every night. It permanently deletes businesses whose owners closed their account more than 30 days ago, and clears old sign-in records. Set `CRON_SECRET` in Vercel to a long random string (Vercel sends it with each run). Without it, the job refuses to run.

## Pricing and your HQ dashboard

Plans and prices live in `src/lib/plans.ts`. Change them there and they update on the landing page, the sign-up form and the billing page.

Every new business gets a 14-day free trial. When the trial ends, or you suspend a business, its owner can only see **Plan & billing** and its tills can't sign in. Overdue businesses keep working but see a reminder.

To open the HQ dashboard at `/platform`:

1. Set up email (above), then sign up for a MatrixPOS account with your own email (this is your own business on the system).
2. Confirm your email with the link we send. HQ access needs a confirmed email, so nobody else can claim it by signing up with your address.
3. In Vercel, add `PLATFORM_ADMIN_EMAILS` with that email (comma separate several) and redeploy.
4. Sign in and click **MatrixPOS HQ** in the menu.

The dashboard shows every business, sign-ups per week, who is trading, takings, trials ending, monthly revenue and plan requests. On each business you can mark it paid, extend its trial, change its plan or suspend it. Your own business and the demo shop are never locked and are left out of the numbers. Everyone else gets a 404 at `/platform`.

Optional: `BILLING_CONTACT_EMAIL` is shown to shop owners on the billing page (defaults to the first platform email).

## Card terminals

Each business enters its own keys in **Settings**, and links a reader to each till in **Stores & tills**:

| Provider | What you need |
| --- | --- |
| Stripe Terminal | Secret key (`sk_live_…` or `sk_test_…`) and the reader id (`tmr_…`) of a registered reader |
| SumUp | API key, merchant code, and the reader id of a paired Solo reader (Cloud API) |
| Dojo | API key from the Dojo developer portal and the terminal id |

Test with sandbox keys before taking real payments. Integrated card payments need an internet connection. If the connection drops, the till still offers cash and keyed card payments.

## Security and UK GDPR

- Passwords and PINs are stored as bcrypt hashes. Sessions are signed, HTTP-only cookies.
- Back office sign-in is limited to 5 wrong passwords per account and 30 per network address in 15 minutes. Till PINs lock for a minute after 5 wrong tries.
- Owners and managers can turn on two-step sign-in with an authenticator app under **My account**. If someone loses their phone, switch it off for them on their business page in HQ.
- New accounts must accept the terms, privacy policy and data processing agreement (`/terms`, `/privacy`, `/dpa`). When you change them, update `version` in `src/lib/legal.ts` and owners are asked to accept again. Have a solicitor review the wording.
- Owners can download all their data and close their account under **Plan & billing**.

## Security checklist

- Keep `AUTH_SECRET` and `DATABASE_URL` only in Vercel's environment variables, never in the repository.
- Keep the VPS updated (`sudo apt update && sudo apt upgrade`) and use SSH keys rather than passwords.
- Card numbers never touch MatrixPOS: card data stays inside the card terminal, which keeps your PCI DSS scope small.
- Register with the ICO if you hold customer personal data for loyalty or marketing.
