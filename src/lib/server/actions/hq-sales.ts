"use server";
import { revalidatePath } from "next/cache";
import { chargesVatOn } from "@/lib/server/hq-vat";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { requireHq, hqAudit, nextInvoiceNumber, nextQuoteNumber, publicToken, documentRate, rateFor } from "@/lib/server/hq";
import { billTo, emailHqInvoice, emailQuote, settleInvoice } from "@/lib/server/hq-docs";
import { clientIp, overLimit } from "@/lib/server/ratelimit";
import { parseLines } from "@/lib/hq/lines";
import { parseMoney, toGbpPence } from "@/lib/hq/money";
import { PAYMENT_METHODS } from "@/lib/hq/labels";
import { londonDate, londonDayStart, addDays } from "@/lib/dates";
import { HqLockedError, assertOpen, bankAccount, bankAmount, postInvoice, postInvoiceVoid, postPayment, unpostHq } from "@/lib/server/hq-books";

/** Runs a change that touches the books; a locked period comes back as a message instead of an error page. */
async function guarded<T>(f: () => Promise<T>): Promise<T | { locked: string }> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof HqLockedError) return { locked: e.message };
    throw e;
  }
}
const isLocked = (r: unknown): r is { locked: string } => !!r && typeof r === "object" && "locked" in r;
import type { FormState } from "./auth";

const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);
const opt = (f: FormData, k: string, max = 500) => str(f, k, max) || null;
const ymd = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? londonDayStart(s) : null);

/** The parts every quote and invoice form shares, checked and with every amount worked out on the server. */
async function readDocument(f: FormData, kind: "quote" | "invoice") {
  const client = await db.hqClient.findUnique({ where: { id: str(f, "clientId", 40) }, include: { contacts: true } });
  if (!client) return { error: "Choose a client" };
  const currency = str(f, "currency", 3).toUpperCase() || client.currency;
  const issueDate = ymd(str(f, "issueDate")) ?? londonDayStart(londonDate());
  const rate = await documentRate(currency, str(f, "perGbp", 30), issueDate);
  if (typeof rate === "string") return { error: rate };
  const parsed = parseLines(String(f.get("lines") ?? "[]"), currency, await chargesVatOn(issueDate));
  if ("error" in parsed) return { error: parsed.error };
  const itemIds = parsed.lines.map((l) => l.itemId).filter((x): x is string => !!x);
  const known = new Set((await db.hqItem.findMany({ where: { id: { in: itemIds } }, select: { id: true } })).map((i) => i.id));
  const lines = parsed.lines.map((l) => ({ ...l, itemId: l.itemId && known.has(l.itemId) ? l.itemId : null }));
  const endKey = kind === "quote" ? "expiryDate" : "dueDate";
  const end = ymd(str(f, endKey)) ?? londonDayStart(addDays(londonDate(issueDate), kind === "quote" ? 30 : client.paymentDays));
  if (end < issueDate) return { error: kind === "quote" ? "The quote can't expire before it's issued" : "The due date can't be before the invoice date" };
  return {
    client, currency, rate, issueDate, end, lines, totals: parsed.totals,
    title: opt(f, "title", 200), notes: opt(f, "notes", 4000), terms: opt(f, "terms", 4000),
  };
}

// ---------------- Quotes ----------------

export async function saveQuote(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("quotes.edit");
  const id = opt(f, "id", 40);
  const d = await readDocument(f, "quote");
  if ("error" in d) return { error: d.error };
  const data = {
    clientId: d.client.id, title: d.title, issueDate: d.issueDate, expiryDate: d.end, currency: d.currency, perGbp: d.rate,
    ...d.totals, notes: d.notes, terms: d.terms,
  };
  const lines = d.lines.map(({ itemId, position, description, quantity, unitMinor, discountPct, taxPct, amountMinor }) => ({ itemId, position, description, quantity, unitMinor, discountPct, taxPct, amountMinor }));
  let quoteId = id;
  if (id) {
    const q = await db.hqQuote.findUnique({ where: { id } });
    if (!q) return { error: "Quote not found" };
    if (q.status !== "DRAFT" && q.status !== "SENT") return { error: "Only a draft or sent quote can be changed" };
    await db.$transaction([
      db.hqLine.deleteMany({ where: { quoteId: id } }),
      db.hqQuote.update({ where: { id }, data: { ...data, lines: { create: lines } } }),
    ]);
    await hqAudit(h, "quote.update", { quoteId: id, total: d.totals.totalMinor, currency: d.currency });
  } else {
    const q = await db.hqQuote.create({ data: { ...data, number: await nextQuoteNumber(d.issueDate), publicToken: publicToken(), createdById: h.userId, lines: { create: lines } } });
    quoteId = q.id;
    await hqAudit(h, "quote.create", { quoteId, total: d.totals.totalMinor, currency: d.currency });
    const leadId = opt(f, "leadId", 40);
    if (leadId) await db.hqLead.updateMany({ where: { id: leadId, stage: { notIn: ["WON", "LOST"] } }, data: { stage: "PROPOSAL", clientId: d.client.id } });
  }
  revalidatePath("/platform/quotes");
  redirect(`/platform/quotes/${quoteId}`);
}

