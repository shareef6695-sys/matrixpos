// Edge-safe session helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";

export const ADMIN_COOKIE = "mpos_admin";
export const DEVICE_COOKIE = "mpos_device";
export const TILL_COOKIE = "mpos_till";

export type Role = "OWNER" | "MANAGER" | "SUPERVISOR" | "CASHIER";

export interface AdminSession { kind: "admin"; userId: string; orgId: string; role: Role; name: string }
export interface DeviceSession { kind: "device"; orgId: string; storeId: string; registerId: string }
export interface TillSession { kind: "till"; userId: string; orgId: string; registerId: string; role: Role; name: string }

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

export async function sign(payload: AdminSession | DeviceSession | TillSession, maxAgeSeconds: number) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAgeSeconds)
    .sign(key());
}

export async function verify<T extends { kind: string }>(token: string | undefined, kind: T["kind"]): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.kind === kind ? (payload as unknown as T) : null;
  } catch {
    return null;
  }
}

export const ADMIN_MAX_AGE = 60 * 60 * 12;
export const DEVICE_MAX_AGE = 60 * 60 * 24 * 365;
export const TILL_MAX_AGE = 60 * 60 * 14;

export const ROLE_RANK: Record<Role, number> = { CASHIER: 0, SUPERVISOR: 1, MANAGER: 2, OWNER: 3 };
export const atLeast = (role: Role, min: Role) => ROLE_RANK[role] >= ROLE_RANK[min];
