"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { requireHq, hqAudit, documentRate, nextCreditNumber, publicToken } from "@/lib/server/hq";
import { settleInvoice } from "@/lib/server/hq-docs";
import {
  HqLockedError, assertOpen, bankAccount, bankAmount, ensureHqChart, postBill, postBillPayment, postCreditNote, postHq, postPayment, unpostHq,
} from "@/lib/server/hq-books";
import { importKeys, statementDate } from "@/lib/server/hq-bank";
import { runRecurring } from "@/lib/server/hq-recurring";
import { bankLineJournal, isBalanced, type HqLineDraft } from "@/lib/hq/books";
import { parseBillLines } from "@/lib/hq/bill-lines";
import { parseStatement } from "@/lib/hq/bank-csv";
import { parseLines } from "@/lib/hq/lines";
import { isCurrency, minorDigits, parseMoney, toGbpPence } from "@/lib/hq/money";
import { allocate } from "@/lib/pos/money";
import { seller } from "@/lib/legal";
import { londonDate, londonDayStart } from "@/lib/dates";
import type { FormState } from "./auth";

const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);
const opt = (f: FormData, k: string, max = 500) => str(f, k, max) || null;
const ymd = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? londonDayStart(s) : null);
const back = (path: string, msg?: string | null): never => redirect(msg ? `${path}?error=${encodeURIComponent(msg)}` : path);

/** Runs a change that touches the books; a locked period comes back as its message. */
async function locked(f: () => Promise<unknown>): Promise<string | null> {
  try {
    await f();
    return null;
  } catch (e) {
    if (e instanceof HqLockedError) return e.message;
    throw e;
  }
}

// ---------------- Chart of accounts ----------------

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;

export async function saveAccount(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("accounts.edit");
  await ensureHqChart();
  const id = opt(f, "id", 40);
  const code = str(f, "code", 10);
  const name = str(f, "name", 120);
  const isBank = f.get("isBank") === "on";
  const type = z.enum(ACCOUNT_TYPES).safeParse(isBank ? "ASSET" : str(f, "type"));
  const currency = isBank ? str(f, "currency", 3).toUpperCase() || "GBP" : "GBP";
  if (!/^\d{3,6}$/.test(code)) return { error: "The code is 3 to 6 digits, for example 6250" };
  if (!name) return { error: "Give the account a name" };
  if (!type.success) return { error: "Choose the type of account" };
  if (!isCurrency(currency)) return { error: "Choose the bank account's currency" };
  const clash = await db.hqAccount.findFirst({ where: { code, ...(id ? { NOT: { id } } : {}) } });
  if (clash) return { error: `${code} is already used by ${clash.name}` };
  const data = { code, name, description: opt(f, "description", 500), archived: f.get("archived") === "on" };
  if (id) {
    const a = await db.hqAccount.findUnique({ where: { id }, include: { _count: { select: { lines: true } } } });
    if (!a) return { error: "Account not found" };
    // An account in use keeps its type and currency, or the history would read differently.
    if (a._count.lines && (a.type !== type.data || a.isBank !== isBank || a.currency !== currency))
      return { error: "This account already has entries, so its type, bank setting and currency can't change. Make a new account instead." };
    if (a.systemKey && (a.type !== type.data || a.isBank !== isBank || data.archived))
      return { error: "This account is used by automatic postings. You can rename it, but not change its type or archive it." };
    await db.hqAccount.update({ where: { id }, data: { ...data, type: type.data, isBank, currency } });
  } else {
    await db.hqAccount.create({ data: { ...data, type: type.data, isBank, currency } });
  }
  await hqAudit(h, id ? "account.update" : "account.create", { code });
  revalidatePath("/platform/accounts/chart");
  return { ok: id ? "Account saved" : "Account added" };
}

// ---------------- Manual journals (also opening balances) ----------------

const journalLines = z.array(z.object({ accountId: z.string().max(40), debit: z.string().max(30).optional(), credit: z.string().max(30).optional(), description: z.string().max(200).optional() })).max(100);

