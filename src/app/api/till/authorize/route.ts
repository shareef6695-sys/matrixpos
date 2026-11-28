import { tillContext, authorizeOverride, json, fail, audit } from "@/lib/server/till";
import { isLimited, recordAttempt } from "@/lib/server/ratelimit";
import { apiRoute } from "@/lib/server/errors";
import { APPROVAL_MAX_AGE, sign } from "@/lib/session";

/**
 * Supervisor override: refund, void, price change, discount or no-sale.
 * Returns a signed approval for this one sale, which the till sends with the sale. The server only accepts a
 * staff discount or a refund from a cashier when the sale carries one, so the approval can't be skipped by
 * calling the sales API directly.
 */
export const POST = apiRoute("POST /api/till/authorize", async (req: Request) => {
  const ctx = await tillContext({ requireActive: true });
  if (!ctx) return fail("Sign in at the till first", 401);
  const key = `override:${ctx.device.registerId}`;
  if (await isLimited(key, 5, 5)) return fail("Too many wrong PINs. Wait a few minutes and try again.", 429);
  const { pin, action, detail, saleId } = await req.json().catch(() => ({}));
  const act = String(action ?? "").slice(0, 30);
  const approver = await authorizeOverride(ctx.device.orgId, String(pin ?? ""), act === "refund" ? "MANAGER" : "SUPERVISOR");
  if (!approver) {
    await recordAttempt([key], false);
    return fail("That PIN can't approve this", 403);
  }
  await audit(ctx.device.orgId, approver.id, `override.${act}`, { cashierId: ctx.user.id, saleId: typeof saleId === "string" ? saleId.slice(0, 40) : null, detail: typeof detail === "string" ? detail.slice(0, 200) : null });
  const token = typeof saleId === "string" && /^[0-9a-f-]{36}$/i.test(saleId)
    ? await sign({ kind: "approval", orgId: ctx.device.orgId, registerId: ctx.device.registerId, saleId, action: act, approverId: approver.id, approverRole: approver.role }, APPROVAL_MAX_AGE)
    : null;
  return json({ ok: true, approver: { name: approver.name }, token });
});
