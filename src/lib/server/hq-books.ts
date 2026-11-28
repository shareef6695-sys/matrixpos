import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "./db";
import {
  HQ_CHART, balanceOf, billJournal, creditNoteJournal, incomeKeyFor, invoiceJournal, isBalanced, receiptJournal, reverse, supplierPaymentJournal,
  type Balance, type HqKey, type HqLineDraft,
} from "@/lib/hq/books";
import { fmtDate } from "@/lib/dates";

type Tx = Prisma.TransactionClient | PrismaClient;

/** Thrown when something would change a period that has been locked. Its message is safe to show. */
export class HqLockedError extends Error {}

export async function ensureHqChart(tx: Tx = db) {
  const existing = await tx.hqAccount.findMany({ select: { code: true, systemKey: true } });
  if (!existing.length) {
    await tx.hqAccount.createMany({
      data: HQ_CHART.map((a) => ({ code: a.code, name: a.name, type: a.type, systemKey: a.key ?? null, isBank: a.isBank ?? false })),
      skipDuplicates: true,
    });
    return;
  }
  // Books made before an automatic account was added get it now (or the account with its code is marked as it).
  const keys = new Set(existing.map((a) => a.systemKey));
  for (const a of HQ_CHART.filter((x) => x.key && !keys.has(x.key))) {
    if (existing.some((e) => e.code === a.code)) await tx.hqAccount.updateMany({ where: { code: a.code, systemKey: null }, data: { systemKey: a.key } });
    else await tx.hqAccount.create({ data: { code: a.code, name: a.name, type: a.type, systemKey: a.key, isBank: a.isBank ?? false } });
  }
}

export async function lockDate(tx: Tx = db) {
  return (await tx.hqSettings.findUnique({ where: { id: "hq" } }))?.lockDate ?? null;
}

/** Refuses any date on or before the lock date. */
export async function assertOpen(date: Date, tx: Tx = db) {
  const lock = await lockDate(tx);
  if (lock && date.getTime() < lock.getTime() + 86_400_000)
    throw new HqLockedError(`The books are locked up to ${fmtDate(lock)}, so nothing dated ${fmtDate(date)} can be added or changed. Unlock it under Books → Lock date first.`);
}

/**
 * Writes a balanced journal. Does nothing if one already exists for this source. `yearEnd` is for the Corporation
 * Tax and closing journals only: they finalise a year that the lock date may already cover (filing a VAT return
 * locks the books), and they don't touch VAT.
 */
export async function postHq(tx: Tx, j: { date: Date; source: string; sourceId: string; reference?: string | null; memo?: string | null; userId?: string | null; lines: HqLineDraft[]; yearEnd?: boolean }) {
  if (!j.lines.length) return null;
  if (!isBalanced(j.lines)) throw new Error(`HQ journal ${j.source} ${j.sourceId} does not balance`);
  if (await tx.hqJournal.findUnique({ where: { source_sourceId: { source: j.source, sourceId: j.sourceId } } })) return null;
  if (!j.yearEnd) await assertOpen(j.date, tx);
  await ensureHqChart(tx);
  const keys = [...new Set(j.lines.flatMap((l) => ("key" in l.account ? [l.account.key] : [])))];
  const byKey = new Map((await tx.hqAccount.findMany({ where: { systemKey: { in: keys } } })).map((a) => [a.systemKey, a.id]));
  const lines = j.lines.map((l) => {
    const accountId = "id" in l.account ? l.account.id : byKey.get(l.account.key);
    if (!accountId) throw new Error(`HQ account missing for ${"key" in l.account ? l.account.key : "?"}`);
    return { accountId, debitPence: l.debit, creditPence: l.credit, description: l.description ?? null, foreignMinor: l.foreignMinor ?? null };
  });
  return tx.hqJournal.create({ data: { date: j.date, source: j.source, sourceId: j.sourceId, reference: j.reference ?? null, memo: j.memo ?? null, userId: j.userId ?? null, lines: { create: lines } } });
}