export async function saveJournal(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("accounts.edit");
  const date = ymd(str(f, "date"));
  if (!date) return { error: "Choose the date" };
  let raw: unknown;
  try { raw = JSON.parse(String(f.get("lines") ?? "[]")); } catch { return { error: "The lines couldn't be read" }; }
  const p = journalLines.safeParse(raw);
  if (!p.success) return { error: "Up to 100 lines, each with an account" };
  const accounts = new Map((await db.hqAccount.findMany({ where: { id: { in: p.data.map((l) => l.accountId) } } })).map((a) => [a.id, a]));
  const lines: HqLineDraft[] = [];
  for (const [i, l] of p.data.entries()) {
    const debit = l.debit ? parseMoney(l.debit, "GBP") : 0;
    const credit = l.credit ? parseMoney(l.credit, "GBP") : 0;
    if (!l.accountId && !debit && !credit) continue;
    const a = accounts.get(l.accountId);
    if (!a) return { error: `Line ${i + 1}: choose an account` };
    if (debit === null || credit === null || debit < 0 || credit < 0 || debit > 1e12 || credit > 1e12) return { error: `Line ${i + 1}: enter amounts as numbers` };
    if (!!debit === !!credit) return { error: `Line ${i + 1}: enter a debit or a credit, not both` };
    // Manual entries on a bank account in another currency would leave its own-currency balance wrong.
    if (a.isBank && a.currency !== "GBP") return { error: `Line ${i + 1}: ${a.name} is in ${a.currency}. Use bank statement lines or payments for it instead.` };
    lines.push({ account: { id: a.id }, debit, credit, description: l.description?.trim() || undefined, foreignMinor: a.isBank ? debit - credit : undefined });
  }
  if (lines.length < 2) return { error: "A journal needs at least two lines" };
  if (!isBalanced(lines)) {
    const d = lines.reduce((n, l) => n + l.debit, 0), c = lines.reduce((n, l) => n + l.credit, 0);
    return { error: `Debits and credits must be equal. They are £${(d / 100).toFixed(2)} and £${(c / 100).toFixed(2)}.` };
  }
  const msg = await locked(() => db.$transaction((tx) => postHq(tx, { date, source: "MANUAL", sourceId: randomUUID(), reference: opt(f, "reference", 60), memo: opt(f, "memo", 300) ?? "Journal", userId: h.userId, lines })));
  if (msg) return { error: msg };
  await hqAudit(h, "journal.create", { lines: lines.length });
  revalidatePath("/platform/accounts");
  return { ok: "Journal posted" };
}

export async function deleteJournal(f: FormData) {
  const h = await requireHq("accounts.edit");
  const j = await db.hqJournal.findUnique({ where: { id: str(f, "id", 40) } });
  if (!j || j.source !== "MANUAL" || !j.sourceId) return back("/platform/accounts/journals", "Only journals entered by hand can be deleted here");
  const msg = await locked(() => db.$transaction((tx) => unpostHq(tx, "MANUAL", j.sourceId!)));
  if (msg) return back("/platform/accounts/journals", msg);
  await hqAudit(h, "journal.delete", { journalId: j.id });
  revalidatePath("/platform/accounts/journals");
  back("/platform/accounts/journals");
}

// ---------------- Settings ----------------

export async function saveLockDate(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("accounts.edit");
  const raw = str(f, "lockDate");
  const lock = raw ? ymd(raw) : null;
  if (raw && !lock) return { error: "Choose a date, or leave it blank to unlock" };
  if (lock && lock > londonDayStart(londonDate())) return { error: "The lock date can't be in the future" };
  // Unlocking (or moving the date back) reopens closed periods, so only the owner can do it.
  const current = (await db.hqSettings.findUnique({ where: { id: "hq" } }))?.lockDate ?? null;
  if (current && (!lock || lock < current) && h.role !== "OWNER") return { error: "Only the owner can unlock a closed period" };
  await db.hqSettings.upsert({ where: { id: "hq" }, create: { id: "hq", lockDate: lock }, update: { lockDate: lock } });
  await hqAudit(h, "books.lock", { lockDate: raw || null });
  revalidatePath("/platform/accounts/settings");
  return { ok: lock ? "Books locked" : "Books unlocked" };
}

// ---------------- Suppliers ----------------

