"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { audit } from "@/lib/server/till";
import { applyPlanToSettings, requirePlatformAdmin } from "@/lib/server/billing";
import { PLANS, planById } from "@/lib/plans";
import type { FormState } from "./auth";
import { redirect } from "next/navigation";
import { appUrl } from "@/lib/server/email";
import { priceFor, stripe, stripeBillingEnabled, syncSubscription, vatRate } from "@/lib/server/stripe-billing";

const PLAN_IDS = PLANS.map((p) => p.id) as string[];

/** A shop owner asks to start paying for, or switch to, a plan. It appears on the platform owner's dashboard. */
export async function requestPlan(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireAdmin("OWNER", { allowLocked: true });
  const plan = String(f.get("plan") ?? "");
  const cycle = f.get("cycle") === "YEARLY" ? "YEARLY" : "MONTHLY";
  if (!PLAN_IDS.includes(plan)) return { error: "Choose a plan" };
  await audit(s.orgId, s.userId, "billing.request", { plan, cycle, by: s.name });
  revalidatePath("/admin/billing");
  return { ok: `Thanks. We'll email you an invoice for ${planById(plan).name} (${cycle.toLowerCase()}) and switch your plan.` };
}

// ---------------- Platform owner ----------------

const STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"] as const;

function dateOrNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}T23:59:59Z`);
  return isNaN(d.getTime()) ? null : d;
}

export async function platformUpdateShop(_: FormState, f: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const id = String(f.get("id") ?? "");
  const org = await db.organization.findUnique({ where: { id } });
  if (!org) return { error: "Shop not found" };
  const plan = String(f.get("plan") ?? org.plan);
  const status = String(f.get("billingStatus") ?? org.billingStatus);
  if (!PLAN_IDS.includes(plan) || !(STATUSES as readonly string[]).includes(status)) return { error: "Invalid plan or status" };
  const data = {
    plan: plan as (typeof PLANS)[number]["id"],
    billingStatus: status as (typeof STATUSES)[number],
    billingCycle: f.get("billingCycle") === "YEARLY" ? ("YEARLY" as const) : ("MONTHLY" as const),
    trialEndsAt: dateOrNull(f.get("trialEndsAt")),
    paidUntil: dateOrNull(f.get("paidUntil")),
    billingNote: String(f.get("billingNote") ?? "").trim().slice(0, 1000) || null,
  };
  await db.organization.update({ where: { id }, data });
  if (data.plan !== org.plan) await applyPlanToSettings(id, data.plan);
  await audit(id, null, "platform.update", { by: admin.name, plan: data.plan, status: data.billingStatus, cycle: data.billingCycle });
  revalidatePath("/platform");
  revalidatePath(`/platform/${id}`);
  return { ok: "Saved" };
}

/** Quick actions from the shop page: extend trial, mark paid for a period, suspend, reactivate. */
export async function platformQuick(f: FormData) {
  const admin = await requirePlatformAdmin();
  const id = String(f.get("id") ?? "");
  const op = String(f.get("op") ?? "");
  const org = await db.organization.findUnique({ where: { id } });
  if (!org) return;
  const now = Date.now();
  const day = 86_400_000;
  if (op === "extend7" || op === "extend14") {
    const base = Math.max(now, org.trialEndsAt?.getTime() ?? now);
    await db.organization.update({ where: { id }, data: { billingStatus: "TRIAL", trialEndsAt: new Date(base + (op === "extend7" ? 7 : 14) * day) } });
  } else if (op === "paid") {
    const months = org.billingCycle === "YEARLY" ? 12 : 1;
    const base = new Date(Math.max(now, org.paidUntil?.getTime() ?? now));
    base.setUTCMonth(base.getUTCMonth() + months);
    await db.organization.update({ where: { id }, data: { billingStatus: "ACTIVE", paidUntil: base } });
  } else if (op === "suspend") {
    await db.organization.update({ where: { id }, data: { billingStatus: "SUSPENDED" } });
  } else if (op === "reactivate") {
    const inTrial = !org.paidUntil && !!org.trialEndsAt && org.trialEndsAt.getTime() > now;
    await db.organization.update({ where: { id }, data: { billingStatus: inTrial ? "TRIAL" : "ACTIVE" } });
  } else return;
  await audit(id, null, `platform.${op}`, { by: admin.name });
  revalidatePath("/platform");
  revalidatePath(`/platform/${id}`);
}

// ---------------- Card payments (Stripe Billing) ----------------

/** Starts paying by card: a new subscription through Stripe Checkout, or a plan change on the existing one. */
export async function payByCard(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireAdmin("OWNER", { allowLocked: true });
  if (!stripeBillingEnabled()) return { error: "Card payments aren't set up yet. Choose \"Request an invoice\" instead." };
  const plan = String(f.get("plan") ?? "") as (typeof PLANS)[number]["id"];
  const cycle = f.get("cycle") === "YEARLY" ? "YEARLY" : "MONTHLY";
  if (!PLAN_IDS.includes(plan)) return { error: "Choose a plan" };
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.orgId } });
  if (org.slug === "demo-mart") return { error: "The demo shop can't buy a plan. Create your own shop to try it." };
  if (org.closureRequestedAt) return { error: "Keep your account first, then choose a plan." };
  let url: string;
  try {
    const st = stripe();
    const price = await priceFor(plan, cycle);

    // Already paying by card: switch the subscription to the new plan, with a pro-rata adjustment on the next invoice.
    // Ids saved while using test keys don't exist with live keys (and the other way round): forget them and start fresh.
    const missing = (e: unknown) => (e as { code?: string })?.code === "resource_missing";
    if (org.stripeSubscriptionId) {
      const sub = await st.subscriptions.retrieve(org.stripeSubscriptionId).catch((e) => { if (missing(e)) return null; throw e; });
      if (!sub) {
        org.stripeSubscriptionId = null;
        await db.organization.update({ where: { id: org.id }, data: { stripeSubscriptionId: null } });
      } else if (sub.status !== "canceled") {
        await st.subscriptions.update(sub.id, { items: [{ id: sub.items.data[0].id, price }], proration_behavior: "create_prorations", cancel_at_period_end: false });
        await syncSubscription(await st.subscriptions.retrieve(sub.id));
        await audit(s.orgId, s.userId, "billing.card.change", { plan, cycle });
        revalidatePath("/admin", "layout");
        return { ok: `Done. You're now on ${planById(plan).name} (${cycle.toLowerCase()}). The difference is adjusted on your next card payment.` };
      }
    }

    const user = await db.user.findUniqueOrThrow({ where: { id: s.userId } });
    let customer = org.stripeCustomerId;
    if (customer) {
      const c = await st.customers.retrieve(customer).catch((e) => { if (missing(e)) return null; throw e; });
      if (!c || ("deleted" in c && c.deleted)) customer = null;
    }
    if (!customer) {
      const c = await st.customers.create({ name: org.name, email: user.email ?? undefined, metadata: { orgId: org.id } });
      customer = c.id;
      await db.organization.update({ where: { id: org.id }, data: { stripeCustomerId: customer } });
    }
    const base = await appUrl();
    const session = await st.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: org.id,
      line_items: [{ price, quantity: 1, tax_rates: [await vatRate()] }],
      subscription_data: { metadata: { orgId: org.id } },
      metadata: { orgId: org.id, plan, cycle },
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${base}/admin/billing?card=success`,
      cancel_url: `${base}/admin/billing?card=cancelled`,
    });
    url = session.url!;
  } catch (e) {
    console.error("Stripe checkout failed", e);
    return { error: `Card payment couldn't start: ${e instanceof Error ? e.message : "unknown error"}. Please try again, or request an invoice.` };
  }
  redirect(url);
}

/** Stripe's own page where the owner updates their card, downloads invoices or cancels. */
export async function openCardPortal() {
  const s = await requireAdmin("OWNER", { allowLocked: true });
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.orgId } });
  if (!stripeBillingEnabled() || !org.stripeCustomerId) redirect("/admin/billing");
  let url = "/admin/billing?card=portal-error";
  try {
    const portal = await stripe().billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: `${await appUrl()}/admin/billing` });
    url = portal.url;
  } catch (e) {
    console.error("Stripe portal failed", e);
  }
  redirect(url);
}
