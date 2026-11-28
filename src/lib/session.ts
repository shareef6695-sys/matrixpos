// Edge-safe session helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";

export const ADMIN_COOKIE = "mpos_admin";
export const DEVICE_COOKIE = "mpos_device";
export const TILL_COOKIE = "mpos_till";
export const MFA_COOKIE = "mpos_mfa";

export type Role = "OWNER" | "MANAGER" | "SUPERVISOR" | "CASHIER";

/**
 * v is the user's sessionVersion when they signed in; bumping it signs them out everywhere.
 * Session cookies are signed, not encrypted, so they carry ids and the role only: no names or emails.
 * The person's name is read from the database on each request (see getAdmin).
 */
export interface AdminToken { kind: "admin"; userId: string; orgId: string; role: Role; v?: number }
export interface AdminSession extends AdminToken { name: string }
export interface DeviceSession { kind: "device"; orgId: string; storeId: string; registerId: string }
/** Password was right; waiting for the two-step code. */
export interface MfaSession { kind: "mfa"; userId: string; next: string }
export interface TillSession { kind: "till"; userId: string; orgId: string; registerId: string; role: Role }

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

export async function sign(payload: AdminToken | DeviceSession | TillSession | MfaSession, maxAgeSeconds: number) {
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
export const MFA_MAX_AGE = 60 * 5;

export const ROLE_RANK: Record<Role, number> = { CASHIER: 0, SUPERVISOR: 1, MANAGER: 2, OWNER: 3 };
export const atLeast = (role: Role, min: Role) => ROLE_RANK[role] >= ROLE_RANK[min];
