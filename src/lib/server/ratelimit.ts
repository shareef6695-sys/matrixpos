import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { db } from "./db";

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/**
 * Rate limit keys hold email addresses and IP addresses ("email:jo@shop.co.uk", "ip:81.2.69.160").
 * Only a keyed hash is stored, so the LoginAttempt table never holds personal data in readable form.
 * The kind prefix stays readable ("email:3fa9..."), which is handy when debugging.
 */
export function attemptKey(key: string) {
  const i = key.indexOf(":");
  const kind = i > 0 ? key.slice(0, i) : "key";
  const secret = process.env.AUTH_SECRET ?? "";
  return `${kind}:${createHmac("sha256", secret).update(key.toLowerCase()).digest("hex").slice(0, 40)}`;
}

/** True if `key` has had `max` or more failed attempts in the last `minutes`. Stored in the database so it works across serverless instances. */
export async function isLimited(key: string, max: number, minutes: number) {
  const n = await db.loginAttempt.count({ where: { key: attemptKey(key), success: false, createdAt: { gte: new Date(Date.now() - minutes * 60_000) } } });
  return n >= max;
}

/**
 * Counts every request under `key`, successful or not, e.g. "5 sign-in attempts a minute from one IP address".
 * Returns true when the limit is reached (refuse the request); otherwise records this request and returns false.
 */
export async function overLimit(key: string, max: number, minutes: number) {
  const k = attemptKey(`rate:${key}`);
  const n = await db.loginAttempt.count({ where: { key: k, createdAt: { gte: new Date(Date.now() - minutes * 60_000) } } });
  if (n >= max) return true;
  await db.loginAttempt.create({ data: { key: k, success: true } });
  return false;
}

export async function recordAttempt(keys: string[], success: boolean) {
  await db.loginAttempt.createMany({ data: keys.map((key) => ({ key: attemptKey(key), success })) });
  // A successful sign-in clears that account's failures.
  if (success) await db.loginAttempt.deleteMany({ where: { key: { in: keys.filter((k) => !k.startsWith("ip:")).map(attemptKey) }, success: false } });
}

/** Forgets every attempt recorded under these keys (e.g. after a password reset). */
export async function clearAttempts(keys: string[]) {
  await db.loginAttempt.deleteMany({ where: { key: { in: keys.map(attemptKey) } } });
}
