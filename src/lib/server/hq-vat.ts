import "server-only";
import { db } from "./db";
import { hqBalances } from "./hq-books";
import { seller } from "@/lib/legal";
import { londonDate, londonDayStart, addDays, fmtDate } from "@/lib/dates";
import { financialYear, vatQuarters, yearEndDeadlines, type Balance } from "@/lib/hq/books";
import { returnBody } from "@/lib/hq/hmrc";
import { openSecret, sealSecret } from "./secret-box";

/** Journals that aren't trading: they move balances about at a return or a year end, so reports and VAT leave them out. */
export const NOT_TRADING = ["YEAR_END", "VAT_RETURN"];

export async function hqSettings() {
  return (await db.hqSettings.findUnique({ where: { id: "hq" } })) ?? null;
}

/**
 * Whether a document dated `at` carries VAT. The CHARGE_VAT and INVOICE_VAT_NUMBER settings switch VAT on for
 * everything (MatrixPOS billing included); the registration date saved in HQ keeps earlier documents VAT free.
 */
export async function chargesVatOn(at: Date) {
  if (!seller().chargeVat) return false;
  const from = (await hqSettings())?.vatRegisteredFrom;
  return !from || at >= from;
}

/** Taxable turnover in the 12 months to the end of today, against the registration threshold. */
export async function rollingTurnover(today = londonDate()) {
  const lt = londonDayStart(addDays(today, 1));
  const gte = londonDayStart(addDays(today, -365));
  const b = await hqBalances({ gte, lt }, { exclude: NOT_TRADING });
  // Bank interest is exempt, so it doesn't count towards the threshold.
  return b.filter((a) => a.type === "INCOME" && a.code !== "4910").reduce((n, a) => n + a.balance, 0);
}

/** The company's year (from HQ settings, otherwise the calendar year) that a date falls in. */
export async function companyYear(date = londonDate()) {
  const s = await hqSettings();
  return financialYear(date, s?.yearEndMonth ?? 12, s?.yearEndDay ?? 31);
}

/** Income and costs for a period, as the reports show them (year-end and VAT return journals left out). */
export const tradingBalances = (range: { gte?: Date; lt?: Date }): Promise<Balance[]> => hqBalances(range, { exclude: NOT_TRADING });

