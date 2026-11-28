import "server-only";
import { randomBytes } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { db } from "./db";
import { signedInUser } from "./auth";
import { isPlatformAdmin } from "./billing";
import { audit } from "./till";
import { can, type HqPermission, type HqRoleName } from "@/lib/hq/roles";
import { isCurrency } from "@/lib/hq/money";

export interface HqSession { userId: string; orgId: string; name: string; role: HqRoleName; can: (p: HqPermission) => boolean }

/**
 * The signed-in HQ user, or null. The platform owner (a confirmed PLATFORM_ADMIN_EMAILS owner) is OWNER;
 * HQ staff need an active account, a confirmed email (set when they choose a password from their invite)
 * and an HqMember row. Read from the database on every request, so removing someone takes effect at once.
 */
export async function hqSession(): Promise<HqSession | null> {
  const u = await signedInUser();
  if (!u) return null;
  let role: HqRoleName | null = null;
  if (u.hqRole) role = u.emailVerified ? u.hqRole : null;
  else if (await isPlatformAdmin()) role = "OWNER";
  if (!role) return null;
  const r = role;
  return { userId: u.session.userId, orgId: u.session.orgId, name: u.session.name, role: r, can: (p) => can(r, p) };
}

/**
 * For every HQ page and server action. Anyone who isn't HQ gets a 404, so HQ can't be discovered;
 * HQ staff without the permission are sent back to the HQ home page.
 */
export async function requireHq(perm?: HqPermission): Promise<HqSession> {
  const u = await signedInUser();
  if (!u) redirect("/login?next=/platform/home");
  const h = await hqSession();
  if (!h) notFound();
  if (perm && !h.can(perm)) redirect("/platform/home?denied=1");
  return h;
}

export const hqAudit = (h: HqSession, action: string, detail?: Record<string, string | number | boolean | null>) =>
  audit(h.orgId, h.userId, `hq.${action}`, detail ?? undefined);

// Letters and digits that can't be mixed up when read out or typed (no 0/O, 1/I/L).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const code = () => Array.from(randomBytes(5), (b) => ALPHABET[b % ALPHABET.length]).join("");
const year = (at: Date) => at.toLocaleDateString("en-GB", { year: "numeric", timeZone: "Europe/London" });

/** MPI-2026-K7Q3M. Shared with MatrixPOS's subscription invoices, so every Matrix Infotech invoice number is unique. */
export async function nextInvoiceNumber(at = new Date()) {
  for (;;) {
    const number = `MPI-${year(at)}-${code()}`;
    const [a, b] = await Promise.all([db.subscriptionInvoice.findUnique({ where: { number } }), db.hqInvoice.findUnique({ where: { number } })]);
    if (!a && !b) return number;
  }
}

export async function nextQuoteNumber(at = new Date()) {
  for (;;) {
    const number = `MPQ-${year(at)}-${code()}`;
    if (!(await db.hqQuote.findUnique({ where: { number } }))) return number;
  }
}

/** The secret in a client's view link. 32 random bytes, so it can't be guessed. */
export const publicToken = () => randomBytes(32).toString("base64url");

/** The latest rate on or before the date: how many units of the currency one pound buys. */
export async function rateFor(currency: string, at = new Date()): Promise<number | null> {
  if (currency === "GBP") return 1;
  const r = await db.hqFxRate.findFirst({ where: { currency, date: { lte: at } }, orderBy: { date: "desc" } })
    ?? await db.hqFxRate.findFirst({ where: { currency }, orderBy: { date: "asc" } });
  return r ? Number(r.perGbp) : null;
}

/** Latest rate per currency, for pages that convert many amounts to GBP. */
export async function latestRates(): Promise<Record<string, number>> {
  const rows = await db.hqFxRate.findMany({ orderBy: { date: "desc" } });
  const out: Record<string, number> = { GBP: 1 };
  for (const r of rows) if (!(r.currency in out)) out[r.currency] = Number(r.perGbp);
  return out;
}

/** Picks the rate for a document: the one typed on the form if valid, otherwise the stored rate. */
export async function documentRate(currency: string, typed: string, at: Date): Promise<number | string> {
  if (!isCurrency(currency)) return "Choose a currency";
  if (currency === "GBP") return 1;
  const t = Number(String(typed).replace(/,/g, ""));
  if (typed && Number.isFinite(t) && t > 0 && t < 1e9) return t;
  const stored = await rateFor(currency, at);
  return stored ?? `Add an exchange rate for ${currency} under Currencies first, or type one on the form`;
}
