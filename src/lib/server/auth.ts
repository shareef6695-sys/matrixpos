import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
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

/** For back office pages and server actions. Redirects to login if not signed in or role too low. */
export async function requireAdmin(min: Role = "MANAGER"): Promise<AdminSession> {
  const s = await getAdmin();
  if (!s) redirect("/login");
  if (!atLeast(s.role, min)) redirect("/admin?denied=1");
  return s;
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
