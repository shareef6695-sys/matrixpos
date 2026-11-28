"use server";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cookieOpts } from "@/lib/server/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq, hqAudit } from "@/lib/server/hq";
import { HqLockedError, lockDate, postHq, unpostHq } from "@/lib/server/hq-books";
import { HmrcError, hmrcConnected, hmrcObligations, hmrcSubmit, hqSettings, tradingBalances, type Obligation } from "@/lib/server/hq-vat";
import { closingJournal, corporationTax, corporationTaxJournal, financialYear, profitAndLoss, vatBoxes, vatReturnJournal } from "@/lib/hq/books";
import { fraudHeaders, parseClientInfo, returnBody } from "@/lib/hq/hmrc";
import { addDays, londonDate, londonDayStart } from "@/lib/dates";
import type { FormState } from "./auth";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const ymdOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const VAT = "/platform/accounts/vat";
const YEAR = "/platform/accounts/year-end";
const back = (path: string, msg?: string): never => redirect(msg ? `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}` : path);
const range = (start: string, end: string) => ({ gte: londonDayStart(start), lt: londonDayStart(addDays(end, 1)) });

// ---------------- Settings ----------------

export async function saveVatSettings(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("accounts.edit");
  const from = str(f, "vatRegisteredFrom");
  if (from && !ymdOk(from)) return { error: "Choose the date your VAT registration starts" };
  const stagger = Number(str(f, "vatStaggerMonth"));
  if (from && ![1, 2, 3].includes(stagger)) return { error: "Choose when your VAT quarters end (it's on your VAT registration certificate)" };
  const vrn = str(f, "hmrcVrn").replace(/\s|^GB/gi, "");
  if (vrn && !/^\d{9}$/.test(vrn)) return { error: "The VAT number is 9 digits (with or without GB in front)" };
  const data = { vatRegisteredFrom: from ? londonDayStart(from) : null, vatStaggerMonth: from ? stagger : null, hmrcVrn: vrn || null };
  await db.hqSettings.upsert({ where: { id: "hq" }, create: { id: "hq", ...data }, update: data });
  await hqAudit(h, "vat.settings", { from: from || null, stagger: data.vatStaggerMonth, vrn: !!vrn });
  revalidatePath(VAT);
  return { ok: "Saved" };
}

export async function saveYearEnd(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("accounts.edit");
  const month = Number(str(f, "yearEndMonth")), day = Number(str(f, "yearEndDay"));
  if (!(month >= 1 && month <= 12)) return { error: "Choose the month your company year ends" };
  const last = new Date(Date.UTC(2023, month, 0)).getUTCDate(); // not a leap year, so 28 for February
  if (!(day >= 1 && day <= last)) return { error: `Choose a day from 1 to ${last}` };
  await db.hqSettings.upsert({ where: { id: "hq" }, create: { id: "hq", yearEndMonth: month, yearEndDay: day }, update: { yearEndMonth: month, yearEndDay: day } });
  await hqAudit(h, "yearend.settings", { month, day });
  revalidatePath(YEAR);
  return { ok: "Saved" };
}

// ---------------- VAT returns ----------------

async function boxesFor(start: string, end: string) {
  return vatBoxes(await tradingBalances(range(start, end)));
}

/** Works out (or works out again) a draft return for a period from the books. */
export async function prepareVatReturn(f: FormData) {
  const h = await requireHq("accounts.edit");
  const start = str(f, "start"), end = str(f, "end"), due = str(f, "due");
  const periodKey = str(f, "periodKey", 10) || null;
  if (!ymdOk(start) || !ymdOk(end) || !ymdOk(due) || end < start) back(VAT, "That period isn't right");
  const existing = await db.hqVatReturn.findUnique({ where: { periodStart_periodEnd: { periodStart: londonDayStart(start), periodEnd: londonDayStart(end) } } });
  if (existing?.status === "FILED") redirect(`${VAT}/${existing.id}`);
  const b = await boxesFor(start, end);
  const data = { ...b, dueDate: londonDayStart(due), ...(periodKey ? { periodKey } : {}) };
  const r = existing
    ? await db.hqVatReturn.update({ where: { id: existing.id }, data })
    : await db.hqVatReturn.create({ data: { periodStart: londonDayStart(start), periodEnd: londonDayStart(end), ...data } });
  await hqAudit(h, "vat.prepare", { start, end });
  redirect(`${VAT}/${r.id}`);
}

