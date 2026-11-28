/**
 * Checks the environment variables the app needs. Used in two places:
 *  - next.config.ts, so a production build on Vercel fails (and the current live version stays up)
 *    when a critical setting is missing or wrong;
 *  - src/instrumentation.ts, so the server refuses to start without them.
 *
 * Kept free of imports so it can run in next.config.ts, the Node server and the tests.
 * Error messages name the variable and say how to fix it. They never include its value.
 */

type Env = Record<string, string | undefined>;

export interface EnvReport { errors: string[]; warnings: string[] }

/** The live site: a Vercel production deploy, or `next start` on your own server. Not previews, CI builds or `next dev`. */
export function isLiveRuntime(env: Env = process.env) {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production";
}

const has = (env: Env, k: string) => !!env[k]?.trim();

/** sslmode values that make Prisma refuse a connection without TLS. */
const TLS_MODES = new Set(["require", "verify-ca", "verify-full"]);

function checkDbUrl(env: Env, name: string, errors: string[], warnings: string[]) {
  const raw = env[name]?.trim();
  if (!raw) {
    errors.push(`${name} is not set. Add the PostgreSQL connection string (see docs/SUPABASE.md).`);
    return;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    errors.push(`${name} is not a valid connection string. It should start with postgresql://`);
    return;
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) errors.push(`${name} must be a postgresql:// connection string.`);
  const host = url.hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const mode = url.searchParams.get("sslmode");
  if (!local && !TLS_MODES.has(mode ?? "")) {
    errors.push(`${name} must use an encrypted connection: add sslmode=require to it (it is currently ${mode ? `sslmode=${mode}` : "missing sslmode"}).`);
  }
  const password = decodeURIComponent(url.password);
  if (!password) errors.push(`${name} has no password.`);
  else if (["postgres", "password", "matrixpos", "change_me", "your-super-secret-and-long-postgres-password"].includes(password.toLowerCase()))
    errors.push(`${name} uses a default or example password. Set a long random database password on the server and here.`);
  else if (password.length < 16) warnings.push(`${name}: the database password is short. Use 24 or more random characters.`);
  if (!local && url.searchParams.get("sslaccept") === "accept_invalid_certs")
    warnings.push(`${name} accepts any TLS certificate (sslaccept=accept_invalid_certs). The connection is encrypted, but the server's identity isn't checked. Put a real certificate on the database and remove it.`);
}

export function checkEnv(env: Env = process.env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  checkDbUrl(env, "DATABASE_URL", errors, warnings);
  checkDbUrl(env, "DIRECT_URL", errors, warnings);

  const auth = env.AUTH_SECRET?.trim() ?? "";
  if (!auth) errors.push("AUTH_SECRET is not set. Generate one with: openssl rand -base64 48");
  else if (auth.length < 32) errors.push("AUTH_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 48");
  else if (/change_me|ci-secret/i.test(auth)) errors.push("AUTH_SECRET is still the example value. Generate one with: openssl rand -base64 48");

  const enc = env.SECRETS_ENCRYPTION_KEY?.trim() ?? "";
  if (!enc) errors.push("SECRETS_ENCRYPTION_KEY is not set. It encrypts shops' card machine keys. Generate one with: openssl rand -base64 32");
  else if (enc.length < 32) errors.push("SECRETS_ENCRYPTION_KEY must be at least 32 characters. Generate one with: openssl rand -base64 32");
  if (enc && auth && enc === auth) errors.push("SECRETS_ENCRYPTION_KEY must be different from AUTH_SECRET.");

  const cron = env.CRON_SECRET?.trim() ?? "";
  if (!cron) errors.push("CRON_SECRET is not set. The nightly clean-up job needs it. Use any long random string: openssl rand -base64 32");
  else if (cron.length < 16) errors.push("CRON_SECRET must be at least 16 characters.");

  if (has(env, "STRIPE_BILLING_SECRET_KEY")) {
    if (!has(env, "STRIPE_WEBHOOK_SECRET")) errors.push("STRIPE_BILLING_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is not. Copy the signing secret (whsec_...) from your Stripe webhook.");
    if (!/^(sk|rk)_(live|test)_/.test(env.STRIPE_BILLING_SECRET_KEY!.trim())) errors.push("STRIPE_BILLING_SECRET_KEY doesn't look like a Stripe secret key (sk_live_... or rk_live_...).");
  } else if (has(env, "STRIPE_WEBHOOK_SECRET")) {
    warnings.push("STRIPE_WEBHOOK_SECRET is set but STRIPE_BILLING_SECRET_KEY is not, so card payments for subscriptions are off.");
  }

  const smtp = has(env, "SMTP_HOST");
  if (!has(env, "RESEND_API_KEY") && !smtp) warnings.push("No email provider: set RESEND_API_KEY, or SMTP_HOST, SMTP_USER and SMTP_PASSWORD. Without it nobody can confirm their email or reset a password.");
  if (smtp && (!has(env, "SMTP_USER") || !has(env, "SMTP_PASSWORD"))) warnings.push("SMTP_HOST is set but SMTP_USER or SMTP_PASSWORD is missing.");
  if (!has(env, "APP_URL")) warnings.push("APP_URL is not set, so links in emails use the address of the request. Set APP_URL=https://pos.matrixinfo.co.uk");
  else if (!/^https:\/\//.test(env.APP_URL!.trim())) warnings.push("APP_URL should start with https://");
  if (!has(env, "PLATFORM_ADMIN_EMAILS")) warnings.push("PLATFORM_ADMIN_EMAILS is not set, so nobody can open the HQ dashboard.");

  for (const k of Object.keys(env)) {
    if (k.startsWith("NEXT_PUBLIC_") && /SECRET|KEY|PASSWORD|TOKEN|DATABASE/i.test(k))
      errors.push(`${k} looks like a secret but has the NEXT_PUBLIC_ prefix, which copies it into every browser. Rename it without NEXT_PUBLIC_.`);
  }

  return { errors, warnings };
}

/** Throws one error listing every problem. Call only for the live site. */
export function assertEnv(where: string, env: Env = process.env) {
  const { errors, warnings } = checkEnv(env);
  for (const w of warnings) console.warn(`[env] ${w}`);
  if (errors.length) {
    throw new Error(`MatrixPOS ${where}: required settings are missing or unsafe. Fix these environment variables and redeploy:\n  - ${errors.join("\n  - ")}`);
  }
}
