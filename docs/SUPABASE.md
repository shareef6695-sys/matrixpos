# Self-hosted Supabase as the MatrixPOS database

MatrixPOS can use a self-hosted Supabase stack on your UK VPS instead of plain PostgreSQL (`deploy/vps`).

## How it is set up

- Supabase's official Docker setup (a `self-hosted/vX.Y.Z` release tag) lives in `/opt/supabase`, with secrets in `/opt/supabase/.env` (root only).
- Port changes live in a separate `docker-compose.matrixpos.yml`, so Supabase's own files stay unchanged and updates are easier.
- Docker skips the `ufw` firewall, so the API gateway and Studio (port 8000) are bound to `127.0.0.1` only. Only the Supavisor pooler is public:
  - `6543`: transaction mode, used by the app (`DATABASE_URL`).
  - `5432`: session mode, used by `prisma migrate deploy` (`DIRECT_URL`).
- `ufw` allows only OpenSSH, 5432 and 6543.
- The pooler uses TLS with a self-signed certificate (`GLOBAL_DOWNSTREAM_CERT_PATH` / `GLOBAL_DOWNSTREAM_KEY_PATH`), hence `sslaccept=accept_invalid_certs` in the URLs.
- MatrixPOS tables live in their own schema, `matrixpos`, not `public`. Supabase's REST API exposes `public` to the anon key, and Prisma tables have no row-level security.

## Vercel environment variables

Set these for Production, Preview and Development, then redeploy:

```
DATABASE_URL=postgresql://postgres.<TENANT_ID>:<POSTGRES_PASSWORD>@<host>:6543/postgres?schema=matrixpos&pgbouncer=true&connection_limit=1&sslmode=require&sslaccept=accept_invalid_certs
DIRECT_URL=postgresql://postgres.<TENANT_ID>:<POSTGRES_PASSWORD>@<host>:5432/postgres?schema=matrixpos&sslmode=require&sslaccept=accept_invalid_certs
AUTH_SECRET=<openssl rand -base64 48>
```

## Opening Supabase Studio

Studio is not public. Open an SSH tunnel from your PC, then browse to http://localhost:8000 and log in with `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` from `.env`:

```
ssh -i <your key> -L 8000:localhost:8000 root@<host>
```

## Backups

`/opt/matrixpos/backup.sh` (from `deploy/supabase/backup.sh`) runs from `/etc/cron.d/matrixpos-backup` at 02:30 UK time. It dumps the `matrixpos` schema to `/opt/backups/matrixpos`, keeps 14 days there, and copies each file to Google Drive if an rclone remote called `gdrive` exists.

To set up Google Drive on the headless VPS:

1. On your PC, install rclone and run `rclone authorize "drive"`. Sign in with Google in the browser that opens, then copy the token it prints.
2. On the VPS, run `rclone config`, then choose: new remote, name `gdrive`, storage `drive`, scope `drive.file`. Answer **No** to "Use web browser to automatically authenticate", and paste the token.
3. Test it with `/opt/matrixpos/backup.sh`.

Restore with `/opt/matrixpos/restore.sh /opt/backups/matrixpos/<file>.dump`. It asks you to type RESTORE first, because it replaces the current MatrixPOS data.

## Later: a domain

When a domain such as `supabase.yourdomain.co.uk` points at the VPS, you can do two things:
- Put a Let's Encrypt certificate on the pooler and drop `sslaccept=accept_invalid_certs`.
- Optionally put Studio behind a reverse proxy with HTTPS, then update `SITE_URL`, `API_EXTERNAL_URL` and `SUPABASE_PUBLIC_URL`.
