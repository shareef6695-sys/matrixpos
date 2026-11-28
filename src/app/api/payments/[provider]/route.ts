import { db } from "@/lib/server/db";
import { tillContext, json, fail } from "@/lib/server/till";
import { providers, providerEnabled, type ProviderId } from "@/lib/server/payments";
import { safeErrorMessage } from "@/lib/server/redact";
import { withOpenSecrets } from "@/lib/server/secret-box";

/** POST { action: "start", amountPence, saleId } | { action: "status", ref } | { action: "cancel", ref } */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const ctx = await tillContext();
  if (!ctx) return fail("Sign in at the till first", 401);
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
      if (!(amount > 0)) return fail("Invalid amount");
      return json(await p.start(call, amount, String(body.saleId ?? "")));
    }
    if (body.action === "status") return json(await p.status(call, String(body.ref)));
    if (body.action === "cancel") { await p.cancel(call, String(body.ref)); return json({ ok: true }); }
    return fail("Unknown action");
  } catch (e) {
    return fail(safeErrorMessage(e, "Payment provider error"), 502);
  }
}
