import { timingSafeEqual } from "node:crypto";
import { dailyCleanup } from "@/lib/server/account";
import { apiRoute } from "@/lib/server/errors";
import { runRecurring } from "@/lib/server/hq-recurring";
import { runRenewals } from "@/lib/server/hq-contracts";

/** Compares in constant time, so the secret can't be guessed from response timings. */
function matches(given: string | null, secret: string) {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Runs once a day (vercel.json): deletes businesses closed over 30 days ago and old sign-in records, and makes HQ's repeating invoices. */
export const GET = apiRoute("GET /api/cron/daily", async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || !matches(req.headers.get("authorization"), secret)) return new Response("Unauthorised", { status: 401 });
  const result = await dailyCleanup();
  // Matrix HQ's repeating invoices. Only counts are returned, never client names.
  const recurring = await runRecurring();
  const renewals = await runRenewals();
  return Response.json({ ok: true, ...result, recurringInvoices: recurring.made, recurringEmailed: recurring.emailed, recurringProblems: recurring.problems.length, contractsRenewed: renewals.renewed, renewalReminders: renewals.reminders });
});
