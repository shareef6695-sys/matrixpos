import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { redact } from "../src/lib/server/redact";

/** Guards for personal data: what may be logged, stored in the browser, or kept in session cookies. */
const src = execSync("git ls-files src", { encoding: "utf8" }).split("\n").filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");

describe("redact masks personal data", () => {
  it("masks email addresses", () => {
    expect(redact("550 Mailbox jo.bloggs+shop@example.co.uk unavailable")).toBe("550 Mailbox [REDACTED] unavailable");
  });
  it("masks UK mobile numbers", () => {
    expect(redact("customer 07700 900123 and +44 7700 900456")).toBe("customer [REDACTED] and [REDACTED]");
  });
  it("masks one-time tokens in links", () => {
    expect(redact("https://pos.example/reset-password?token=abc123XYZ&x=1")).toBe("https://pos.example/reset-password?token=[REDACTED]&x=1");
  });
  it("leaves receipt numbers and amounts alone", () => {
    expect(redact("Receipt LDN1-1-000123 for 1234 pence")).toBe("Receipt LDN1-1-000123 for 1234 pence");
  });
});

describe("logging", () => {
  it("never passes personal fields to console.*", () => {
    const hits: string[] = [];
    for (const f of src) read(f).split("\n").forEach((line, i) => {
      const m = line.match(/console\.(log|info|warn|error|debug)\((.*)/);
      if (m && /\b(email|password|passwordHash|pin|pinHash|phone|token|totpSecret|\.to)\b/.test(m[2]) && !/\[REDACTED\]/.test(m[2])) hits.push(`${f}:${i + 1}`);
    });
    expect(hits).toEqual([]);
  });
});

describe("browser storage", () => {
  it("uses no localStorage or sessionStorage", () => {
    expect(src.filter((f) => /\b(localStorage|sessionStorage)\b/.test(read(f)))).toEqual([]);
  });
  it("only sets cookies through cookieOpts (httpOnly, sameSite, secure in production)", () => {
    const hits = src.filter((f) => /\.set\((ADMIN|DEVICE|TILL|MFA)_COOKIE/.test(read(f)) && !/\.set\((ADMIN|DEVICE|TILL|MFA)_COOKIE,[^\n]*cookieOpts\(/.test(read(f)));
    expect(hits).toEqual([]);
    const opts = read("src/lib/server/auth.ts");
    expect(opts).toMatch(/httpOnly: true/);
    expect(opts).toMatch(/sameSite: "lax"/);
  });
  it("keeps names and emails out of session cookies", () => {
    for (const f of src) for (const m of read(f).matchAll(/sign\(\{([^}]*)\}/g)) expect(m[1], f).not.toMatch(/\b(name|email)\b/);
  });
});
