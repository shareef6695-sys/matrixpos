import "server-only";
import Stripe from "stripe";
import { db } from "./db";
import { applyPlanToSettings } from "./billing";
import { planById, PLANS, type PlanId } from "@/lib/plans";

// MatrixPOS's own Stripe account, for charging shops their subscription.
// (Separate from each shop's Stripe Terminal keys, which are stored in their settings.)

export const stripeBillingEnabled = () => !!process.env.STRIPE_BILLING_SECRET_KEY;
/** "test" with sk_test_/rk_test_ keys, "live" with live keys, null when card payments are off. */
export const stripeMode = () => {
  const k = (process.env.STRIPE_BILLING_SECRET_KEY ?? "").trim();
  return !k ? null : /^(sk|rk)_test_/.test(k) ? ("test" as const) : ("live" as const);
};

let client: Stripe | null = null;
export function stripe() {
  if (!process.env.STRIPE_BILLING_SECRET_KEY) throw new Error("STRIPE_BILLING_SECRET_KEY is not set");
  client ??= new Stripe(process.env.STRIPE_BILLING_SECRET_KEY.trim(), { apiVersion: "2025-02-24.acacia", appInfo: { name: "MatrixPOS" } });
  return client;
}

type Cycle = "MONTHLY" | "YEARLY";

/** The price's lookup key includes the amount, so changing a price in plans.ts creates a new Stripe price automatically. */
const lookupKey = (plan: PlanId, cycle: Cycle) => {
  const p = planById(plan);
  return `matrixpos_${plan.toLowerCase()}_${cycle.toLowerCase()}_${cycle === "YEARLY" ? p.yearlyPence : p.monthlyPence}`;
};

/** Finds or creates the Stripe price for a plan and billing cycle. */
export async function priceFor(plan: PlanId, cycle: Cycle) {
  const s = stripe();
  const key = lookupKey(plan, cycle);
  const found = await s.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const p = planById(plan);
  const products = await s.products.search({ query: `metadata['matrixpos_plan']:'${plan}'` }).catch(() => ({ data: [] as Stripe.Product[] }));
  const product = products.data[0] ?? (await s.products.create({ name: `MatrixPOS ${p.name}`, description: p.tagline, metadata: { matrixpos_plan: plan } }));
  const price = await s.prices.create({
    product: product.id,
    currency: "gbp",
    unit_amount: cycle === "YEARLY" ? p.yearlyPence : p.monthlyPence,
    recurring: { interval: cycle === "YEARLY" ? "year" : "month" },
    tax_behavior: "exclusive",
    lookup_key: key,
    metadata: { matrixpos_plan: plan, matrixpos_cycle: cycle },
  });
  return price.id;
}

/** UK VAT at 20%, added on top. Uses STRIPE_VAT_RATE_ID if set, otherwise finds or creates one. */
export async function vatRate() {
  if (process.env.STRIPE_VAT_RATE_ID) return process.env.STRIPE_VAT_RATE_ID;
  const s = stripe();
  const rates = await s.taxRates.list({ active: true, limit: 100 });
  const hit = rates.data.find((r) => r.percentage === 20 && !r.inclusive && r.country === "GB" && r.display_name === "VAT");
  if (hit) return hit.id;
  const r = await s.taxRates.create({ display_name: "VAT", description: "UK VAT", percentage: 20, inclusive: false, country: "GB", jurisdiction: "GB", tax_type: "vat" });
  return r.id;
}

/** Reads plan and cycle from a subscription's price. */
function planFromSubscription(sub: Stripe.Subscription) {
  const price = sub.items.data[0]?.price;
  const plan = price?.metadata?.matrixpos_plan as PlanId | undefined;
  const cycle = (price?.metadata?.matrixpos_cycle as Cycle | undefined) ?? (price?.recurring?.interval === "year" ? "YEARLY" : "MONTHLY");
  return { plan: plan && PLANS.some((p) => p.id === plan) ? plan : undefined, cycle };
}

const STATUS: Record<Stripe.Subscription.Status, "ACTIVE" | "PAST_DUE" | "CANCELLED" | null> = {
  active: "ACTIVE", trialing: null, past_due: "PAST_DUE", unpaid: "PAST_DUE",
  canceled: "CANCELLED", incomplete_expired: "CANCELLED", incomplete: null, paused: "PAST_DUE",
};

/** Copies a Stripe subscription's state onto the business. Called from the webhook. */
export async function syncSubscription(sub: Stripe.Subscription, orgIdHint?: string) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const org = await db.organization.findFirst({
    where: { OR: [{ stripeSubscriptionId: sub.id }, { stripeCustomerId: customerId }, ...(orgIdHint ? [{ id: orgIdHint }] : []), ...(sub.metadata?.orgId ? [{ id: sub.metadata.orgId }] : [])] },
  });
  if (!org) return null;
  // Ignore events for an older subscription once the business has moved to a newer one.
  if (org.stripeSubscriptionId && org.stripeSubscriptionId !== sub.id && sub.status === "canceled") return org.id;
  const { plan, cycle } = planFromSubscription(sub);
  const status = STATUS[sub.status];
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired";
  await db.organization.update({
    where: { id: org.id },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: ended ? null : sub.id,
      ...(plan ? { plan } : {}),
      billingCycle: cycle,
      // A business that is closing its account stays cancelled, and one the platform owner suspended stays suspended.
      ...(status && !org.closureRequestedAt && org.billingStatus !== "SUSPENDED" ? { billingStatus: status } : {}),
      // Paid-until only moves forward once Stripe says the subscription is actually paid ("active"). An incomplete
      // checkout (card declined, 3-D Secure not finished) or an unpaid renewal doesn't extend it.
      ...(sub.status === "active" ? { paidUntil: new Date(sub.current_period_end * 1000) } : {}),
    },
  });
  if (plan && plan !== org.plan) await applyPlanToSettings(org.id, plan);
  return org.id;
}

/** When VAT isn't charged, removes any VAT rate left on an older card subscription so renewals don't add it. */
export async function removeVatFromSubscription(subscriptionId: string) {
  const s = stripe();
  const sub = await s.subscriptions.retrieve(subscriptionId);
  if (sub.status === "canceled") return;
  const items = sub.items.data.filter((i) => (i.tax_rates?.length ?? 0) > 0);
  if (!items.length && !(sub.default_tax_rates?.length ?? 0)) return;
  await s.subscriptions.update(sub.id, {
    default_tax_rates: "",
    items: items.map((i) => ({ id: i.id, tax_rates: "" })),
    proration_behavior: "none",
  });
}
