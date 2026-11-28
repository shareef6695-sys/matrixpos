import "server-only";
import { notFound, redirect } from "next/navigation";
import { db } from "./db";
import { getAdmin, signedInUser } from "./auth";
import { accessFor, planById, PLAN_FEATURES, type PlanFeature } from "@/lib/plans";

export async function orgAccess(orgId: string) {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { plan: true, billingStatus: true, trialEndsAt: true } });
  if (!org) return null;
  return { org, plan: planById(org.plan), access: accessFor(org) };
}

/** Returns an error message if adding one more of `kind` would go over the shop's plan, otherwise null. */
export async function overLimit(orgId: string, kind: "store" | "register" | "staff") {
  const a = await orgAccess(orgId);
  if (!a) return "Business not found";
  const p = a.plan;
  if (kind === "store" && p.maxStores != null) {
    const n = await db.store.count({ where: { organizationId: orgId } });
    if (n >= p.maxStores) return `The ${p.name} plan includes ${p.maxStores} shop${p.maxStores === 1 ? "" : "s"}. Upgrade your plan to add more.`;
  }
  if (kind === "register" && p.maxRegisters != null) {
    const n = await db.register.count({ where: { store: { organizationId: orgId } } });
    if (n >= p.maxRegisters) return `The ${p.name} plan includes ${p.maxRegisters} tills. Upgrade your plan to add more.`;
  }
  if (kind === "staff" && p.maxStaff != null) {
    const n = await db.user.count({ where: { organizationId: orgId, active: true, hqMember: null } });
    if (n >= p.maxStaff) return `The ${p.name} plan includes ${p.maxStaff} staff. Upgrade your plan to add more.`;
  }
  return null;
}

/** Switches off any plan-only feature the plan doesn't include. */
export function clampFeatures<T extends Partial<Record<PlanFeature, boolean>>>(plan: string, data: T): T {
  const p = planById(plan);
  const out = { ...data };
  for (const f of PLAN_FEATURES) if (!p.features.includes(f) && f in out) out[f] = false as T[PlanFeature];
  return out;
}

export async function applyPlanToSettings(orgId: string, plan: string) {
  const off = Object.fromEntries(PLAN_FEATURES.filter((f) => !planById(plan).features.includes(f)).map((f) => [f, false]));
  if (Object.keys(off).length) await db.orgSettings.updateMany({ where: { organizationId: orgId }, data: off });
}

// ---------- Platform owner ----------

export function platformEmails() {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export async function isPlatformAdmin() {
  const s = await getAdmin();
  if (!s) return false;
  const emails = platformEmails();
  if (!emails.length) return false;
  const u = await db.user.findUnique({ where: { id: s.userId }, select: { email: true, active: true, role: true, emailVerifiedAt: true } });
  // The email must be confirmed, so nobody can claim HQ access by signing up with your address first.
  return !!u?.email && !!u.emailVerifiedAt && u.active && u.role === "OWNER" && emails.includes(u.email.toLowerCase());
}

/** The platform pages answer 404 to everyone else, so they can't be discovered. */
export async function requirePlatformAdmin() {
  const s = await getAdmin();
  // HQ staff are signed in but aren't a shop user: they get the same 404 as everyone else.
  if (!s) {
    if (await signedInUser()) notFound();
    redirect("/login?next=/platform");
  }
  if (!(await isPlatformAdmin())) notFound();
  return s;
}
