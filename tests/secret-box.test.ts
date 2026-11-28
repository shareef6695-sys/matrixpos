import { afterEach, describe, expect, it } from "vitest";
import { openSecret, sealSecret, withOpenSecrets } from "../src/lib/server/secret-box";

const KEY = "test-key-test-key-test-key-test-key-1234";
const OTHER = "other-key-other-key-other-key-other-5678";
afterEach(() => { delete process.env.SECRETS_ENCRYPTION_KEY; delete process.env.SECRETS_ENCRYPTION_KEY_OLD; });

describe("card provider key encryption", () => {
  it("round-trips and never stores the key in plain text", () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY;
    const sealed = sealSecret("sk_test_abc123");
    expect(sealed).toMatch(/^enc:v1:/);
    expect(sealed).not.toContain("abc123");
    expect(sealSecret("sk_test_abc123")).not.toBe(sealed); // random IV each time
    expect(openSecret(sealed)).toBe("sk_test_abc123");
  });

  it("reads keys saved before encryption, and keeps null / blank as they are", () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY;
    expect(openSecret("sk_test_legacy")).toBe("sk_test_legacy");
    expect(sealSecret(null)).toBeNull();
    expect(sealSecret(undefined)).toBeUndefined();
    expect(openSecret(null)).toBeNull();
  });

  it("does not double-encrypt", () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY;
    const sealed = sealSecret("x");
    expect(sealSecret(sealed)).toBe(sealed);
  });

  it("falls back to the old key after a key change, and refuses a wrong or missing key", () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY;
    const sealed = sealSecret("sk_live_rotate");
    process.env.SECRETS_ENCRYPTION_KEY = OTHER;
    expect(() => openSecret(sealed)).toThrow(/can't be decrypted/);
    process.env.SECRETS_ENCRYPTION_KEY_OLD = KEY;
    expect(openSecret(sealed)).toBe("sk_live_rotate");
    delete process.env.SECRETS_ENCRYPTION_KEY; delete process.env.SECRETS_ENCRYPTION_KEY_OLD;
    expect(() => openSecret(sealed)).toThrow(/not set/);
  });

  it("detects tampering", () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY;
    const sealed = sealSecret("sk_live_tamper");
    const bad = sealed.slice(0, -3) + (sealed.endsWith("A") ? "BBB" : "AAA");
    expect(() => openSecret(bad)).toThrow();
  });

  it("decrypts only the provider key fields", () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY;
    const s = withOpenSecrets({ stripeSecretKey: sealSecret("sk_test_1"), sumupApiKey: null, dojoApiKey: "plain", other: 1 } as never);
    expect(s).toMatchObject({ stripeSecretKey: "sk_test_1", sumupApiKey: null, dojoApiKey: "plain", other: 1 });
  });
});