export async function saveSupplier(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("accounts.edit");
  const id = opt(f, "id", 40);
  const name = str(f, "name", 160);
  if (!name) return { error: "Enter the supplier's name" };
  const currency = str(f, "currency", 3).toUpperCase() || "GBP";
  if (!isCurrency(currency)) return { error: "Choose a currency" };
  const email = opt(f, "email", 200);
  if (email && !z.string().email().safeParse(email).success) return { error: "That email address doesn't look right" };
  const data = { name, email, phone: opt(f, "phone", 40), address: opt(f, "address", 500), vatNumber: opt(f, "vatNumber", 30), currency, notes: opt(f, "notes", 2000), archived: f.get("archived") === "on" };
  if (id) await db.hqSupplier.update({ where: { id }, data });
  else await db.hqSupplier.create({ data });
  await hqAudit(h, id ? "supplier.update" : "supplier.create", { name });
  revalidatePath("/platform/suppliers");
  return { ok: id ? "Supplier saved" : "Supplier added" };
}

// ---------------- Bills and expenses ----------------

async function settleBill(tx: Prisma.TransactionClient, id: string) {
  const b = await tx.hqBill.findUniqueOrThrow({ where: { id }, include: { payments: true } });
  if (b.status === "VOID") return b;
  const paid = b.payments.reduce((n, p) => n + p.amountMinor, 0);
  return tx.hqBill.update({ where: { id }, data: { paidMinor: paid, status: paid >= b.totalMinor ? "PAID" : paid > 0 ? "PARTIAL" : "OPEN" } });
}

async function checkBank(id: string | null, docCurrency: string, amountMinor: number, gbpPence: number) {
  const bank = await bankAccount(db, id);
  if (!bank) return { error: "Add a bank account under Accounts first" };
  if (bankAmount(bank.currency, docCurrency, amountMinor, gbpPence) === null) return { error: `${bank.name} is in ${bank.currency}. Choose a GBP or ${docCurrency} account.` };
  return { bank };
}

export async function saveBill(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("accounts.edit");
  await ensureHqChart();
  const id = opt(f, "id", 40);
  const isExpense = f.get("isExpense") === "on" || f.get("isExpense") === "true";
  const supplier = opt(f, "supplierId", 40) ? await db.hqSupplier.findUnique({ where: { id: str(f, "supplierId", 40) } }) : null;
  const payee = str(f, "payee", 160) || supplier?.name || "";
  if (!payee) return { error: "Choose a supplier or type who it was paid to" };
  const currency = str(f, "currency", 3).toUpperCase() || supplier?.currency || "GBP";
  const date = ymd(str(f, "date"));
  if (!date) return { error: "Choose the date on the bill or receipt" };
  const dueDate = isExpense ? date : ymd(str(f, "dueDate")) ?? date;
  if (dueDate < date) return { error: "The due date can't be before the bill date" };
  const rate = await documentRate(currency, str(f, "perGbp", 30), date);
  if (typeof rate === "string") return { error: rate };
  const parsed = parseBillLines(String(f.get("lines") ?? "[]"), currency, seller().chargeVat);
  if ("error" in parsed) return { error: parsed.error };
  const okAccounts = new Set((await db.hqAccount.findMany({ where: { id: { in: parsed.lines.map((l) => l.accountId) }, isBank: false, archived: false }, select: { id: true } })).map((a) => a.id));
  if (parsed.lines.some((l) => !okAccounts.has(l.accountId))) return { error: "Choose what each line was for from the list" };
  let bankId: string | null = null;
  const gbp = toGbpPence(parsed.totalMinor, currency, rate);
  if (isExpense) {
    const b = await checkBank(opt(f, "bankAccountId", 40), currency, parsed.totalMinor, gbp);
    if ("error" in b) return { error: b.error };
    bankId = b.bank.id;
  }
  const projectId = opt(f, "projectId", 40);
  if (projectId && !(await db.hqProject.findUnique({ where: { id: projectId } }))) return { error: "Choose a project from the list" };
  const data = {
    projectId,
    supplierId: supplier?.id ?? null, payee, reference: opt(f, "reference", 80), isExpense, date, dueDate, currency, perGbp: rate,
    netMinor: parsed.netMinor, taxMinor: parsed.taxMinor, totalMinor: parsed.totalMinor, notes: opt(f, "notes", 2000),
  };
  let billId = id;
  const msg = await locked(() => db.$transaction(async (tx) => {
    if (id) {
      const b = await tx.hqBill.findUnique({ where: { id }, include: { payments: true } });
      if (!b) throw new HqLockedError("Bill not found");
      if (b.status === "VOID") throw new HqLockedError("This bill is void");
      // An expense is paid as it's saved, so editing one re-does its payment too. A bill with payments can't be edited.
      if (!b.isExpense && b.payments.length) throw new HqLockedError("Delete the payments on this bill before changing it");
      for (const p of b.payments) { await unpostHq(tx, "BILL_PAYMENT", p.id); await tx.hqBillPayment.delete({ where: { id: p.id } }); }
      await unpostHq(tx, "BILL", id);
      await assertOpen(date, tx);
      await tx.hqBillLine.deleteMany({ where: { billId: id } });
      await tx.hqBill.update({ where: { id }, data: { ...data, lines: { create: parsed.lines } } });
    } else {
      billId = (await tx.hqBill.create({ data: { ...data, createdById: h.userId, lines: { create: parsed.lines } } })).id;
    }
    await postBill(tx, billId!, h.userId);
    if (isExpense && bankId) {
      const p = await tx.hqBillPayment.create({ data: { billId: billId!, date, amountMinor: parsed.totalMinor, perGbp: rate, gbpPence: gbp, bankAccountId: bankId, reference: data.reference, userId: h.userId } });
      await postBillPayment(tx, p.id, h.userId);
    }
    await settleBill(tx, billId!);
  }));
  if (msg) return { error: msg };
  await hqAudit(h, id ? "bill.update" : "bill.create", { billId: billId!, total: parsed.totalMinor, currency, expense: isExpense });
  revalidatePath("/platform/bills");
  redirect(`/platform/bills/${billId}`);
}

