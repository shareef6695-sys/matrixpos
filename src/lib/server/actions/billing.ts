"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { audit } from "@/lib/server/till";
import { applyPlanToSettings, requirePlatformAdmin } from "@/lib/server/billing";
import { PLANS, planById } from "@/lib/plans";
import type { FormState } from "./auth";

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