export async function quoteAction(f: FormData) {
  const h = await requireHq("quotes.edit");
  const id = str(f, "id", 40);
  const op = str(f, "op", 20);
  const q = await db.hqQuote.findUnique({ where: { id } });
  if (!q) return;
  let msg: string | null = null;
  if (op === "send") {
    msg = await emailQuote(id);
    if (!msg) await db.hqQuote.update({ where: { id }, data: { status: q.status === "DRAFT" ? "SENT" : q.status, sentAt: new Date() } });
  } else if (op === "mark-sent" && q.status === "DRAFT") await db.hqQuote.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
  else if ((op === "accepted" || op === "declined") && (q.status === "SENT" || q.status === "DRAFT"))
    await db.hqQuote.update({ where: { id }, data: { status: op === "accepted" ? "ACCEPTED" : "DECLINED", respondedAt: new Date() } });
  else if (op === "reopen" && (q.status === "ACCEPTED" || q.status === "DECLINED")) await db.hqQuote.update({ where: { id }, data: { status: "SENT", respondedAt: null } });
  else if (op === "delete" && q.status === "DRAFT") {
    await db.hqQuote.delete({ where: { id } });
    await hqAudit(h, "quote.delete", { quoteId: id, number: q.number });
    redirect("/platform/quotes");
  } else return;
  await hqAudit(h, `quote.${op}`, { quoteId: id });
  revalidatePath(`/platform/quotes/${id}`);
  if (msg) redirect(`/platform/quotes/${id}?error=${encodeURIComponent(msg)}`);
}

/** Turns an accepted (or sent) quote into a draft invoice with the same lines. */
export async function quoteToInvoice(f: FormData) {
  const h = await requireHq("invoices.edit");
  const q = await db.hqQuote.findUnique({ where: { id: str(f, "id", 40) }, include: { lines: { orderBy: { position: "asc" } }, client: { include: { contacts: true } }, invoice: true } });
  if (!q) return;
  if (q.invoice) redirect(`/platform/invoices/${q.invoice.id}`);
  if (q.status === "DECLINED") redirect(`/platform/quotes/${q.id}?error=${encodeURIComponent("A declined quote can't be invoiced. Reopen it first.")}`);
  const today = londonDayStart(londonDate());
  const rate = (await rateFor(q.currency, today)) ?? Number(q.perGbp);
  const inv = await db.$transaction(async (tx) => {
    const created = await tx.hqInvoice.create({
      data: {
        number: await nextInvoiceNumber(today), clientId: q.clientId, quoteId: q.id, title: q.title, issueDate: today,
        dueDate: londonDayStart(addDays(londonDate(today), q.client.paymentDays)), currency: q.currency, perGbp: rate,
        subtotalMinor: q.subtotalMinor, discountMinor: q.discountMinor, taxMinor: q.taxMinor, totalMinor: q.totalMinor,
        notes: q.notes, terms: q.terms, publicToken: publicToken(), createdById: h.userId, ...billTo(q.client),
        lines: { create: q.lines.map(({ itemId, position, description, quantity, unitMinor, discountPct, taxPct, amountMinor }) => ({ itemId, position, description, quantity, unitMinor, discountPct, taxPct, amountMinor })) },
      },
    });
    await tx.hqQuote.update({ where: { id: q.id }, data: { status: "INVOICED" } });
    return created;
  });
  await hqAudit(h, "invoice.fromQuote", { quoteId: q.id, invoiceId: inv.id });
  redirect(`/platform/invoices/${inv.id}`);
}

// ---------------- Invoices ----------------

