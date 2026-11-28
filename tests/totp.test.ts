import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { totpAt, verifyTotp, newSecret } from "../src/lib/server/totp";

// RFC 6238 test secret "12345678901234567890" in base32
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp", () => {
  it("matches the RFC 6238 test vectors (last 6 digits)", () => {
    expect(totpAt(SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpAt(SECRET, Math.floor(2000000000 / 30))).toBe("279037");
  });
  it("verifies within one step of drift", () => {
    const now = 1111111109_000;
    expect(verifyTotp(SECRET, "081804", now)).toBe(Math.floor(now / 30_000));
    expect(verifyTotp(SECRET, "081804", now + 30_000)).toBe(Math.floor(now / 30_000));
    expect(verifyTotp(SECRET, "081804", now + 90_000)).toBe(false);
    expect(verifyTotp(SECRET, "abc", now)).toBe(false);
  });
  it("makes 32-character base32 secrets", () => {
    expect(newSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });
});
