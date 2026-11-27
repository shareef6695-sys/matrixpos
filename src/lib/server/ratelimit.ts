import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/** True if `key` has had `max` or more failed attempts in the last `minutes`. Stored in the database so it works across serverless instances. */
export async function isLimited(key: string, max: number, minutes: number) {
  const n = await db.loginAttempt.count({ where: { key, success: false, createdAt: { gte: new Date(Date.now() - minutes * 60_000) } } });
  return n >= max;
}

export async function recordAttempt(keys: string[], success: boolean) {
  await db.loginAttempt.createMany({ data: keys.map((key) => ({ key, success })) });
  // A successful sign-in clears that account's failures.
  if (success) await db.loginAttempt.deleteMany({ where: { key: { in: keys.filter((k) => !k.startsWith("ip:")) }, success: false } });
}