export async function saveInvoice(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("invoices.edit");
  const id = opt(f, "id", 40);
  const d = await readDocument(f, "invoice");
  if ("error" in d) return { error: d.error };
  // Which project it's for, so the project shows what's been invoiced.
  const projectId = opt(f, "projectId", 40);
  const project = projectId ? await db.hqProject.findUnique({ where: { id: projectId } }) : null;
  if (projectId && (!project || (project.clientId && project.clientId !== d.client.id))) return { error: "That project belongs to another client" };
  const data = {
    projectId: project?.id ?? null,
    clientId: d.client.id, title: d.title, issueDate: d.issueDate, dueDate: d.end, currency: d.currency, perGbp: d.rate,
    ...d.totals, notes: d.notes, terms: d.terms, ...billTo(d.client),
  };
  const lines = d.lines.map(({ itemId, position, description, quantity, unitMinor, discountPct, taxPct, amountMinor }) => ({ itemId, position, description, quantity, unitMinor, discountPct, taxPct, amountMinor }));
  let invoiceId = id;
  if (id) {
    const inv = await db.hqInvoice.findUnique({ where: { id }, include: { _count: { select: { payments: true } } } });
    if (!inv) return { error: "Invoice not found" };
    if (inv.status !== "DRAFT" && inv.status !== "SENT") return { error: "Only a draft or unpaid invoice can be changed" };
    if (inv._count.payments) return { error: "This invoice has payments, so it can't be changed. Delete the payments first." };
    // A sent invoice is already in the books: take it out and put the changed one back in.
    const r = await guarded(() => db.$transaction(async (tx) => {
      if (inv.status === "SENT") { await unpostHq(tx, "INVOICE", id); await assertOpen(d.issueDate, tx); }
      await tx.hqLine.deleteMany({ where: { invoiceId: id } });
      await tx.hqInvoice.update({ where: { id }, data: { ...data, lines: { create: lines } } });
      if (inv.status === "SENT") await postInvoice(tx, id, h.userId);
    }));
    if (isLocked(r)) return { error: r.locked };
    await hqAudit(h, "invoice.update", { invoiceId: id, total: d.totals.totalMinor, currency: d.currency });
  } else {
    const inv = await db.hqInvoice.create({ data: { ...data, number: await nextInvoiceNumber(d.issueDate), publicToken: publicToken(), createdById: h.userId, lines: { create: lines } } });
    invoiceId = inv.id;
    await hqAudit(h, "invoice.create", { invoiceId, total: d.totals.totalMinor, currency: d.currency });
  }
  revalidatePath("/platform/invoices");
  redirect(`/platform/invoices/${invoiceId}`);
}

export async function invoiceAction(f: FormData) {
  const h = await requireHq("invoices.edit");
  const id = str(f, "id", 40);
  const op = str(f, "op", 20);
  const inv = await db.hqInvoice.findUnique({ where: { id }, include: { client: { include: { contacts: true } }, _count: { select: { payments: true } } } });
  if (!inv) return;
  let msg: string | null = null;
  if (op === "send" || op === "mark-sent") {
    if (inv.status === "VOID") return;
    // The bill-to details are fixed as they are on the day it goes out.
    if (inv.status === "DRAFT") {
      const r = await guarded(() => db.$transaction(async (tx) => {
        await tx.hqInvoice.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), ...billTo(inv.client) } });
        await postInvoice(tx, id, h.userId);
      }));
      if (isLocked(r)) redirect(`/platform/invoices/${id}?error=${encodeURIComponent(r.locked)}`);
    }
    if (op === "send") msg = await emailHqInvoice(id);
    if (!msg && op === "send") await db.hqInvoice.update({ where: { id }, data: { sentAt: new Date() } });
  } else if (op === "void" && inv.status !== "VOID") {
    if (inv._count.payments) msg = "Delete the payments on this invoice before voiding it";
    else {
      const r = await guarded(() => db.$transaction(async (tx) => {
        await tx.hqInvoice.update({ where: { id }, data: { status: "VOID", voidedAt: new Date() } });
        // Time billed on it can be invoiced again.
        await tx.hqTimeEntry.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } });
        await postInvoiceVoid(tx, id, h.userId);
      }));
      if (isLocked(r)) msg = r.locked;
    }
  } else if (op === "delete" && inv.status === "DRAFT") {
    await db.$transaction([
      db.hqQuote.updateMany({ where: { id: inv.quoteId ?? "", status: "INVOICED" }, data: { status: "ACCEPTED" } }),
      db.hqInvoice.delete({ where: { id } }),
    ]);
    await hqAudit(h, "invoice.delete", { invoiceId: id, number: inv.number });
    redirect("/platform/invoices");
  } else return;
  await hqAudit(h, `invoice.${op}`, { invoiceId: id });
  revalidatePath(`/platform/invoices/${id}`);
  if (msg) redirect(`/platform/invoices/${id}?error=${encodeURIComponent(msg)}`);
}