export async function deleteVatReturn(f: FormData) {
  const h = await requireHq("accounts.edit");
  const r = await db.hqVatReturn.findUnique({ where: { id: str(f, "id", 40) } });
  if (r && r.status === "DRAFT") {
    await db.hqVatReturn.delete({ where: { id: r.id } });
    await hqAudit(h, "vat.delete", { id: r.id });
  }
  redirect(VAT);
}

/**
 * Files a return: sends it to HMRC (when connected and asked), then moves its VAT into "VAT owed to HMRC" and
 * locks the books to the end of the period, so the figures can't change under it. The figures are worked out
 * again first; if anything moved since they were checked, nothing is filed.
 */
export async function fileVatReturn(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("accounts.edit");
  const r = await db.hqVatReturn.findUnique({ where: { id: str(f, "id", 40) } });
  if (!r) return { error: "That return wasn't found" };
  if (r.status === "FILED") return { error: "This return has already been filed" };
  const start = londonDate(r.periodStart), end = londonDate(r.periodEnd);
  if (end >= londonDate()) return { error: "The period hasn't ended yet" };
  if (f.get("confirm") !== "on") return { error: "Tick the declaration to confirm the figures" };
  const b = await boxesFor(start, end);
  const keys = ["box1", "box2", "box3", "box4", "box5", "box6", "box7", "box8", "box9"] as const;
  if (keys.some((k) => b[k] !== r[k])) {
    await db.hqVatReturn.update({ where: { id: r.id }, data: b });
    revalidatePath(`${VAT}/${r.id}`);
    return { error: "Something in the books for this period has changed since the figures were worked out. They've been updated: check them again before filing." };
  }
  const lock = await lockDate();
  if (lock && lock >= r.periodEnd) return { error: "The books are locked past the end of this period, so its VAT can't be moved. Unlock under Books → Lock date first." };

  const toHmrc = f.get("mode") === "hmrc";
  let receipt: Record<string, unknown> | null = null;
  if (toHmrc) {
    const s = await hqSettings();
    if (!(await hmrcConnected()) || !s?.hmrcVrn) return { error: "Connect to HMRC (and save your VAT number) first" };
    if (!r.periodKey) return { error: "Choose this period from HMRC's list first, so HMRC knows which return it is" };
    const hd = await clientHeaders(String(f.get("client") ?? ""), h.userId);
    if (!hd) return { error: "Your browser didn't send the details HMRC needs. Reload the page and try again." };
    try {
      receipt = await hmrcSubmit(s.hmrcVrn, returnBody(r.periodKey, b), hd);
    } catch (e) {
      if (e instanceof HmrcError) return { error: e.message };
      throw e;
    }
  }
  try {
    await db.$transaction(async (tx) => {
      await postHq(tx, { date: r.periodEnd, source: "VAT_RETURN", sourceId: r.id, reference: r.periodKey ?? `VAT ${end}`, memo: `VAT return ${start} to ${end}`, userId: h.userId, lines: vatReturnJournal(b.box1, b.box4) });
      await tx.hqVatReturn.update({ where: { id: r.id }, data: { status: "FILED", filedAt: new Date(), filedById: h.userId, submittedToHmrc: toHmrc, ...(receipt ? { hmrcReceipt: receipt as object } : {}) } });
      const current = (await tx.hqSettings.findUnique({ where: { id: "hq" } }))?.lockDate;
      if (!current || current < r.periodEnd) await tx.hqSettings.upsert({ where: { id: "hq" }, create: { id: "hq", lockDate: r.periodEnd }, update: { lockDate: r.periodEnd } });
    });
  } catch (e) {
    // HMRC already has it, so record it as filed even if the books couldn't be moved.
    if (receipt) await db.hqVatReturn.update({ where: { id: r.id }, data: { status: "FILED", filedAt: new Date(), filedById: h.userId, submittedToHmrc: true, hmrcReceipt: receipt as object } });
    if (e instanceof HqLockedError) return { error: `${receipt ? "HMRC has the return, but " : ""}${e.message}` };
    throw e;
  }
  await hqAudit(h, "vat.file", { id: r.id, hmrc: toHmrc, box5: b.box5 });
  revalidatePath(`${VAT}/${r.id}`);
  return { ok: toHmrc ? "Sent to HMRC and filed" : "Marked as filed" };
}