/** Removes a document's journal (when a payment is deleted or a sent invoice is changed). Refused in a locked period. */
export async function unpostHq(tx: Tx, source: string, sourceId: string, opts: { yearEnd?: boolean } = {}) {
  const j = await tx.hqJournal.findUnique({ where: { source_sourceId: { source, sourceId } } });
  if (!j) return;
  if (!opts.yearEnd) await assertOpen(j.date, tx);
  await tx.hqBankTxn.updateMany({ where: { journalId: j.id }, data: { status: "UNMATCHED", journalId: null } });
  await tx.hqJournal.delete({ where: { id: j.id } });
}

/** The bank account money goes in or out of: the one chosen, or the main business account. */
export async function bankAccount(tx: Tx, id: string | null | undefined) {
  await ensureHqChart(tx);
  const a = id ? await tx.hqAccount.findFirst({ where: { id, isBank: true } }) : await tx.hqAccount.findFirst({ where: { systemKey: "BANK" } });
  return a ?? (await tx.hqAccount.findFirst({ where: { isBank: true, archived: false }, orderBy: { code: "asc" } }));
}

/** How much a payment is in the bank account's own currency, or null if the currencies can't be paired. */
export function bankAmount(bankCurrency: string, docCurrency: string, amountMinor: number, gbpPence: number) {
  if (bankCurrency === docCurrency) return amountMinor;
  if (bankCurrency === "GBP") return gbpPence;
  return null;
}

async function lineAccounts(tx: Tx, lines: { itemId: string | null; amountMinor: number }[]) {
  const items = await tx.hqItem.findMany({ where: { id: { in: lines.map((l) => l.itemId).filter((x): x is string => !!x) } }, select: { id: true, kind: true, sku: true, incomeAccountId: true } });
  const m = new Map(items.map((i) => [i.id, i]));
  return lines.map((l) => {
    const it = l.itemId ? m.get(l.itemId) : undefined;
    const account: HqLineDraft["account"] = it?.incomeAccountId ? { id: it.incomeAccountId } : { key: incomeKeyFor(it?.kind, it?.sku) as HqKey };
    return { account, amountMinor: l.amountMinor };
  });
}

export async function postInvoice(tx: Tx, id: string, userId?: string | null) {
  const inv = await tx.hqInvoice.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, client: { select: { name: true } } } });
  if (inv.status === "DRAFT") return;
  await postHq(tx, {
    date: inv.issueDate, source: "INVOICE", sourceId: inv.id, reference: inv.number, memo: `Invoice to ${inv.client.name}`, userId,
    lines: invoiceJournal({ currency: inv.currency, perGbp: Number(inv.perGbp), totalMinor: inv.totalMinor, taxMinor: inv.taxMinor, lines: await lineAccounts(tx, inv.lines) }),
  });
  if (inv.status === "VOID") await postInvoiceVoid(tx, id, userId);
}

/** A voided invoice is reversed on the day it was voided, so the original stays in the books. */
export async function postInvoiceVoid(tx: Tx, id: string, userId?: string | null) {
  const inv = await tx.hqInvoice.findUniqueOrThrow({ where: { id } });
  const orig = await tx.hqJournal.findUnique({ where: { source_sourceId: { source: "INVOICE", sourceId: id } }, include: { lines: true } });
  if (!orig) return;
  await postHq(tx, {
    date: inv.voidedAt ?? new Date(), source: "INVOICE_VOID", sourceId: id, reference: inv.number, memo: `Invoice ${inv.number} voided`, userId,
    lines: reverse(orig.lines.map((l) => ({ account: { id: l.accountId }, debit: l.debitPence, credit: l.creditPence, description: l.description ?? undefined }))),
  });
}

export async function postPayment(tx: Tx, id: string, userId?: string | null) {
  const p = await tx.hqPayment.findUniqueOrThrow({ where: { id }, include: { invoice: true } });
  if (p.creditNoteId) return; // a credit note applied to the invoice: the credit note itself is in the books
  const bank = await bankAccount(tx, p.bankAccountId);
  if (!bank) throw new Error("No bank account in the HQ books");
  const foreign = bankAmount(bank.currency, p.invoice.currency, p.amountMinor, p.gbpPence) ?? p.gbpPence;
  await postHq(tx, {
    date: p.date, source: "PAYMENT", sourceId: p.id, reference: p.invoice.number, memo: `Payment for ${p.invoice.number}${p.reference ? ` (${p.reference})` : ""}`, userId,
    lines: receiptJournal({ amountMinor: p.amountMinor, currency: p.invoice.currency, invoicePerGbp: Number(p.invoice.perGbp), gbpPence: p.gbpPence, bank: { id: bank.id }, bankForeignMinor: foreign }),
  });
}