export async function recordPayment(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("payments.edit");
  const id = str(f, "invoiceId", 40);
  const inv = await db.hqInvoice.findUnique({ where: { id } });
  if (!inv) return { error: "Invoice not found" };
  if (inv.status === "DRAFT") return { error: "Send the invoice (or mark it as sent) before recording a payment" };
  if (inv.status === "VOID") return { error: "This invoice is void" };
  const amount = parseMoney(str(f, "amount"), inv.currency);
  if (amount === null || amount <= 0) return { error: "Enter the amount received" };
  if (amount > inv.totalMinor - inv.paidMinor) return { error: "That's more than is left to pay on this invoice" };
  const date = ymd(str(f, "date"));
  if (!date) return { error: "Choose the date it was received" };
  const method = z.enum(PAYMENT_METHODS).safeParse(str(f, "method"));
  if (!method.success) return { error: "Choose how it was paid" };
  const rate = await documentRate(inv.currency, str(f, "perGbp", 30), date);
  if (typeof rate === "string") return { error: rate };
  const bank = await bankAccount(db, opt(f, "bankAccountId", 40));
  if (!bank) return { error: "Add a bank account under Accounts first" };
  const gbp = toGbpPence(amount, inv.currency, rate);
  if (bankAmount(bank.currency, inv.currency, amount, gbp) === null) return { error: `${bank.name} is in ${bank.currency}. Choose a GBP or ${inv.currency} account.` };
  const r = await guarded(() => db.$transaction(async (tx) => {
    const p = await tx.hqPayment.create({
      data: { invoiceId: id, date, amountMinor: amount, perGbp: rate, gbpPence: gbp, method: method.data, bankAccountId: bank.id, reference: opt(f, "reference", 120), notes: opt(f, "notes", 500), userId: h.userId },
    });
    await settleInvoice(tx, id);
    await postPayment(tx, p.id, h.userId);
  }));
  if (isLocked(r)) return { error: r.locked };
  await hqAudit(h, "payment.create", { invoiceId: id, amount, currency: inv.currency });
  revalidatePath(`/platform/invoices/${id}`);
  return { ok: "Payment recorded" };
}

export async function deletePayment(f: FormData) {
  const h = await requireHq("payments.edit");
  const p = await db.hqPayment.findUnique({ where: { id: str(f, "id", 40) } });
  if (!p) return;
  if (p.creditNoteId) redirect(`/platform/invoices/${p.invoiceId}?error=${encodeURIComponent("This is a credit note. Void the credit note instead.")}`);
  const r = await guarded(() => db.$transaction(async (tx) => {
    await unpostHq(tx, "PAYMENT", p.id);
    await tx.hqPayment.delete({ where: { id: p.id } });
    await settleInvoice(tx, p.invoiceId);
  }));
  if (isLocked(r)) redirect(`/platform/invoices/${p.invoiceId}?error=${encodeURIComponent(r.locked)}`);
  await hqAudit(h, "payment.delete", { invoiceId: p.invoiceId, amount: p.amountMinor });
  revalidatePath(`/platform/invoices/${p.invoiceId}`);
}

// ---------------- The client's own view of a quote ----------------

/** Accept or decline from the quote link. The link's secret is the only key, so this is rate limited per connection. */
export async function respondToQuote(f: FormData) {
  const token = str(f, "token", 100);
  const answer = str(f, "answer", 10);
  if (await overLimit(`quote-respond:${await clientIp()}`, 20, 60)) return;
  const q = await db.hqQuote.findUnique({ where: { publicToken: token } });
  if (!q || q.status !== "SENT" || (answer !== "accept" && answer !== "decline")) return;
  if (q.expiryDate && q.expiryDate.getTime() + 86_400_000 < Date.now()) return;
  await db.hqQuote.update({ where: { id: q.id }, data: { status: answer === "accept" ? "ACCEPTED" : "DECLINED", respondedAt: new Date() } });
  revalidatePath(`/q/${token}`);
}