export async function payBill(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("accounts.edit");
  const b = await db.hqBill.findUnique({ where: { id: str(f, "billId", 40) } });
  if (!b || b.status === "VOID") return { error: "Bill not found" };
  const amount = parseMoney(str(f, "amount"), b.currency);
  if (amount === null || amount <= 0) return { error: "Enter the amount paid" };
  if (amount > b.totalMinor - b.paidMinor) return { error: "That's more than is left to pay on this bill" };
  const date = ymd(str(f, "date"));
  if (!date) return { error: "Choose the date it was paid" };
  const rate = await documentRate(b.currency, str(f, "perGbp", 30), date);
  if (typeof rate === "string") return { error: rate };
  const gbp = toGbpPence(amount, b.currency, rate);
  const bank = await checkBank(opt(f, "bankAccountId", 40), b.currency, amount, gbp);
  if ("error" in bank) return { error: bank.error };
  const msg = await locked(() => db.$transaction(async (tx) => {
    const p = await tx.hqBillPayment.create({ data: { billId: b.id, date, amountMinor: amount, perGbp: rate, gbpPence: gbp, bankAccountId: bank.bank.id, reference: opt(f, "reference", 120), userId: h.userId } });
    await postBillPayment(tx, p.id, h.userId);
    await settleBill(tx, b.id);
  }));
  if (msg) return { error: msg };
  await hqAudit(h, "bill.pay", { billId: b.id, amount });
  revalidatePath(`/platform/bills/${b.id}`);
  return { ok: "Payment recorded" };
}

export async function deleteBillPayment(f: FormData) {
  const h = await requireHq("accounts.edit");
  const p = await db.hqBillPayment.findUnique({ where: { id: str(f, "id", 40) }, include: { bill: true } });
  if (!p) return;
  const path = `/platform/bills/${p.billId}`;
  if (p.bill.isExpense) back(path, "This expense was paid as it was saved. Edit or void the expense instead.");
  const msg = await locked(() => db.$transaction(async (tx) => {
    await unpostHq(tx, "BILL_PAYMENT", p.id);
    await tx.hqBillPayment.delete({ where: { id: p.id } });
    await settleBill(tx, p.billId);
  }));
  if (msg) back(path, msg);
  await hqAudit(h, "bill.payment.delete", { billId: p.billId, amount: p.amountMinor });
  revalidatePath(path);
}