const DEVICE_COOKIE = "hq_hmrc_device";

async function clientHeaders(raw: string, userId: string) {
  const client = parseClientInfo(raw);
  if (!client) return null;
  const hd = await headers();
  const ip = hd.get("x-forwarded-for")?.split(",")[0]?.trim() || hd.get("x-real-ip") || null;
  // HMRC wants an ID that stays the same for this device, kept in an httpOnly cookie.
  const jar = await cookies();
  let deviceId = jar.get(DEVICE_COOKIE)?.value ?? "";
  if (!/^[0-9a-f-]{36}$/.test(deviceId)) deviceId = randomUUID();
  jar.set(DEVICE_COOKIE, deviceId, cookieOpts(400 * 86_400));
  return fraudHeaders({ client, deviceId, clientIp: ip, userId, version: process.env.npm_package_version ?? "1.0.0" });
}

/** HMRC's list of the returns it expects. Called from the browser, which sends the details HMRC asks for. */
export async function loadObligations(clientInfo: string): Promise<{ error?: string; obligations?: Obligation[] }> {
  const h = await requireHq("accounts.view");
  const s = await hqSettings();
  if (!(await hmrcConnected()) || !s?.hmrcVrn) return { error: "Connect to HMRC and save your VAT number first" };
  const hd = await clientHeaders(clientInfo, h.userId);
  if (!hd) return { error: "Your browser didn't send the details HMRC needs. Reload the page and try again." };
  try {
    return { obligations: await hmrcObligations(s.hmrcVrn, hd) };
  } catch (e) {
    if (e instanceof HmrcError) return { error: e.message };
    throw e;
  }
}

export async function disconnectHmrc() {
  const h = await requireHq("accounts.edit");
  if (h.role !== "OWNER") back(VAT, "Only the owner can disconnect HMRC");
  await db.hqSettings.update({ where: { id: "hq" }, data: { hmrcAccessToken: null, hmrcRefreshToken: null, hmrcTokenExpires: null, hmrcConnectedAt: null } });
  await hqAudit(h, "hmrc.disconnect");
  redirect(VAT);
}

// ---------------- Year end ----------------

async function yearFor(f: FormData) {
  const end = str(f, "yearEnd");
  const s = await hqSettings();
  if (!ymdOk(end)) back(YEAR, "Choose a year");
  const y = financialYear(end, s?.yearEndMonth ?? 12, s?.yearEndDay ?? 31);
  if (y.end !== end) back(YEAR, "That isn't the end of a company year. Check the year end under settings.");
  if (end >= londonDate()) back(YEAR, "That year hasn't ended yet");
  return y;
}

/** Profit before Corporation Tax for a year (Corporation Tax already put aside is added back). */
async function profitBeforeTax(start: string, end: string) {
  const b = await tradingBalances(range(start, end));
  const ct = b.find((a) => a.key === "CT_EXPENSE")?.balance ?? 0;
  return { b, profit: profitAndLoss(b).netProfit + ct };
}

