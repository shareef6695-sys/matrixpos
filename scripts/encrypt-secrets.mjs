// Runs during production deploys, after migrations: encrypts any card provider keys still stored
// as plain text (saved before SECRETS_ENCRYPTION_KEY was set, or before a key change), and the
// two-step sign-in (authenticator app) secrets of back office users.
// Same format as src/lib/server/secret-box.ts. Safe to run any number of times.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const PREFIX = "enc:v1:";
const AAD = Buffer.from("matrixpos-provider-key");
const FIELDS = ["stripeSecretKey", "sumupApiKey", "dojoApiKey"];
const keyOf = (name) => {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  if (raw.length < 32) throw new Error(`${name} must be at least 32 characters`);
  return createHash("sha256").update(raw).digest();
};

const env = process.env.VERCEL_ENV;
const key = keyOf("SECRETS_ENCRYPTION_KEY");
const oldKey = keyOf("SECRETS_ENCRYPTION_KEY_OLD");
if (env && env !== "production") {
  console.log(`Skipping provider key encryption for a ${env} deploy.`);
} else if (!key) {
  console.log("SECRETS_ENCRYPTION_KEY is not set: card provider keys stay unencrypted. Add it in Vercel and redeploy.");
} else {
  const seal = (plain) => {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    c.setAAD(AAD);
    const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
    return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url");
  };
  const openWith = (k, stored) => {
    const buf = Buffer.from(stored.slice(PREFIX.length), "base64url");
    const d = createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
    d.setAAD(AAD);
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  };
  const db = new PrismaClient();
  try {
    const rows = await db.orgSettings.findMany({ select: { id: true, stripeSecretKey: true, sumupApiKey: true, dojoApiKey: true } });
    let changed = 0;
    for (const row of rows) {
      const data = {};
      for (const f of FIELDS) {
        const v = row[f];
        if (!v) continue;
        if (!v.startsWith(PREFIX)) { data[f] = seal(v); continue; }
        // Already encrypted: re-encrypt values still under the old key, after a key change.
        try { openWith(key, v); } catch {
          if (oldKey) { try { data[f] = seal(openWith(oldKey, v)); } catch { console.error(`Can't decrypt ${f} for settings ${row.id}; the shop must re-enter it.`); } }
        }
      }
      if (Object.keys(data).length) { await db.orgSettings.update({ where: { id: row.id }, data }); changed++; }
    }
    console.log(`Card provider keys: ${changed} shop(s) encrypted or re-keyed, ${rows.length} checked.`);

    const users = await db.user.findMany({ where: { totpSecret: { not: null } }, select: { id: true, totpSecret: true } });
    let totp = 0;
    for (const u of users) {
      const v = u.totpSecret;
      let next = null;
      if (!v.startsWith(PREFIX)) next = seal(v);
      else {
        try { openWith(key, v); } catch {
          if (oldKey) { try { next = seal(openWith(oldKey, v)); } catch { console.error(`Can't decrypt the two-step sign-in secret for user ${u.id}; reset it from HQ.`); } }
        }
      }
      if (next) { await db.user.update({ where: { id: u.id }, data: { totpSecret: next } }); totp++; }
    }
    console.log(`Two-step sign-in secrets: ${totp} encrypted or re-keyed, ${users.length} checked.`);
  } finally {
    await db.$disconnect();
  }
}
