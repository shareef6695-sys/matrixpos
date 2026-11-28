"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { audit } from "@/lib/server/till";
import { ensureChart, post, postBill, postBillPayment, catchUpSales } from "@/lib/server/accounting";
import { splitVat } from "@/lib/accounting/ledger";
import { VAT_RATES, type VatCode } from "@/lib/pos/vat";
import { parseGBP } from "@/lib/pos/money";
import type { FormState } from "./auth";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const ukDate = (v: string) => (v ? new Date(`${v}T12:00:00Z`) : new Date());

async function ownAccount(orgId: string, id: string, opts: { bank?: boolean } = {}) {
  if (!id) return null;
  return db.ledgerAccount.findFirst({ where: { id, organizationId: orgId, archived: false, ...(opts.bank ? { isBank: true } : {}) } });
}

/** Supplier bill or expense. Amount can be entered including or excluding VAT. Optionally paid straight away. */
export async function saveBill(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireAdmin();
  await ensureChart(s.orgId);
  const account = await ownAccount(s.orgId, str(f, "accountId"));
  if (!account) return { error: "Choose what it was for" };
  const amount = parseGBP(str(f, "amount"));
  if (amount == null || amount <= 0) return { error: "Enter the amount" };
  const vatCode = (["STANDARD", "REDUCED", "ZERO", "EXEMPT"].includes(str(f, "vatCode")) ? str(f, "vatCode") : "STANDARD") as VatCode;
  const rate = VAT_RATES[vatCode];
  let netPence: number, vatPence: number;
  if (str(f, "amountIncludes") === "net") { netPence = amount; vatPence = Math.round((amount * rate) / 10000); }
  else ({ netPence, vatPence } = splitVat(amount, rate));
  if (str(f, "vatOverride")) {
    const v = parseGBP(str(f, "vatOverride"));
    if (v == null || v < 0) return { error: "VAT amount is not valid" };
    if (str(f, "amountIncludes") === "net") vatPence = v; else { netPence = amount - v; vatPence = v; }
  }
  const grossPence = netPence + vatPence;
  const supplier = str(f, "supplierId") ? await db.supplier.findFirst({ where: { id: str(f, "supplierId"), organizationId: s.orgId } }) : null;
  const payee = str(f, "payee") || supplier?.name;
  if (!payee) return { error: "Enter who it's from" };
  const po = str(f, "purchaseOrderId") ? await db.purchaseOrder.findFirst({ where: { id: str(f, "purchaseOrderId"), organizationId: s.orgId }, select: { id: true } }) : null;
  const paidFrom = str(f, "paidFromId") ? await ownAccount(s.orgId, str(f, "paidFromId"), { bank: true }) : null;
  const date = ukDate(str(f, "date"));

  await db.$transaction(async (tx) => {
    const bill = await tx.bill.create({
      data: {
        organizationId: s.orgId, supplierId: supplier?.id ?? null, payee, date, dueDate: str(f, "dueDate") ? ukDate(str(f, "dueDate")) : null,
        reference: str(f, "reference") || null, accountId: account.id, vatCode, netPence, vatPence, grossPence,
        purchaseOrderId: po?.id ?? null, notes: str(f, "notes") || null,
        ...(paidFrom ? { paidAt: date, paidFromId: paidFrom.id } : {}),
      },
    });
    await postBill(tx, s.orgId, bill, s.userId);
    if (paidFrom) await postBillPayment(tx, s.orgId, bill, paidFrom.id, date, s.userId);
  });
  revalidatePath("/admin/accounts");
  return { ok: `Saved ${payee} for £${(grossPence / 100).toFixed(2)}${paidFrom ? `, paid from ${paidFrom.name}` : ", awaiting payment"}.` };
}