const months = (start: string, end: string) => {
  const m = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7)) + 1;
  return Math.min(12, Math.max(1, m));
};

/** Puts the estimated Corporation Tax for a year in the books (replacing an earlier estimate). */
export async function postCorporationTax(f: FormData) {
  const h = await requireHq("accounts.edit");
  const y = await yearFor(f);
  if (await db.hqYearEnd.findUnique({ where: { yearEnd: londonDayStart(y.end) } })) back(YEAR, "That year is closed. Reopen it to change the Corporation Tax.");
  const typed = str(f, "taxPounds");
  const { profit } = await profitBeforeTax(y.start, y.end);
  const tax = typed ? Math.round(Number(typed.replace(/[£,]/g, "")) * 100) : corporationTax(profit, months(y.start, y.end));
  if (!Number.isFinite(tax) || tax < 0) back(YEAR, "Type the Corporation Tax in pounds, or leave it blank to use the estimate");
  try {
    await db.$transaction(async (tx) => {
      await unpostHq(tx, "CT_ACCRUAL", y.end, { yearEnd: true });
      await postHq(tx, { date: londonDayStart(y.end), source: "CT_ACCRUAL", sourceId: y.end, reference: `CT ${y.end}`, memo: `Corporation Tax for the year to ${y.end}`, userId: h.userId, lines: corporationTaxJournal(tax), yearEnd: true });
    });
  } catch (e) {
    if (e instanceof HqLockedError) back(YEAR, e.message);
    throw e;
  }
  await hqAudit(h, "yearend.ct", { yearEnd: y.end, tax });
  redirect(YEAR);
}

/** Closes a year: moves its profit to retained profit and locks the books to the year end. */
export async function closeYear(f: FormData) {
  const h = await requireHq("accounts.edit");
  const y = await yearFor(f);
  if (f.get("confirm") !== "on") back(YEAR, "Tick the box to confirm the year is final");
  const { b, profit } = await profitBeforeTax(y.start, y.end);
  const tax = b.find((a) => a.key === "CT_EXPENSE")?.balance ?? 0;
  try {
    await db.$transaction(async (tx) => {
      if (await tx.hqYearEnd.findUnique({ where: { yearEnd: londonDayStart(y.end) } })) return;
      await postHq(tx, { date: londonDayStart(y.end), source: "YEAR_END", sourceId: y.end, reference: `Year end ${y.end}`, memo: `Close the year to ${y.end}`, userId: h.userId, lines: closingJournal(b), yearEnd: true });
      await tx.hqYearEnd.create({ data: { yearStart: londonDayStart(y.start), yearEnd: londonDayStart(y.end), profitPence: profit, taxPence: tax, closedById: h.userId } });
      const current = (await tx.hqSettings.findUnique({ where: { id: "hq" } }))?.lockDate;
      if (!current || current < londonDayStart(y.end)) await tx.hqSettings.upsert({ where: { id: "hq" }, create: { id: "hq", lockDate: londonDayStart(y.end) }, update: { lockDate: londonDayStart(y.end) } });
    });
  } catch (e) {
    if (e instanceof HqLockedError) back(YEAR, e.message);
    throw e;
  }
  await hqAudit(h, "yearend.close", { yearEnd: y.end, profit, tax });
  redirect(YEAR);
}

/** Owner only. Takes the closing journal out, so Corporation Tax can be changed and the year closed again. The lock date stays. */
export async function reopenYear(f: FormData) {
  const h = await requireHq("accounts.edit");
  if (h.role !== "OWNER") back(YEAR, "Only the owner can reopen a year");
  const y = await yearFor(f);
  await db.$transaction(async (tx) => {
    await unpostHq(tx, "YEAR_END", y.end, { yearEnd: true });
    await tx.hqYearEnd.deleteMany({ where: { yearEnd: londonDayStart(y.end) } });
  });
  await hqAudit(h, "yearend.reopen", { yearEnd: y.end });
  redirect(YEAR);
}
