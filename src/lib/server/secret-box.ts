/**
 * Encrypts shops' card provider keys (Stripe Terminal, SumUp, Dojo) and users' two-step sign-in
 * (authenticator app) secrets before they go into the database, so a leaked backup or database dump
 * doesn't hand out working keys or let someone generate sign-in codes.
 *
 * AES-256-GCM with a server-only key from SECRETS_ENCRYPTION_KEY (any long random string, e.g.
 * `openssl rand -base64 32`). Stored values look like `enc:v1:<base64url>`. Values saved before
 * encryption was switched on are plain text and still read correctly; scripts/encrypt-secrets.mjs
 * encrypts them on the next production deploy.
 *
 * To change the key: put the current one in SECRETS_ENCRYPTION_KEY_OLD, a new one in
 * SECRETS_ENCRYPTION_KEY, and redeploy. Keep this format in step with scripts/encrypt-secrets.mjs.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const AAD = Buffer.from("matrixpos-provider-key");

/** The fields of OrgSettings that hold provider credentials. */
export const ENCRYPTED_FIELDS = ["stripeSecretKey", "sumupApiKey", "dojoApiKey"] as const;

function keyFrom(name: string): Buffer | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  if (raw.length < 32) throw new Error(`${name} must be at least 32 characters`);
  return createHash("sha256").update(raw).digest();
}

export const encryptionEnabled = () => !!process.env.SECRETS_ENCRYPTION_KEY?.trim();
export const isEncrypted = (v: string) => v.startsWith(PREFIX);

/** Encrypts a value for storage. Without SECRETS_ENCRYPTION_KEY it is stored as before (the HQ setup checklist flags this). */
export function sealSecret(plain: string): string;
export function sealSecret(plain: string | null | undefined): string | null | undefined;
export function sealSecret(plain: string | null | undefined) {
  if (plain == null || plain === "" || isEncrypted(plain)) return plain;
  const key = keyFrom("SECRETS_ENCRYPTION_KEY");
  if (!key) return plain;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(AAD);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url");
}

/** Reads a stored value: decrypts it, or returns it unchanged if it was saved before encryption. */
export function openSecret(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return null;
  if (!isEncrypted(stored)) return stored;
  const buf = Buffer.from(stored.slice(PREFIX.length), "base64url");
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), ct = buf.subarray(28);
  const keys = [keyFrom("SECRETS_ENCRYPTION_KEY"), keyFrom("SECRETS_ENCRYPTION_KEY_OLD")].filter((k): k is Buffer => !!k);
  if (!keys.length) throw new Error("A saved card provider key is encrypted, but SECRETS_ENCRYPTION_KEY is not set on the server");
  for (const key of keys) {
    try {
      const d = createDecipheriv("aes-256-gcm", key, iv);
      d.setAAD(AAD);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
    } catch { /* try the next key */ }
  }
  throw new Error("A saved card provider key can't be decrypted: SECRETS_ENCRYPTION_KEY has changed. Re-enter the key in Settings, or set SECRETS_ENCRYPTION_KEY_OLD to the previous key");
}

/** A copy of the settings with provider keys decrypted, for server-side calls to the provider only. */
export function withOpenSecrets<T extends Partial<Record<(typeof ENCRYPTED_FIELDS)[number], string | null>>>(settings: T): T {
  const out = { ...settings };
  for (const f of ENCRYPTED_FIELDS) if (f in out) (out as Record<string, string | null>)[f] = openSecret(out[f]);
  return out;
}
