import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { redact } from "../src/lib/server/redact";

/**
 * The repository is public, so no real credential may ever be committed.
 * This scans every tracked file for strings shaped like live keys, tokens and passwords.
 */
const RULES: [string, RegExp][] = [
  ["Stripe secret / restricted key", /\b[sr]k_(live|test)_[A-Za-z0-9]{10,}/],
  ["Stripe webhook secret", /\bwhsec_[A-Za-z0-9]{10,}/],
  ["Resend API key", /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/],
  ["SendGrid key", /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Google / Firebase API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["OpenAI / Anthropic key", /\bsk-(proj-|ant-)?[A-Za-z0-9_-]{20,}/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ["Slack token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ["Twilio key", /\bSK[0-9a-f]{32}\b/],
  ["JWT (e.g. Supabase anon / service_role key)", /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  // A connection string with an inline password, unless it is an obvious placeholder or the CI throwaway database.
  ["Database URL with password", /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis):\/\/[^:\s"'/]+:(?!CHANGE_ME|<|\$\{|matrixpos@localhost)[^@\s"']{6,}@/],
  ["NEXT_PUBLIC_ secret", /NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|DATABASE|STRIPE_SECRET)/],
];

const SKIP = [/^package-lock\.json$/, /^tests\/secrets\.test\.ts$/, /\.(png|jpe?g|gif|ico|webp|woff2?)$/];

describe("no secrets in the repository", () => {
  const files = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter((f) => f && !SKIP.some((r) => r.test(f)));

  it("finds tracked files to scan", () => expect(files.length).toBeGreaterThan(50));

  it("has no hardcoded credentials", () => {
    const hits: string[] = [];
    for (const f of files) {
      let text: string;
      try { text = readFileSync(f, "utf8"); } catch { continue; }
      text.split("\n").forEach((line, i) => {
        for (const [name, re] of RULES) if (re.test(line)) hits.push(`${f}:${i + 1} ${name}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("never commits a real .env file", () => {
    expect(files.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example"))).toEqual([]);
  });
});

describe("redact", () => {
  it("masks keys, tokens and passwords", () => {
    const s = redact("Invalid key sk_live_51Habc123XYZ and whsec_abcdef12345, Authorization: Bearer abc.def-ghi, postgresql://postgres.t1:hunter2pass@db:6543/postgres");
    expect(s).not.toMatch(/51Habc123XYZ|abcdef12345|abc\.def-ghi|hunter2pass/);
    expect(s).toContain("postgresql://postgres.t1:[redacted]@db");
  });
});
