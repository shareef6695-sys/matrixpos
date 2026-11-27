import type Stripe from "stripe";
import { stripe, syncSubscription } from "@/lib/server/stripe-billing";
import { audit } from "@/lib/server/till";
import { saveStripeInvoice } from "@/lib/server/invoices";

/** Stripe tells us about subscription payments here. Add this URL as a webhook endpoint in Stripe. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_BILLING_SECRET_KEY) return new Response("Stripe billing is not set up", { status: 503 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  const s = stripe();
  switch (event.type) {
    case "checkout.session.completed": {
      const cs = event.data.object;
      if (cs.mode === "subscription" && cs.subscription) {
        const orgId = cs.client_reference_id ?? cs.metadata?.orgId ?? undefined;
        const sub = await s.subscriptions.retrieve(typeof cs.subscription === "string" ? cs.subscription : cs.subscription.id);
        const id = await syncSubscription(sub, orgId);
        if (id) await audit(id, null, "billing.card.subscribed", { subscription: sub.id });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object);
      break;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const inv = event.data.object;
      const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
      if (subId) {
        const id = await syncSubscription(await s.subscriptions.retrieve(subId));
        if (id) await saveStripeInvoice(inv, id);
        if (id) await audit(id, null, event.type === "invoice.paid" ? "billing.card.paid" : "billing.card.failed", { invoice: inv.id, amount: inv.amount_paid || inv.amount_due });
      }
      break;
    }
  }
  return Response.json({ received: true });
}