/** What's coming up: VAT returns not yet filed, and the deadlines from the last year end. */
export async function taxDeadlines(today = londonDate()) {
  const s = await hqSettings();
  const out: { what: string; due: string; href: string }[] = [];
  if (s?.vatRegisteredFrom && s.vatStaggerMonth) {
    const filed = await db.hqVatReturn.findMany({ where: { status: "FILED" }, select: { periodStart: true, periodEnd: true } });
    const done = new Set(filed.map((r) => `${londonDate(r.periodStart)}|${londonDate(r.periodEnd)}`));
    for (const q of vatQuarters(londonDate(s.vatRegisteredFrom), s.vatStaggerMonth as 1 | 2 | 3, today)) {
      if (q.end < today && !done.has(`${q.start}|${q.end}`)) out.push({ what: `VAT return for ${fmtDate(q.start)} to ${fmtDate(q.end)}`, due: q.due, href: "/platform/accounts/vat" });
    }
  }
  const year = financialYear(addDays(today, -1), s?.yearEndMonth ?? 12, s?.yearEndDay ?? 31);
  // The most recent year that has ended.
  const last = year.end < today ? year : financialYear(addDays(year.start, -1), s?.yearEndMonth ?? 12, s?.yearEndDay ?? 31);
  const d = yearEndDeadlines(last.end);
  const traded = await db.hqJournal.count({ where: { date: { gte: londonDayStart(last.start), lt: londonDayStart(addDays(last.end, 1)) } } });
  // Once the year is closed, deadlines that have passed are taken as done.
  const closed = !!(await db.hqYearEnd.findUnique({ where: { yearEnd: londonDayStart(last.end) } }));
  if (traded) out.push(...[
    { what: `Corporation Tax to pay for the year to ${fmtDate(last.end)}`, due: d.ctPayment, href: "/platform/accounts/year-end" },
    { what: `Accounts to Companies House for the year to ${fmtDate(last.end)}`, due: d.accounts, href: "/platform/accounts/year-end" },
    { what: `Company Tax Return (CT600) for the year to ${fmtDate(last.end)}`, due: d.ct600, href: "/platform/accounts/year-end" },
  ].filter((x) => !closed || x.due >= today));
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

// ---------------- Making Tax Digital (HMRC) ----------------

export const hmrcConfigured = () => !!(process.env.HMRC_CLIENT_ID?.trim() && process.env.HMRC_CLIENT_SECRET?.trim());
export const hmrcSandbox = () => process.env.HMRC_ENV?.trim() !== "production";
export const hmrcApi = () => (hmrcSandbox() ? "https://test-api.service.hmrc.gov.uk" : "https://api.service.hmrc.gov.uk");
const ACCEPT = "application/vnd.hmrc.1.0+json";

export class HmrcError extends Error {}

async function token(body: Record<string, string>) {
  const r = await fetch(`${hmrcApi()}/oauth/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.HMRC_CLIENT_ID!.trim(), client_secret: process.env.HMRC_CLIENT_SECRET!.trim(), ...body }),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!r.ok || !j.access_token) throw new HmrcError(`HMRC refused the sign-in: ${j.error_description ?? r.status}`);
  return { access: j.access_token, refresh: j.refresh_token ?? null, expires: new Date(Date.now() + (j.expires_in ?? 14_400) * 1000) };
}

export const hmrcRedirectUri = (base: string) => `${base}/api/hmrc/callback`;

export function hmrcAuthorizeUrl(base: string, state: string) {
  const q = new URLSearchParams({ response_type: "code", client_id: process.env.HMRC_CLIENT_ID!.trim(), scope: "read:vat write:vat", state, redirect_uri: hmrcRedirectUri(base) });
  return `${hmrcApi()}/oauth/authorize?${q}`;
}

export async function hmrcExchange(code: string, base: string) {
  const t = await token({ grant_type: "authorization_code", code, redirect_uri: hmrcRedirectUri(base) });
  await db.hqSettings.update({ where: { id: "hq" }, data: { hmrcAccessToken: sealSecret(t.access), hmrcRefreshToken: sealSecret(t.refresh), hmrcTokenExpires: t.expires, hmrcConnectedAt: new Date(), hmrcOauthState: null } });
}

/** A current access token, refreshed if it has expired. Null when HMRC isn't connected. */
async function accessToken() {
  const s = await hqSettings();
  if (!s?.hmrcAccessToken || !hmrcConfigured()) return null;
  if (s.hmrcTokenExpires && s.hmrcTokenExpires.getTime() > Date.now() + 60_000) return openSecret(s.hmrcAccessToken);
  const refresh = openSecret(s.hmrcRefreshToken);
  if (!refresh) return null;
  try {
    const t = await token({ grant_type: "refresh_token", refresh_token: refresh });
    await db.hqSettings.update({ where: { id: "hq" }, data: { hmrcAccessToken: sealSecret(t.access), hmrcRefreshToken: sealSecret(t.refresh ?? refresh), hmrcTokenExpires: t.expires } });
    return t.access;
  } catch {
    // The refresh token has lapsed (they last 18 months) or was revoked: sign in again.
    await db.hqSettings.update({ where: { id: "hq" }, data: { hmrcAccessToken: null, hmrcRefreshToken: null, hmrcTokenExpires: null } });
    return null;
  }
}

async function hmrcCall(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const t = await accessToken();
  if (!t) throw new HmrcError("Connect to HMRC first");
  const r = await fetch(`${hmrcApi()}${path}`, {
    method: init.method ?? "GET",
    headers: { accept: ACCEPT, authorization: `Bearer ${t}`, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const errs = Array.isArray(j.errors) ? (j.errors as { message?: string }[]).map((e) => e.message).join("; ") : "";
    throw new HmrcError(`HMRC said: ${(j.message as string) ?? r.status}${errs ? ` (${errs})` : ""}`);
  }
  return { json: j, headers: r.headers };
}

export interface Obligation { periodKey: string; start: string; end: string; due: string; status: "O" | "F"; received?: string }

/** The returns HMRC expects, open and fulfilled, over the last year and the next few months. */
export async function hmrcObligations(vrn: string, headers: Record<string, string>, today = londonDate()) {
  const q = new URLSearchParams({ from: addDays(today, -360), to: addDays(today, 3) });
  const { json } = await hmrcCall(`/organisations/vat/${encodeURIComponent(vrn)}/obligations?${q}`, { headers });
  return ((json.obligations as Obligation[]) ?? []).sort((a, b) => a.start.localeCompare(b.start));
}

export async function hmrcSubmit(vrn: string, body: ReturnType<typeof returnBody>, headers: Record<string, string>) {
  const { json, headers: h } = await hmrcCall(`/organisations/vat/${encodeURIComponent(vrn)}/returns`, { method: "POST", body, headers });
  return { ...json, receiptId: h.get("receipt-id"), correlationId: h.get("x-correlationid"), receiptTimestamp: h.get("receipt-timestamp") };
}

export const hmrcConnected = async () => !!(hmrcConfigured() && (await hqSettings())?.hmrcRefreshToken);
