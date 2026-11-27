import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { accessFor } from "@/lib/plans";
import {
  ADMIN_COOKIE, DEVICE_COOKIE, TILL_COOKIE, verify, atLeast,
  type AdminSession, type DeviceSession, type TillSession, type Role,
} from "@/lib/session";

export const hash = (s: string) => bcrypt.hash(s, 10);
export const compare = (s: string, h: string) => bcrypt.compare(s, h);

export const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export async function getAdmin() {
  return verify<AdminSession>((await cookies()).get(ADMIN_COOKIE)?.value, "admin");
}

/**
 * For back office pages and server actions. Redirects to login if not signed in or role too low,
 * and to the billing page if the shop's trial has ended or the account is suspended.
 */
export async function requireAdmin(min: Role = "MANAGER", opts: { allowLocked?: boolean } = {}): Promise<AdminSession> {
  const s = await getAdmin();
  if (!s) redirect("/login");
  if (!atLeast(s.role, min)) redirect("/admin?denied=1");
  if (!opts.allowLocked && !(await orgAllowed(s.orgId))) redirect("/admin/billing");
  return s;
}

/** True if the business may use MatrixPOS. The platform owner's own business is never locked. */
export async function orgAllowed(orgId: string) {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { billingStatus: true, trialEndsAt: true } });
  if (!org) return false;
  if (accessFor(org).allowed) return true;
  const platform = (process.env.PLATFORM_ADMIN_EMAILS ?? "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
  if (!platform.length) return false;
  const users = await db.user.findMany({ where: { organizationId: orgId, role: "OWNER", email: { not: null } }, select: { email: true } });
  return users.some((u) => platform.includes(u.email!.toLowerCase()));
}

export async function getDevice() {
  return verify<DeviceSession>((await cookies()).get(DEVICE_COOKIE)?.value, "device");
}

export async function getTillUser() {
  const device = await getDevice();
  const till = await verify<TillSession>((await cookies()).get(TILL_COOKIE)?.value, "till");
  if (!device || !till || till.registerId !== device.registerId || till.orgId !== device.orgId) return null;
  return { device, till };
}