export async function payBill(f: FormData) {
  const s = await requireAdmin();
  const bill = await db.bill.findFirst({ where: { id: str(f, "id"), organizationId: s.orgId, paidAt: null } });
  const from = await ownAccount(s.orgId, str(f, "paidFromId"), { bank: true });
  if (!bill || !from) return;
  const date = ukDate(str(f, "date"));
  await db.$transaction(async (tx) => {
    await tx.bill.update({ where: { id: bill.id }, data: { paidAt: date, paidFromId: from.id } });
    await postBillPayment(tx, s.orgId, bill, from.id, date, s.userId);
  });
  revalidatePath("/admin/accounts");
}

/**
 * Money moves: banking till cash, card settlements reaching the bank, owner putting money in or taking drawings,
 * card fees. Every one is a simple two-line journal from one account to another.
 */
export async function moveMoney(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireAdmin();
  const from = await ownAccount(s.orgId, str(f, "fromId"));
  const to = await ownAccount(s.orgId, str(f, "toId"));
  const amount = parseGBP(str(f, "amount"));
  if (!from || !to || from.id === to.id) return { error: "Choose two different accounts" };
  if (amount == null || amount <= 0) return { error: "Enter the amount" };
  const memo = str(f, "memo") || `${from.name} to ${to.name}`;
  await post(db, s.orgId, {
    date: ukDate(str(f, "date")), source: "TRANSFER", memo, userId: s.userId, reference: str(f, "reference") || null,
    lines: [
      { accountId: to.id, debit: amount, credit: 0, description: memo },
      { accountId: from.id, debit: 0, credit: amount, description: memo },
    ],
  });
  revalidatePath("/admin/accounts");
  return { ok: `Recorded £${(amount / 100).toFixed(2)}: ${memo}` };
}

/** Manual journal for opening balances and corrections. Lines come as acct_N / dr_N / cr_N fields. */
export async function manualJournal(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireAdmin("OWNER");
  const lines = [];
  for (let i = 0; i < 12; i++) {
    const acct = str(f, `acct_${i}`);
    if (!acct) continue;
    const debit = parseGBP(str(f, `dr_${i}`) || "0") ?? NaN;
    const credit = parseGBP(str(f, `cr_${i}`) || "0") ?? NaN;
    if (Number.isNaN(debit) || Number.isNaN(credit) || debit < 0 || credit < 0) return { error: `Line ${i + 1}: amounts must be positive numbers` };
    if (!debit && !credit) continue;
    if (!(await ownAccount(s.orgId, acct))) return { error: `Line ${i + 1}: unknown account` };
    lines.push({ accountId: acct, debit, credit, description: str(f, `desc_${i}`) || undefined });
  }
  if (lines.length < 2) return { error: "A journal needs at least two lines" };
  const d = lines.reduce((a, l) => a + l.debit, 0), c = lines.reduce((a, l) => a + l.credit, 0);
  if (d !== c) return { error: `Debits (£${(d / 100).toFixed(2)}) must equal credits (£${(c / 100).toFixed(2)})` };
  await post(db, s.orgId, { date: ukDate(str(f, "date")), source: "MANUAL", memo: str(f, "memo") || "Manual journal", reference: str(f, "reference") || null, userId: s.userId, lines });
  await audit(s.orgId, s.userId, "journal.manual", { total: d });
  revalidatePath("/admin/accounts");
  return { ok: "Journal posted" };
}

export async function saveLedgerAccount(f: FormData) {
  const s = await requireAdmin("OWNER");
  await ensureChart(s.orgId);
  const id = str(f, "id");
  const name = str(f, "name");
  if (!name) return;
  if (id) {
    await db.ledgerAccount.updateMany({ where: { id, organizationId: s.orgId }, data: { name, archived: f.get("archived") === "on" } });
  } else {
    const code = str(f, "code").replace(/\D/g, "").slice(0, 6);
    const type = str(f, "type") as "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
    if (!code || !["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"].includes(type)) return;
    await db.ledgerAccount.create({ data: { organizationId: s.orgId, code, name, type, isBank: type === "ASSET" && f.get("isBank") === "on" } }).catch(() => {});
  }
  revalidatePath("/admin/accounts/chart");
}

export async function postMissingSales() {
  const s = await requireAdmin();
  await catchUpSales(s.orgId);
  revalidatePath("/admin/accounts");
}
