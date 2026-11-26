import "server-only";
import type { Prisma, PrismaClient, JournalSource } from "@prisma/client";
import { db } from "./db";
import {
  DEFAULT_CHART, balanceOf, isBalanced, saleJournal, reverse, stockAdjustmentJournal, cashMovementJournal,
  cashOverShortJournal, billJournal, billPaymentJournal, type JLine, type SystemKey, type AccountType,
} from "@/lib/accounting/ledger";

type Tx = Prisma.TransactionClient | PrismaClient;

/** Creates the default chart of accounts for a business if it doesn't have one yet. */
export async function ensureChart(orgId: string, tx: Tx = db) {
  const existing = await tx.ledgerAccount.count({ where: { organizationId: orgId } });
  if (existing > 0) return;
  await tx.ledgerAccount.createMany({
    data: DEFAULT_CHART.map((a) => ({ organizationId: orgId, code: a.code, name: a.name, type: a.type, systemKey: a.systemKey ?? null, isBank: a.isBank ?? false })),
    skipDuplicates: true,
  });
}

async function accountingOn(orgId: string, tx: Tx) {
  const s = await tx.orgSettings.findUnique({ where: { organizationId: orgId }, select: { enableAccounting: true } });
  return s?.enableAccounting !== false;
}

/** Writes a balanced journal. Idempotent per (source, sourceId). Returns false if accounting is off. */
export async function post(tx: Tx, orgId: string, j: {
  date: Date; source: JournalSource; sourceId?: string | null; reference?: string | null; memo?: string | null; userId?: string | null; lines: JLine[];
}) {
  if (!j.lines.length || !(await accountingOn(orgId, tx))) return false;
  if (!isBalanced(j.lines)) throw new Error("Journal does not balance");
  await ensureChart(orgId, tx);
  if (j.sourceId) {
    const dup = await tx.journalEntry.findUnique({ where: { organizationId_source_sourceId: { organizationId: orgId, source: j.source, sourceId: j.sourceId } } });
    if (dup) return true;
  }
  const keys = [...new Set(j.lines.map((l) => l.key).filter(Boolean))] as SystemKey[];
  const accounts = await tx.ledgerAccount.findMany({ where: { organizationId: orgId, systemKey: { in: keys } } });
  const byKey = new Map(accounts.map((a) => [a.systemKey, a.id]));
  const lines = j.lines.map((l) => {
    const accountId = l.accountId ?? byKey.get(l.key!);
    if (!accountId) throw new Error(`Missing ledger account for ${l.key}`);
    return { accountId, debitPence: l.debit, creditPence: l.credit, description: l.description ?? null };
  });
  await tx.journalEntry.create({
    data: { organizationId: orgId, date: j.date, source: j.source, sourceId: j.sourceId ?? null, reference: j.reference ?? null, memo: j.memo ?? null, userId: j.userId ?? null, lines: { create: lines } },
  });
  return true;
}

/** Posts a completed sale or refund, including cost of goods sold at current cost prices. */
export async function postSale(tx: Tx, orgId: string, saleId: string) {
  const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { payments: true, lines: { include: { product: { select: { costPence: true, unit: true } } } } } });
  if (!sale) return;
  const costPence = sale.lines.reduce((a, l) => {
    const c = l.product?.costPence;
    if (c == null) return a;
    return a + Math.round(l.product!.unit === "PER_KG" ? (c * l.quantity) / 1000 : c * l.quantity);
  }, 0);
  await post(tx, orgId, {
    date: sale.createdAt, source: "SALE", sourceId: sale.id, reference: sale.receiptNo, memo: sale.kind === "REFUND" ? "Refund" : "Sale",
    lines: saleJournal({ totalPence: sale.totalPence, vatPence: sale.vatPence, changePence: sale.changePence, payments: sale.payments, costPence }),
  });
}

export async function postSaleVoid(tx: Tx, orgId: string, saleId: string, userId: string) {
  const original = await tx.journalEntry.findUnique({ where: { organizationId_source_sourceId: { organizationId: orgId, source: "SALE", sourceId: saleId } }, include: { lines: true } });
  if (!original) return;
  await post(tx, orgId, {
    date: new Date(), source: "SALE_VOID", sourceId: saleId, reference: original.reference, memo: "Sale voided", userId,
    lines: reverse(original.lines.map((l) => ({ accountId: l.accountId, debit: l.debitPence, credit: l.creditPence, description: l.description ?? undefined }))),
  });
}

export async function postStockAdjustment(tx: Tx, orgId: string, movementId: string, valuePence: number, memo: string, userId: string) {
  await post(tx, orgId, { date: new Date(), source: "STOCK", sourceId: movementId, memo, userId, lines: stockAdjustmentJournal(valuePence) });
}

export async function postCashMovement(tx: Tx, orgId: string, movementId: string, amountPence: number, memo: string, userId: string) {
  await post(tx, orgId, { date: new Date(), source: "CASH", sourceId: movementId, memo, userId, lines: cashMovementJournal(amountPence) });
}

export async function postShiftClose(tx: Tx, orgId: string, shiftId: string, diffPence: number, zNumber: number, userId: string) {
  await post(tx, orgId, { date: new Date(), source: "SHIFT", sourceId: shiftId, reference: `Z${zNumber}`, memo: "Till close", userId, lines: cashOverShortJournal(diffPence) });
}