export async function voidBill(f: FormData) {
  const h = await requireHq("accounts.edit");
  const b = await db.hqBill.findUnique({ where: { id: str(f, "id", 40) }, include: { payments: true } });
  if (!b || b.status === "VOID") return;
  const path = `/platform/bills/${b.id}`;
  if (!b.isExpense && b.payments.length) back(path, "Delete the payments on this bill before voiding it");
  const msg = await locked(() => db.$transaction(async (tx) => {
    // An expense's own payment is reversed with it.
    for (const p of b.payments) await unpostHq(tx, "BILL_PAYMENT", p.id);
    await tx.hqBillPayment.deleteMany({ where: { billId: b.id } });
    await tx.hqBill.update({ where: { id: b.id }, data: { status: "VOID", voidedAt: new Date(), paidMinor: 0 } });
    await postBill(tx, b.id, h.userId);
  }));
  if (msg) back(path, msg);
  await hqAudit(h, "bill.void", { billId: b.id });
  revalidatePath(path);
}

// ---------------- Credit notes ----------------

/**
 * Credits part or all of what's left to pay on an invoice. The amount is spread over the invoice's lines in
 * proportion, so each income account (and any VAT) is reduced by its share.
 */
export async function createCreditNote(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("invoices.edit");
  const inv = await db.hqInvoice.findUnique({ where: { id: str(f, "invoiceId", 40) }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!inv) return { error: "Invoice not found" };
  if (inv.status === "DRAFT" || inv.status === "VOID") return { error: "Only a sent invoice can be credited. Change or delete a draft instead." };
  const left = inv.totalMinor - inv.paidMinor;
  const amount = parseMoney(str(f, "amount"), inv.currency);
  if (amount === null || amount <= 0) return { error: "Enter the amount to credit" };
  if (amount > left) return { error: "That's more than is left to pay on this invoice. Refunds of money already paid aren't covered here yet." };
  const date = ymd(str(f, "date")) ?? londonDayStart(londonDate());
  if (date < inv.issueDate) return { error: "The credit note can't be dated before the invoice" };
  const reason = opt(f, "reason", 500);
  const tax = inv.totalMinor ? Math.round((amount * inv.taxMinor) / inv.totalMinor) : 0;
  const net = amount - tax;
  const parts = allocate(net, inv.lines.map((l) => Math.max(0, l.amountMinor)));
  const lines = inv.lines
    .map((l, i) => ({ itemId: l.itemId, position: i, description: `Credit: ${l.description}`.slice(0, 2000), quantity: 1, unitMinor: parts[i], discountPct: 0, taxPct: Number(l.taxPct), amountMinor: parts[i] }))
    .filter((l) => l.amountMinor > 0);
  const rate = Number(inv.perGbp);
  let id = "";
  const msg = await locked(() => db.$transaction(async (tx) => {
    const c = await tx.hqCreditNote.create({
      data: {
        number: await nextCreditNumber(date), invoiceId: inv.id, date, currency: inv.currency, perGbp: inv.perGbp, reason,
        subtotalMinor: net, discountMinor: 0, taxMinor: tax, totalMinor: amount, publicToken: publicToken(), createdById: h.userId,
        lines: { create: lines },
      },
    });
    id = c.id;
    // Applied to the invoice like a payment, at the invoice's own rate, so no exchange difference arises.
    await tx.hqPayment.create({ data: { invoiceId: inv.id, date, amountMinor: amount, perGbp: rate, gbpPence: toGbpPence(amount, inv.currency, rate), method: "CREDIT_NOTE", creditNoteId: c.id, reference: c.number, notes: reason, userId: h.userId } });
    await settleInvoice(tx, inv.id);
    await postCreditNote(tx, c.id, h.userId);
  }));
  if (msg) return { error: msg };
  await hqAudit(h, "credit.create", { invoiceId: inv.id, amount, currency: inv.currency });
  revalidatePath(`/platform/invoices/${inv.id}`);
  redirect(`/platform/credit-notes/${id}`);
}

export async function voidCreditNote(f: FormData) {
  const h = await requireHq("invoices.edit");
  const c = await db.hqCreditNote.findUnique({ where: { id: str(f, "id", 40) }, include: { payment: true } });
  if (!c || c.status === "VOID") return;
  const path = `/platform/credit-notes/${c.id}`;
  const msg = await locked(() => db.$transaction(async (tx) => {
    await unpostHq(tx, "CREDIT_NOTE", c.id);
    if (c.payment) await tx.hqPayment.delete({ where: { id: c.payment.id } });
    await tx.hqCreditNote.update({ where: { id: c.id }, data: { status: "VOID" } });
    await settleInvoice(tx, c.invoiceId);
  }));
  if (msg) back(path, msg);
  await hqAudit(h, "credit.void", { creditNoteId: c.id });
  revalidatePath(path);
}

// ---------------- Repeating invoices ----------------

const FREQ = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;

export async function saveRecurring(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("invoices.edit");
  const id = opt(f, "id", 40);
  const client = await db.hqClient.findUnique({ where: { id: str(f, "clientId", 40) } });
  if (!client) return { error: "Choose a client" };
  const currency = str(f, "currency", 3).toUpperCase() || client.currency;
  if (!isCurrency(currency)) return { error: "Choose a currency" };
  const linesJson = String(f.get("lines") ?? "[]");
  const parsed = parseLines(linesJson, currency, seller().chargeVat);
  if ("error" in parsed) return { error: parsed.error };
  const frequency = z.enum(FREQ).safeParse(str(f, "frequency"));
  if (!frequency.success) return { error: "Choose how often" };
  const nextDate = ymd(str(f, "nextDate") || str(f, "issueDate"));
  if (!nextDate) return { error: "Choose the date of the next invoice" };
  const endDate = opt(f, "endDate") ? ymd(str(f, "endDate")) : null;
  if (endDate && endDate < nextDate) return { error: "The end date can't be before the next invoice" };
  // The lines are kept as typed (prices in the currency), and checked again each time an invoice is made.
  const lines = JSON.parse(linesJson) as Prisma.InputJsonValue;
  const data = {
    clientId: client.id, title: opt(f, "title", 200), currency, lines, frequency: frequency.data, nextDate, endDate,
    autoSend: f.get("autoSend") === "on", active: true, notes: opt(f, "notes", 4000), terms: opt(f, "terms", 4000),
  };
  const r = id ? await db.hqRecurring.update({ where: { id }, data }) : await db.hqRecurring.create({ data: { ...data, createdById: h.userId } });
  await hqAudit(h, id ? "recurring.update" : "recurring.create", { recurringId: r.id });
  revalidatePath("/platform/recurring");
  redirect(`/platform/recurring/${r.id}`);
}

export async function recurringAction(f: FormData) {
  const h = await requireHq("invoices.edit");
  const r = await db.hqRecurring.findUnique({ where: { id: str(f, "id", 40) } });
  if (!r) return;
  const op = str(f, "op", 20);
  const path = `/platform/recurring/${r.id}`;
  if (op === "pause" || op === "resume") await db.hqRecurring.update({ where: { id: r.id }, data: { active: op === "resume" } });
  else if (op === "delete") {
    await db.hqRecurring.delete({ where: { id: r.id } });
    await hqAudit(h, "recurring.delete", { recurringId: r.id });
    redirect("/platform/recurring");
  } else if (op === "run") {
    const out = await runRecurring();
    await hqAudit(h, "recurring.run", { made: out.made });
    revalidatePath(path);
    if (out.problems.length) back(path, out.problems.join(" · "));
    if (!out.made) back(path, "Nothing is due yet. Invoices are made on their next date.");
  } else return;
  revalidatePath(path);
}

// ---------------- Bank statements ----------------

export async function importStatement(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("accounts.edit");
  const account = await db.hqAccount.findFirst({ where: { id: str(f, "accountId", 40), isBank: true } });
  if (!account) return { error: "Bank account not found" };
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose the CSV file you downloaded from your bank" };
  if (file.size > 950_000) return { error: "That file is over 1 MB. Download a shorter date range." };
  const parsed = parseStatement(await file.text(), account.currency);
  if ("error" in parsed) return { error: parsed.error };
  const keys = importKeys(account.id, parsed.lines);
  const res = await db.hqBankTxn.createMany({
    data: parsed.lines.map((l, i) => ({ accountId: account.id, date: statementDate(l.date), description: l.description, amountMinor: l.amountMinor, importKey: keys[i] })),
    skipDuplicates: true,
  });
  const dupes = parsed.lines.length - res.count;
  await hqAudit(h, "bank.import", { accountId: account.id, added: res.count, duplicates: dupes });
  revalidatePath(`/platform/bank/${account.id}`);
  return { ok: `${res.count} line${res.count === 1 ? "" : "s"} added${dupes ? `, ${dupes} already imported` : ""}${parsed.skipped ? `, ${parsed.skipped} skipped (no date or amount)` : ""}` };
}

async function txnFor(f: FormData) {
  const t = await db.hqBankTxn.findUnique({ where: { id: str(f, "txnId", 40) }, include: { account: true } });
  return t && t.status === "UNMATCHED" ? t : null;
}

const bankPath = (t: { accountId: string }) => `/platform/bank/${t.accountId}`;

/** Ticks a statement line off against an entry already in the books. */
export async function matchTxn(f: FormData) {
  const h = await requireHq("accounts.edit");
  const t = await txnFor(f);
  if (!t) return;
  const j = await db.hqJournal.findUnique({ where: { id: str(f, "journalId", 40) }, include: { lines: true, bankTxn: true } });
  if (!j || j.bankTxn || !j.lines.some((l) => l.accountId === t.accountId && l.foreignMinor === t.amountMinor)) back(bankPath(t), "That entry doesn't match this line");
  await db.hqBankTxn.update({ where: { id: t.id }, data: { status: "MATCHED", journalId: j!.id } });
  await hqAudit(h, "bank.match", { txnId: t.id });
  revalidatePath(bankPath(t));
}

/** Puts a statement line straight to an account (bank fees, a subscription, interest, a transfer). */
export async function createFromTxn(f: FormData) {
  const h = await requireHq("accounts.edit");
  const t = await txnFor(f);
  if (!t) return;
  const other = await db.hqAccount.findFirst({ where: { id: str(f, "accountId", 40), archived: false, NOT: { id: t.accountId } } });
  if (!other) back(bankPath(t), "Choose what this line was for");
  if (other!.isBank && other!.currency !== t.account.currency) back(bankPath(t), "A transfer between bank accounts in different currencies needs a manual journal");
  const rate = t.account.currency === "GBP" ? 1 : await documentRate(t.account.currency, str(f, "perGbp", 30), t.date);
  if (typeof rate === "string") back(bankPath(t), rate as string);
  const gbp = toGbpPence(t.amountMinor, t.account.currency, rate as number);
  const description = str(f, "description", 200) || t.description;
  const lines = bankLineJournal({ gbpPence: gbp, foreignMinor: t.amountMinor, bank: { id: t.accountId }, other: { id: other!.id }, description });
  if (other!.isBank) lines[1] = { ...lines[1], foreignMinor: -t.amountMinor };
  const msg = await locked(() => db.$transaction(async (tx) => {
    const j = await postHq(tx, { date: t.date, source: "BANK", sourceId: t.id, reference: null, memo: description, userId: h.userId, lines });
    if (j) await tx.hqBankTxn.update({ where: { id: t.id }, data: { status: "MATCHED", journalId: j.id } });
  }));
  if (msg) back(bankPath(t), msg);
  await hqAudit(h, "bank.create", { txnId: t.id });
  revalidatePath(bankPath(t));
}

/** Money in on the statement is a client paying an invoice: records the payment and matches it. */
export async function receiveTxn(f: FormData) {
  const h = await requireHq("payments.edit");
  const t = await txnFor(f);
  if (!t || t.amountMinor <= 0) return;
  const inv = await db.hqInvoice.findUnique({ where: { id: str(f, "invoiceId", 40) } });
  if (!inv || (inv.status !== "SENT" && inv.status !== "PARTIAL")) back(bankPath(t), "Choose an unpaid invoice");
  const i = inv!;
  const rate = await documentRate(i.currency, "", t.date);
  if (typeof rate === "string") back(bankPath(t), rate as string);
  // The amount against the invoice is in its currency: the bank line itself if they match, otherwise the GBP converted.
  let amount: number, gbp: number;
  if (t.account.currency === i.currency) { amount = t.amountMinor; gbp = toGbpPence(amount, i.currency, rate as number); }
  else if (t.account.currency === "GBP") { gbp = t.amountMinor; amount = Math.round((gbp / 100) * (rate as number) * 10 ** minorDigits(i.currency)); }
  else return back(bankPath(t), `This account is in ${t.account.currency} and the invoice is in ${i.currency}`);
  amount = Math.min(amount, i.totalMinor - i.paidMinor);
  if (amount <= 0) back(bankPath(t), "Nothing is left to pay on that invoice");
  const msg = await locked(() => db.$transaction(async (tx) => {
    const p = await tx.hqPayment.create({ data: { invoiceId: i.id, date: t.date, amountMinor: amount, perGbp: rate as number, gbpPence: gbp, method: "BANK", bankAccountId: t.accountId, reference: t.description.slice(0, 120), userId: h.userId } });
    await settleInvoice(tx, i.id);
    await postPayment(tx, p.id, h.userId);
    const j = await tx.hqJournal.findUniqueOrThrow({ where: { source_sourceId: { source: "PAYMENT", sourceId: p.id } } });
    await tx.hqBankTxn.update({ where: { id: t.id }, data: { status: "MATCHED", journalId: j.id } });
  }));
  if (msg) back(bankPath(t), msg);
  await hqAudit(h, "bank.receive", { txnId: t.id, invoiceId: i.id });
  revalidatePath(bankPath(t));
}

/** Money out on the statement is paying a supplier's bill: records the payment and matches it. */
export async function payFromTxn(f: FormData) {
  const h = await requireHq("accounts.edit");
  const t = await txnFor(f);
  if (!t || t.amountMinor >= 0) return;
  const b = await db.hqBill.findUnique({ where: { id: str(f, "billId", 40) } });
  if (!b || (b.status !== "OPEN" && b.status !== "PARTIAL")) back(bankPath(t), "Choose an unpaid bill");
  const bill = b!;
  const out = -t.amountMinor;
  const rate = await documentRate(bill.currency, "", t.date);
  if (typeof rate === "string") back(bankPath(t), rate as string);
  let amount: number, gbp: number;
  if (t.account.currency === bill.currency) { amount = out; gbp = toGbpPence(amount, bill.currency, rate as number); }
  else if (t.account.currency === "GBP") { gbp = out; amount = Math.round((gbp / 100) * (rate as number) * 10 ** minorDigits(bill.currency)); }
  else return back(bankPath(t), `This account is in ${t.account.currency} and the bill is in ${bill.currency}`);
  amount = Math.min(amount, bill.totalMinor - bill.paidMinor);
  if (amount <= 0) back(bankPath(t), "Nothing is left to pay on that bill");
  const msg = await locked(() => db.$transaction(async (tx) => {
    const p = await tx.hqBillPayment.create({ data: { billId: bill.id, date: t.date, amountMinor: amount, perGbp: rate as number, gbpPence: gbp, bankAccountId: t.accountId, reference: t.description.slice(0, 120), userId: h.userId } });
    await postBillPayment(tx, p.id, h.userId);
    await settleBill(tx, bill.id);
    const j = await tx.hqJournal.findUniqueOrThrow({ where: { source_sourceId: { source: "BILL_PAYMENT", sourceId: p.id } } });
    await tx.hqBankTxn.update({ where: { id: t.id }, data: { status: "MATCHED", journalId: j.id } });
  }));
  if (msg) back(bankPath(t), msg);
  await hqAudit(h, "bank.pay", { txnId: t.id, billId: bill.id });
  revalidatePath(bankPath(t));
}

export async function ignoreTxn(f: FormData) {
  const h = await requireHq("accounts.edit");
  const t = await db.hqBankTxn.findUnique({ where: { id: str(f, "txnId", 40) } });
  if (!t) return;
  const undo = t.status === "IGNORED";
  if (t.status === "MATCHED") return;
  await db.hqBankTxn.update({ where: { id: t.id }, data: { status: undo ? "UNMATCHED" : "IGNORED" } });
  await hqAudit(h, undo ? "bank.unignore" : "bank.ignore", { txnId: t.id });
  revalidatePath(bankPath(t));
}

/** Un-ticks a matched line. If the entry was made from the line itself, that entry is removed too. */
export async function unmatchTxn(f: FormData) {
  const h = await requireHq("accounts.edit");
  const t = await db.hqBankTxn.findUnique({ where: { id: str(f, "txnId", 40) }, include: { journal: true } });
  if (!t || t.status !== "MATCHED") return;
  const msg = await locked(() => db.$transaction(async (tx) => {
    if (t.journal?.source === "BANK") await unpostHq(tx, "BANK", t.id);
    await tx.hqBankTxn.update({ where: { id: t.id }, data: { status: "UNMATCHED", journalId: null } });
  }));
  if (msg) back(bankPath(t), msg);
  await hqAudit(h, "bank.unmatch", { txnId: t.id });
  revalidatePath(bankPath(t));
}
