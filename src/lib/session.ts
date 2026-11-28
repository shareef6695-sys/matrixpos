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
export interface AdminToken { kind: "admin"; userId: string; orgId: string; role: Role; v?: number; jti?: string; exp?: number }
export interface AdminSession extends AdminToken { name: string }
export interface DeviceSession { kind: "device"; orgId: string; storeId: string; registerId: string }
/** Password was right; waiting for the two-step code. */
export interface MfaSession { kind: "mfa"; userId: string; next: string }
export interface TillSession { kind: "till"; userId: string; orgId: string; registerId: string; role: Role; jti?: string; exp?: number }
/**
 * Given to the till with the cashier's session and sent back with each sale it rings up, so the server knows who
 * really made the sale (sales sync with only the device link, after the cashier may have signed out).
 */
export interface CashierProof { kind: "cashier"; userId: string; orgId: string; registerId: string; role: Role }
/** A supervisor or manager approved this action (discount, refund) on this one sale at this till. */
export interface ApprovalProof { kind: "approval"; orgId: string; registerId: string; saleId: string; action: string; approverId: string; approverRole: Role }

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

type Payload = AdminToken | DeviceSession | TillSession | MfaSession | CashierProof | ApprovalProof;

/** Every token gets a random id (jti), so one session can be revoked on sign-out without signing the person out everywhere. */
export async function sign(payload: Payload, maxAgeSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setJti(crypto.randomUUID())
    .setExpirationTime(now + maxAgeSeconds)
    .sign(key());
}

/**
 * Checks the signature, expiry and kind. `at` checks validity at another moment instead of now: a sale made
 * offline is checked against the time it was rung up, so its proofs must have been valid then.
 */
export async function verify<T extends { kind: string }>(token: string | undefined, kind: T["kind"], at?: Date): Promise<T | null> {
  if (!token) return null;
  try {
    // A till's clock can be a little out from the server's, so allow 10 minutes either side when checking at sale time.
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"], ...(at ? { currentDate: at, clockTolerance: 600 } : {}) });
    return payload.kind === kind ? (payload as unknown as T) : null;
  } catch {
    return null;
  }
}

export const ADMIN_MAX_AGE = 60 * 60 * 12;
export const DEVICE_MAX_AGE = 60 * 60 * 24 * 365;
export const TILL_MAX_AGE = 60 * 60 * 14;
export const MFA_MAX_AGE = 60 * 5;
export const APPROVAL_MAX_AGE = 60 * 60 * 2;

export const ROLE_RANK: Record<Role, number> = { CASHIER: 0, SUPERVISOR: 1, MANAGER: 2, OWNER: 3 };
export const atLeast = (role: Role, min: Role) => ROLE_RANK[role] >= ROLE_RANK[min];