export async function postBill(tx: Tx, orgId: string, bill: { id: string; date: Date; reference: string | null; payee: string; accountId: string; netPence: number; vatPence: number; grossPence: number }, userId: string) {
  await post(tx, orgId, { date: bill.date, source: "BILL", sourceId: bill.id, reference: bill.reference, memo: bill.payee, userId, lines: billJournal(bill) });
}

export async function postBillPayment(tx: Tx, orgId: string, bill: { id: string; reference: string | null; payee: string; grossPence: number }, paidFromId: string, date: Date, userId: string) {
  await post(tx, orgId, { date, source: "BILL_PAYMENT", sourceId: bill.id, reference: bill.reference, memo: `Paid ${bill.payee}`, userId, lines: billPaymentJournal(bill.grossPence, paidFromId) });
}

/** Posts any completed sales that aren't in the ledger yet (e.g. made before Accounts was switched on). */
export async function catchUpSales(orgId: string) {
  await ensureChart(orgId);
  const missing = await db.sale.findMany({
    where: { organizationId: orgId, status: "COMPLETED" },
    select: { id: true },
  });
  const posted = new Set((await db.journalEntry.findMany({ where: { organizationId: orgId, source: "SALE" }, select: { sourceId: true } })).map((j) => j.sourceId));
  let n = 0;
  for (const s of missing) if (!posted.has(s.id)) { await postSale(db, orgId, s.id); n++; }
  return n;
}

// ---------------- Reports ----------------

export interface AccountBalance { id: string; code: string; name: string; type: AccountType; systemKey: string | null; isBank: boolean; debit: number; credit: number; balance: number }

/** Debit/credit totals per account, for journals dated in [from, to). Either bound may be omitted. */
export async function balances(orgId: string, range: { gte?: Date; lt?: Date } = {}): Promise<AccountBalance[]> {
  await ensureChart(orgId);
  const accounts = await db.ledgerAccount.findMany({ where: { organizationId: orgId }, orderBy: { code: "asc" } });
  const sums = await db.journalLine.groupBy({
    by: ["accountId"],
    where: { entry: { organizationId: orgId, date: range } },
    _sum: { debitPence: true, creditPence: true },
  });
  const m = new Map(sums.map((s) => [s.accountId, s._sum]));
  return accounts.map((a) => {
    const debit = m.get(a.id)?.debitPence ?? 0;
    const credit = m.get(a.id)?.creditPence ?? 0;
    return { id: a.id, code: a.code, name: a.name, type: a.type, systemKey: a.systemKey, isBank: a.isBank, debit, credit, balance: balanceOf(a.type, debit, credit) };
  });
}

export async function profitAndLoss(orgId: string, range: { gte: Date; lt: Date }) {
  const b = await balances(orgId, range);
  const income = b.filter((a) => a.type === "INCOME" && a.balance !== 0);
  const cos = b.filter((a) => a.type === "EXPENSE" && (a.systemKey === "COST_OF_SALES" || a.systemKey === "STOCK_LOSS") && a.balance !== 0);
  const overheads = b.filter((a) => a.type === "EXPENSE" && a.systemKey !== "COST_OF_SALES" && a.systemKey !== "STOCK_LOSS" && a.balance !== 0);
  const totalIncome = income.reduce((x, a) => x + a.balance, 0);
  const totalCos = cos.reduce((x, a) => x + a.balance, 0);
  const totalOverheads = overheads.reduce((x, a) => x + a.balance, 0);
  return { income, cos, overheads, totalIncome, totalCos, grossProfit: totalIncome - totalCos, totalOverheads, netProfit: totalIncome - totalCos - totalOverheads };
}

export async function balanceSheet(orgId: string, asAt: Date) {
  const b = await balances(orgId, { lt: asAt });
  const pick = (t: AccountType) => b.filter((a) => a.type === t && a.balance !== 0);
  const profit = b.filter((a) => a.type === "INCOME").reduce((x, a) => x + a.balance, 0) - b.filter((a) => a.type === "EXPENSE").reduce((x, a) => x + a.balance, 0);
  const assets = pick("ASSET"), liabilities = pick("LIABILITY"), equity = pick("EQUITY");
  const totalAssets = assets.reduce((x, a) => x + a.balance, 0);
  const totalLiabilities = liabilities.reduce((x, a) => x + a.balance, 0);
  const totalEquity = equity.reduce((x, a) => x + a.balance, 0) + profit;
  return { assets, liabilities, equity, profit, totalAssets, totalLiabilities, totalEquity, netAssets: totalAssets - totalLiabilities };
}

/** HMRC VAT return boxes for a period (standard accounting, not cash or flat rate scheme). */
export async function vatReturn(orgId: string, range: { gte: Date; lt: Date }) {
  const b = await balances(orgId, range);
  const by = (k: string) => b.find((a) => a.systemKey === k);
  const box1 = by("VAT_OUTPUT")?.balance ?? 0;
  const box4 = -(by("VAT_INPUT")?.balance ?? 0); // input VAT is a debit on a liability account
  const box6 = b.filter((a) => a.type === "INCOME").reduce((x, a) => x + a.balance, 0);
  const bills = await db.bill.aggregate({ where: { organizationId: orgId, date: range }, _sum: { netPence: true } });
  const box7 = bills._sum.netPence ?? 0;
  const pounds = (p: number) => Math.trunc(p / 100); // boxes 6-9 are whole pounds
  return { box1, box2: 0, box3: box1, box4, box5: box1 - box4, box6: pounds(box6), box7: pounds(box7), box8: 0, box9: 0 };
}
