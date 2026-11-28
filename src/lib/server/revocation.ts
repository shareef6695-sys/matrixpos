import "server-only";
import { db } from "./db";

/**
 * Deny-list for signed tokens. A signed cookie stays valid until it expires, so signing out records its id here
 * and every request checks it. Rows are removed by the daily clean-up once the token would have expired anyway.
 */
export async function revoke(jti: string | undefined, expSeconds: number | undefined) {
  if (!jti) return;
  const expiresAt = new Date((expSeconds ?? Math.floor(Date.now() / 1000) + 86_400) * 1000);
  await db.revokedToken.upsert({ where: { id: `jti:${jti}` }, create: { id: `jti:${jti}`, expiresAt }, update: {} });
}

export async function isRevoked(jti: string | undefined) {
  if (!jti) return false;
  return !!(await db.revokedToken.findUnique({ where: { id: `jti:${jti}` }, select: { id: true } }));
}

/** Records a one-time value (such as an authenticator code). Returns false if it was already used. */
export async function useOnce(id: string, expiresAt: Date) {
  try {
    await db.revokedToken.create({ data: { id, expiresAt } });
    return true;
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return false;
    throw e;
  }
}
