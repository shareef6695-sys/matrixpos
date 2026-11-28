import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { accessFor } from "@/lib/plans";
import {
  ADMIN_COOKIE, DEVICE_COOKIE, TILL_COOKIE, verify, atLeast,
  type AdminSession, type AdminToken, type DeviceSession, type TillSession, type Role,
} from "@/lib/session";

/**
 * Passwords and till PINs are only ever stored as bcrypt hashes. Passwords use cost 12. PINs use cost 10,
 * because the till checks a PIN against every staff member's hash in turn and has to stay quick.
 * Hashes made at the old cost still verify (bcrypt stores the cost inside the hash).
 */
export const hash = (password: string) => bcrypt.hash(password, 12);
export const hashPin = (pin: string) => bcrypt.hash(pin, 10);
export const compare = (s: string, h: string) => bcrypt.compare(s, h);

/** bcrypt only uses the first 72 bytes, so a longer password would be silently shortened. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (Buffer.byteLength(password, "utf8") > 72) return "Password must be at most 72 characters";
  return null;
}

export const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

/**
 * The signed-in back office user, or null. Checked against the database on every request, so a person who is
 * switched off, or whose password was changed or reset, is signed out at once, and role changes apply straight away.
 */
export const getAdmin = cache(async (): Promise<AdminSession | null> => {
  const s = await verify<AdminToken>((await cookies()).get(ADMIN_COOKIE)?.value, "admin");
  if (!s) return null;
  const u = await db.user.findUnique({ where: { id: s.userId }, select: { active: true, role: true, name: true, organizationId: true, sessionVersion: true } });
  if (!u || !u.active || u.organizationId !== s.orgId || (s.v ?? 0) !== u.sessionVersion) return null;
  if (u.role === "CASHIER" || u.role === "SUPERVISOR") return null;
  return { ...s, role: u.role, name: u.name };
});

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
  const users = await db.user.findMany({ where: { organizationId: orgId, role: "OWNER", email: { not: null }, emailVerifiedAt: { not: null } }, select: { email: true } });
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