export async function postCreditNote(tx: Tx, id: string, userId?: string | null) {
  const c = await tx.hqCreditNote.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, invoice: { select: { number: true } } } });
  await postHq(tx, {
    date: c.date, source: "CREDIT_NOTE", sourceId: c.id, reference: c.number, memo: `Credit note against ${c.invoice.number}`, userId,
    lines: creditNoteJournal({ currency: c.currency, perGbp: Number(c.perGbp), totalMinor: c.totalMinor, taxMinor: c.taxMinor, lines: await lineAccounts(tx, c.lines) }),
  });
}

export async function postBill(tx: Tx, id: string, userId?: string | null) {
  const b = await tx.hqBill.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } });
  await postHq(tx, {
    date: b.date, source: "BILL", sourceId: b.id, reference: b.reference, memo: `${b.isExpense ? "Expense" : "Bill"}: ${b.payee}`, userId,
    lines: billJournal({ currency: b.currency, perGbp: Number(b.perGbp), totalMinor: b.totalMinor, taxMinor: b.taxMinor, lines: b.lines.map((l) => ({ account: { id: l.accountId }, amountMinor: l.netMinor })) }),
  });
  if (b.status === "VOID") {
    const orig = await tx.hqJournal.findUnique({ where: { source_sourceId: { source: "BILL", sourceId: id } }, include: { lines: true } });
    if (orig) await postHq(tx, {
      date: b.voidedAt ?? new Date(), source: "BILL_VOID", sourceId: id, reference: b.reference, memo: `Bill from ${b.payee} voided`, userId,
      lines: reverse(orig.lines.map((l) => ({ account: { id: l.accountId }, debit: l.debitPence, credit: l.creditPence }))),
    });
  }
}

export async function postBillPayment(tx: Tx, id: string, userId?: string | null) {
  const p = await tx.hqBillPayment.findUniqueOrThrow({ where: { id }, include: { bill: true } });
  const bank = await bankAccount(tx, p.bankAccountId);
  if (!bank) throw new Error("No bank account in the HQ books");
  const foreign = bankAmount(bank.currency, p.bill.currency, p.amountMinor, p.gbpPence) ?? p.gbpPence;
  await postHq(tx, {
    date: p.date, source: "BILL_PAYMENT", sourceId: p.id, reference: p.bill.reference, memo: `Paid ${p.bill.payee}`, userId,
    lines: supplierPaymentJournal({ amountMinor: p.amountMinor, currency: p.bill.currency, billPerGbp: Number(p.bill.perGbp), gbpPence: p.gbpPence, bank: { id: bank.id }, bankForeignMinor: foreign }),
  });
}

/**
 * MatrixPOS subscription invoices are Matrix Infotech sales too. Issued: Dr debtors / Cr MatrixPOS subscriptions
 * and VAT. Paid: into the Stripe balance for card payments, otherwise the main bank account. Voided: reversed.
 */
export async function postPosInvoice(tx: Tx, id: string) {
  const i = await tx.subscriptionInvoice.findUniqueOrThrow({ where: { id } });
  await postHq(tx, {
    date: i.issuedAt, source: "POS_INVOICE", sourceId: i.id, reference: i.number, memo: `MatrixPOS: ${i.billToName}`,
    lines: invoiceJournal({ currency: "GBP", perGbp: 1, totalMinor: i.totalPence, taxMinor: i.vatPence, lines: [{ account: { key: "SALES_POS" }, amountMinor: i.netPence }] }),
  });
  if (i.status === "PAID") {
    const bank = await tx.hqAccount.findFirst({ where: { systemKey: i.method === "CARD" ? "PAYMENTS" : "BANK" } }) ?? (await bankAccount(tx, null));
    if (bank) await postHq(tx, {
      date: i.paidAt ?? i.issuedAt, source: "POS_PAYMENT", sourceId: i.id, reference: i.number, memo: `MatrixPOS payment: ${i.billToName}`,
      lines: receiptJournal({ amountMinor: i.totalPence, currency: "GBP", invoicePerGbp: 1, gbpPence: i.totalPence, bank: { id: bank.id }, bankForeignMinor: i.totalPence }),
    });
  }
  if (i.status === "VOID") {
    const orig = await tx.hqJournal.findUnique({ where: { source_sourceId: { source: "POS_INVOICE", sourceId: id } }, include: { lines: true } });
    if (orig) await postHq(tx, {
      date: new Date(), source: "POS_INVOICE_VOID", sourceId: id, reference: i.number, memo: `MatrixPOS invoice ${i.number} cancelled`,
      lines: reverse(orig.lines.map((l) => ({ account: { id: l.accountId }, debit: l.debitPence, credit: l.creditPence }))),
    });
  }
}

