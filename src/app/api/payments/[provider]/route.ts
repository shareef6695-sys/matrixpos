import { db } from "@/lib/server/db";
import { tillContext, json, fail } from "@/lib/server/till";
import { providers, providerEnabled, type ProviderId } from "@/lib/server/payments";
import { withOpenSecrets } from "@/lib/server/secret-box";
import { apiRoute, publicMessage } from "@/lib/server/errors";

/**
 * POST { action: "start", amountPence, saleId } | { action: "status", ref } | { action: "cancel", ref }
 *
 * Each payment is recorded here as it starts, and marked approved only when the provider itself says so.
 * The sales API only accepts a card machine payment that is recorded and approved for that sale and amount.
 */
export const POST = apiRoute("POST /api/payments/[provider]", async (req: Request, { params }: { params: Promise<{ provider: string }> }) => {
  // Card payments need an active subscription, even on a till that signed in before the account was locked.
  const ctx = await tillContext({ requireActive: true });
  if (!ctx) return fail("Sign in at the till first. If you are signed in, check the shop's subscription under Billing.", 401);
  const id = (await params).provider.toUpperCase() as ProviderId;
  if (!(id in providers)) return fail("Unknown payment provider", 404);
  const [stored, register] = await Promise.all([
    db.orgSettings.findUnique({ where: { organizationId: ctx.device.orgId } }),
    db.register.findUnique({ where: { id: ctx.device.registerId } }),
  ]);
  if (!stored || !register || !providerEnabled(stored, id)) return fail("This payment method is not switched on", 403);
  const p = providers[id];
  const body = await req.json().catch(() => ({}));
  try {
    // Provider keys are encrypted in the database; decrypt them only for this server-side call.
    const call = { settings: withOpenSecrets(stored), register };
    if (body.action === "start") {
      const amount = Math.trunc(Number(body.amountPence));
      const saleId = String(body.saleId ?? "");
      if (!(amount > 0) || amount > 10_000_000) return fail("Invalid amount");
      if (!/^[0-9a-f-]{36}$/i.test(saleId)) return fail("Invalid sale");
      const started = await p.start(call, amount, saleId);
      if (!started.ref) return fail("The card machine didn't start the payment", 502);
      await db.cardPayment.create({ data: { organizationId: ctx.device.orgId, registerId: register.id, saleId, provider: id, ref: String(started.ref), amountPence: amount } });
      return json(started);
    }
    // Status and cancel only for payments this till started.
    const payment = await db.cardPayment.findFirst({ where: { provider: id, ref: String(body.ref ?? ""), organizationId: ctx.device.orgId, registerId: register.id } });
    if (!payment) return fail("Payment not found", 404);
    if (body.action === "status") {
      if (payment.approvedAt) return json({ state: "APPROVED", reference: payment.reference ?? payment.ref });
      const st = await p.status(call, payment.ref);
      if (st.state === "APPROVED") await db.cardPayment.update({ where: { id: payment.id }, data: { approvedAt: new Date(), reference: st.reference ?? payment.ref } });
      return json(st);
    }
    if (body.action === "cancel") { await p.cancel(call, payment.ref); return json({ ok: true }); }
    return fail("Unknown action");
  } catch (e) {
    return fail(await publicMessage(e, `card payment ${id} ${String(body.action)}`, "The card machine couldn't be reached. Try again, or take the payment another way"), 502);
  }
});
