import { timingSafeEqual } from "node:crypto";
import { dailyCleanup } from "@/lib/server/account";

/** Compares in constant time, so the secret can't be guessed from response timings. */
function matches(given: string | null, secret: string) {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Runs once a day (vercel.json): deletes businesses closed over 30 days ago and old sign-in records. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !matches(req.headers.get("authorization"), secret)) return new Response("Unauthorised", { status: 401 });
  const result = await dailyCleanup();
  return Response.json({ ok: true, ...result });
}
