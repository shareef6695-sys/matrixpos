import { dailyCleanup } from "@/lib/server/account";

/** Runs once a day (vercel.json): deletes businesses closed over 30 days ago and old sign-in records. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorised", { status: 401 });
  const result = await dailyCleanup();
  return Response.json({ ok: true, ...result });
}
