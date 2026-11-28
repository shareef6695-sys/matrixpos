import { tillContext, authorizeOverride, json, fail, audit } from "@/lib/server/till";
import { isLimited, recordAttempt } from "@/lib/server/ratelimit";
import { apiRoute } from "@/lib/server/errors";

/** Supervisor override: refund, void, price change, discount or no-sale. */
export const POST = apiRoute("POST /api/till/authorize", async (req: Request) => {
  const ctx = await tillContext();
  if (!ctx) return fail("Sign in at the till first", 401);
  const key = `override:${ctx.device.registerId}`;
  if (await isLimited(key, 5, 5)) return fail("Too many wrong PINs. Wait a few minutes and try again.", 429);
  const { pin, action, detail } = await req.json().catch(() => ({}));
  const approver = await authorizeOverride(ctx.device.orgId, String(pin ?? ""), action === "refund" ? "MANAGER" : "SUPERVISOR");
  if (!approver) {
    await recordAttempt([key], false);
    return fail("That PIN can't approve this", 403);
  }
  await audit(ctx.device.orgId, approver.id, `override.${String(action).slice(0, 30)}`, { cashierId: ctx.user.id, detail: typeof detail === "string" ? detail.slice(0, 200) : null });
  return json({ ok: true, approver: { name: approver.name } });
});
