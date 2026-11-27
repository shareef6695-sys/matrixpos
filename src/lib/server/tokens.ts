import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";

type Kind = "VERIFY_EMAIL" | "RESET_PASSWORD";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Creates a one-time token and returns the raw value to put in a link. Older unused tokens of the same kind stop working. */
export async function createToken(userId: string, kind: Kind, ttlMinutes: number) {
  const raw = randomBytes(32).toString("base64url");
  await db.authToken.deleteMany({ where: { userId, kind, usedAt: null } });
  await db.authToken.create({ data: { userId, kind, tokenHash: sha(raw), expiresAt: new Date(Date.now() + ttlMinutes * 60_000) } });
  return raw;
}

/** Checks a token without using it up. */
export async function peekToken(raw: string, kind: Kind) {
  if (!raw) return null;
  const t = await db.authToken.findUnique({ where: { tokenHash: sha(raw) } });
  return t && t.kind === kind && !t.usedAt && t.expiresAt > new Date() ? t : null;
}

/** Uses up a token. Returns the user id, or null if it's wrong, used or expired. */
export async function consumeToken(raw: string, kind: Kind) {
  const t = await peekToken(raw, kind);
  if (!t) return null;
  const { count } = await db.authToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
  return count ? t.userId : null;
}