/**
 * Brings anything not yet in the books into them: invoices sent before the books existed, their payments, and so on.
 * Safe to run any time; each document is posted once. Documents in a locked period are left as they are.
 */
export async function catchUpBooks() {
  await ensureHqChart();
  const have = async (source: string) => new Set((await db.hqJournal.findMany({ where: { source }, select: { sourceId: true } })).map((j) => j.sourceId));
  const [inv, invVoid, pay, cn, bill, billPay] = await Promise.all(["INVOICE", "INVOICE_VOID", "PAYMENT", "CREDIT_NOTE", "BILL", "BILL_PAYMENT"].map(have));
  let n = 0;
  const run = async (f: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
    try { await db.$transaction(f); n++; } catch (e) { if (!(e instanceof HqLockedError)) throw e; }
  };
  for (const i of await db.hqInvoice.findMany({ where: { status: { not: "DRAFT" } }, select: { id: true, status: true } })) {
    if (!inv.has(i.id) || (i.status === "VOID" && !invVoid.has(i.id))) await run((tx) => postInvoice(tx, i.id));
  }
  for (const p of await db.hqPayment.findMany({ where: { creditNoteId: null }, select: { id: true } })) if (!pay.has(p.id)) await run((tx) => postPayment(tx, p.id));
  for (const c of await db.hqCreditNote.findMany({ where: { status: "ISSUED" }, select: { id: true } })) if (!cn.has(c.id)) await run((tx) => postCreditNote(tx, c.id));
  for (const b of await db.hqBill.findMany({ select: { id: true } })) if (!bill.has(b.id)) await run((tx) => postBill(tx, b.id));
  for (const p of await db.hqBillPayment.findMany({ select: { id: true } })) if (!billPay.has(p.id)) await run((tx) => postBillPayment(tx, p.id));
  // MatrixPOS subscription invoices: a void one that never got into the books is left out entirely.
  const [posInv, posPay, posVoid] = await Promise.all(["POS_INVOICE", "POS_PAYMENT", "POS_INVOICE_VOID"].map(have));
  for (const i of await db.subscriptionInvoice.findMany({ select: { id: true, status: true } })) {
    const needs = i.status === "VOID" ? posInv.has(i.id) && !posVoid.has(i.id) : !posInv.has(i.id) || (i.status === "PAID" && !posPay.has(i.id));
    if (needs) await run((tx) => postPosInvoice(tx, i.id));
  }
  return n;
}

/** Debit and credit totals per account for journals dated in [gte, lt). */
export async function hqBalances(range: { gte?: Date; lt?: Date } = {}, opts: { exclude?: string[] } = {}): Promise<Balance[]> {
  await ensureHqChart();
  const [accounts, sums] = await Promise.all([
    db.hqAccount.findMany({ orderBy: { code: "asc" } }),
    db.hqJournalLine.groupBy({ by: ["accountId"], where: { journal: { date: range, ...(opts.exclude?.length ? { source: { notIn: opts.exclude } } : {}) } }, _sum: { debitPence: true, creditPence: true, foreignMinor: true } }),
  ]);
  const m = new Map(sums.map((s) => [s.accountId, s._sum]));
  return accounts.map((a) => {
    const debit = m.get(a.id)?.debitPence ?? 0, credit = m.get(a.id)?.creditPence ?? 0;
    return { id: a.id, code: a.code, name: a.name, type: a.type, key: a.systemKey, isBank: a.isBank, currency: a.currency, debit, credit, balance: balanceOf(a.type, debit, credit), foreign: m.get(a.id)?.foreignMinor ?? 0 };
  });
}
