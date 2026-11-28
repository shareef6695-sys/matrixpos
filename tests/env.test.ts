import { describe, expect, it } from "vitest";
import { checkEnv, isLiveRuntime } from "@/lib/env";

const db = "postgresql://postgres.tenant:Xk3s9QpL2mVb7RtY8wZa@db.example.co.uk:6543/postgres?schema=matrixpos&sslmode=require";
const good = {
  DATABASE_URL: db,
  DIRECT_URL: db.replace("6543", "5432"),
  AUTH_SECRET: "a".repeat(20) + "b".repeat(30),
  SECRETS_ENCRYPTION_KEY: "c".repeat(44),
  CRON_SECRET: "d".repeat(32),
  RESEND_API_KEY: "re_x",
  APP_URL: "https://pos.example.co.uk",
  PLATFORM_ADMIN_EMAILS: "me@example.co.uk",
};

describe("checkEnv", () => {
  it("accepts a complete production setup", () => {
    expect(checkEnv(good)).toEqual({ errors: [], warnings: [] });
  });

  it("refuses when critical settings are missing", () => {
    const { errors } = checkEnv({});
    for (const k of ["DATABASE_URL", "DIRECT_URL", "AUTH_SECRET", "SECRETS_ENCRYPTION_KEY", "CRON_SECRET"]) expect(errors.some((e) => e.startsWith(k))).toBe(true);
  });

  it("never puts a value in a message", () => {
    const { errors } = checkEnv({ ...good, AUTH_SECRET: "short-secret-value" });
    expect(errors.join(" ")).not.toContain("short-secret-value");
  });

  it("requires TLS for a remote database", () => {
    expect(checkEnv({ ...good, DATABASE_URL: db.replace("sslmode=require", "sslmode=prefer") }).errors[0]).toMatch(/sslmode=require/);
    expect(checkEnv({ ...good, DATABASE_URL: db.replace("&sslmode=require", "") }).errors[0]).toMatch(/missing sslmode/);
    expect(checkEnv({ ...good, DATABASE_URL: "postgresql://u:Xk3s9QpL2mVb7RtY8wZa@localhost:5432/db" }).errors).toEqual([]);
  });

  it("refuses default database passwords", () => {
    expect(checkEnv({ ...good, DATABASE_URL: db.replace("Xk3s9QpL2mVb7RtY8wZa", "postgres") }).errors[0]).toMatch(/default/);
  });

  it("warns about unverified certificates", () => {
    expect(checkEnv({ ...good, DATABASE_URL: `${db}&sslaccept=accept_invalid_certs` }).warnings[0]).toMatch(/accept_invalid_certs/);
  });

  it("needs the Stripe webhook secret when Stripe billing is on", () => {
    expect(checkEnv({ ...good, STRIPE_BILLING_SECRET_KEY: "sk_live_abc" }).errors[0]).toMatch(/STRIPE_WEBHOOK_SECRET/);
    expect(checkEnv({ ...good, STRIPE_BILLING_SECRET_KEY: "sk_live_abc", STRIPE_WEBHOOK_SECRET: "whsec_x" }).errors).toEqual([]);
  });

  it("refuses secrets exposed to the browser", () => {
    expect(checkEnv({ ...good, NEXT_PUBLIC_STRIPE_SECRET_KEY: "x" }).errors[0]).toMatch(/NEXT_PUBLIC_/);
  });
});

describe("isLiveRuntime", () => {
  it("is the Vercel production deploy or next start, not previews or dev", () => {
    expect(isLiveRuntime({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(true);
    expect(isLiveRuntime({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(false);
    expect(isLiveRuntime({ NODE_ENV: "production" })).toBe(true);
    expect(isLiveRuntime({ NODE_ENV: "development" })).toBe(false);
  });
});
