// Matrix Infotech's books: chart of accounts, the journals each document makes, and the reports.
// Pure functions, unit tested. Journal amounts are GBP pence and every journal balances.
import { allocate } from "@/lib/pos/money";
import { toGbpPence } from "./money";

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
export type HqKey =
  | "BANK" | "DEBTORS" | "CREDITORS" | "VAT_OUTPUT" | "VAT_INPUT" | "CAPITAL" | "RETAINED"
  | "SALES" | "SALES_WEB" | "SALES_POS" | "SALES_RESALE" | "SALES_SUPPORT" | "SALES_IT" | "OTHER_INCOME"
  | "GENERAL_EXPENSES" | "FX" | "SUSPENSE"
  | "VAT_CONTROL" | "CT_OWED" | "CT_EXPENSE" | "PAYMENTS";

export interface HqChartAccount { code: string; name: string; type: AccountType; key?: HqKey; isBank?: boolean; cos?: boolean }

/** A UK chart of accounts for a small software and IT company. Created the first time HQ's books are opened. */
export const HQ_CHART: HqChartAccount[] = [
  { code: "0030", name: "Computer equipment", type: "ASSET" },
  { code: "0031", name: "Computer equipment depreciation", type: "ASSET" },
  { code: "1100", name: "Trade debtors (clients owe)", type: "ASSET", key: "DEBTORS" },
  { code: "1150", name: "Prepayments", type: "ASSET" },
  { code: "1200", name: "Business current account", type: "ASSET", key: "BANK", isBank: true },
  { code: "1210", name: "Business savings account", type: "ASSET", isBank: true },
  { code: "1250", name: "Stripe and PayPal balances", type: "ASSET", key: "PAYMENTS", isBank: true },
  { code: "2100", name: "Trade creditors (you owe suppliers)", type: "LIABILITY", key: "CREDITORS" },
  { code: "2109", name: "Accruals", type: "LIABILITY" },
  { code: "2200", name: "VAT on sales", type: "LIABILITY", key: "VAT_OUTPUT" },
  { code: "2201", name: "VAT on purchases", type: "LIABILITY", key: "VAT_INPUT" },
  { code: "2202", name: "VAT owed to HMRC (filed returns)", type: "LIABILITY", key: "VAT_CONTROL" },
  { code: "2210", name: "PAYE and National Insurance owed", type: "LIABILITY" },
  { code: "2220", name: "Pension contributions owed", type: "LIABILITY" },
  { code: "2300", name: "Corporation Tax owed", type: "LIABILITY", key: "CT_OWED" },
  { code: "2400", name: "Director's loan account", type: "LIABILITY" },
  { code: "3000", name: "Share capital", type: "EQUITY", key: "CAPITAL" },
  { code: "3100", name: "Retained profit", type: "EQUITY", key: "RETAINED" },
  { code: "3200", name: "Dividends paid", type: "EQUITY" },
  { code: "4000", name: "Custom software and app development", type: "INCOME", key: "SALES" },
  { code: "4010", name: "Websites and online shops", type: "INCOME", key: "SALES_WEB" },
  { code: "4020", name: "MatrixPOS subscriptions", type: "INCOME", key: "SALES_POS" },
  { code: "4030", name: "Third-party software resale", type: "INCOME", key: "SALES_RESALE" },
  { code: "4040", name: "Support, hosting and care plans", type: "INCOME", key: "SALES_SUPPORT" },
  { code: "4050", name: "IT services and consulting", type: "INCOME", key: "SALES_IT" },
  { code: "4900", name: "Other income", type: "INCOME", key: "OTHER_INCOME" },
  { code: "4910", name: "Bank interest received", type: "INCOME" },
  { code: "5000", name: "Third-party software and licences (resold)", type: "EXPENSE", cos: true },
  { code: "5100", name: "Subcontractors and freelancers", type: "EXPENSE", cos: true },
  { code: "5200", name: "Hosting and servers for clients", type: "EXPENSE", cos: true },
  { code: "6000", name: "Salaries", type: "EXPENSE" },
  { code: "6010", name: "Employer's National Insurance", type: "EXPENSE" },
  { code: "6020", name: "Pensions", type: "EXPENSE" },
  { code: "6030", name: "Directors' salaries", type: "EXPENSE" },
  { code: "6100", name: "Rent and office costs", type: "EXPENSE" },
  { code: "6200", name: "Software subscriptions", type: "EXPENSE" },
  { code: "6300", name: "Telephone and internet", type: "EXPENSE" },
  { code: "6400", name: "Advertising and marketing", type: "EXPENSE" },
  { code: "6500", name: "Travel and subsistence", type: "EXPENSE" },
  { code: "6600", name: "Accountancy and legal fees", type: "EXPENSE" },
  { code: "6700", name: "Insurance", type: "EXPENSE" },
  { code: "6800", name: "Bank and payment fees", type: "EXPENSE" },
  { code: "6850", name: "Training and books", type: "EXPENSE" },
  { code: "6900", name: "Depreciation", type: "EXPENSE" },
  { code: "7000", name: "General expenses", type: "EXPENSE", key: "GENERAL_EXPENSES" },
  { code: "7900", name: "Exchange rate gains and losses", type: "EXPENSE", key: "FX" },
  { code: "8000", name: "Corporation Tax", type: "EXPENSE", key: "CT_EXPENSE" },
  { code: "9999", name: "Suspense (to sort out)", type: "ASSET", key: "SUSPENSE" },
];

/** Accounts counted as cost of sales on the P&L (the rest of the expenses are overheads). */
export const COST_OF_SALES_CODES = new Set(HQ_CHART.filter((a) => a.cos).map((a) => a.code));

/** Which income account a catalogue item's sales go to when it has none of its own. */
export function incomeKeyFor(kind: string | null | undefined, sku?: string | null): HqKey {
  if (sku?.startsWith("POS-")) return "SALES_POS";
  if (sku?.startsWith("WEB-") || sku?.startsWith("SHOP-")) return "SALES_WEB";
  if (sku?.startsWith("IT-")) return "SALES_IT";
  if (kind === "THIRD_PARTY") return "SALES_RESALE";
  if (kind === "SUBSCRIPTION") return "SALES_SUPPORT";
  return "SALES";
}

/** A journal line. `account` is either an account id or a system key; foreignMinor is set on bank lines. */
export interface HqLineDraft { account: { id: string } | { key: HqKey }; debit: number; credit: number; description?: string; foreignMinor?: number }

export const isBalanced = (lines: HqLineDraft[]) =>
  lines.reduce((a, l) => a + l.debit, 0) === lines.reduce((a, l) => a + l.credit, 0) && lines.every((l) => l.debit >= 0 && l.credit >= 0);

/** Signed amount to a debit (positive) or credit (negative). */
const signed = (account: HqLineDraft["account"], amount: number, description?: string, foreignMinor?: number): HqLineDraft =>
  amount >= 0 ? { account, debit: amount, credit: 0, description, foreignMinor } : { account, debit: 0, credit: -amount, description, foreignMinor };
const nonZero = (lines: HqLineDraft[]) => lines.filter((l) => l.debit !== 0 || l.credit !== 0 || (l.foreignMinor ?? 0) !== 0);

export const balanceOf = (type: AccountType, debit: number, credit: number) => (type === "ASSET" || type === "EXPENSE" ? debit - credit : credit - debit);

export interface DocForBooks {
  currency: string; perGbp: number; totalMinor: number; taxMinor: number;
  /** Each line's amount after discount (before tax), and where it goes. */
  lines: { account: HqLineDraft["account"]; amountMinor: number }[];
}

/** The GBP split of a document: gross, net per line (adding up exactly) and tax. */
export function gbpSplit(d: DocForBooks) {
  const gross = toGbpPence(d.totalMinor, d.currency, d.perGbp);
  const net = toGbpPence(d.totalMinor - d.taxMinor, d.currency, d.perGbp);
  const parts = allocate(net, d.lines.map((l) => Math.max(0, l.amountMinor)));
  return { gross, net, tax: gross - net, parts };
}

/** Invoice sent: Dr Debtors (gross) / Cr income (net, per line) / Cr VAT on sales. */
export function invoiceJournal(d: DocForBooks): HqLineDraft[] {
  const s = gbpSplit(d);
  return nonZero([
    signed({ key: "DEBTORS" }, s.gross, "Invoice"),
    ...d.lines.map((l, i) => signed(l.account, -s.parts[i])),
    signed({ key: "VAT_OUTPUT" }, -s.tax),
  ]);
}

/** Credit note: the opposite of an invoice (Dr income, Dr VAT / Cr Debtors). */
export const creditNoteJournal = (d: DocForBooks) => reverse(invoiceJournal(d));

/**
 * Money received against an invoice. Debtors is cleared at the invoice's rate, the bank gets what actually
 * arrived (at the rate on the day), and any difference is an exchange gain or loss.
 */
export function receiptJournal(p: { amountMinor: number; currency: string; invoicePerGbp: number; gbpPence: number; bank: HqLineDraft["account"]; bankForeignMinor: number }): HqLineDraft[] {
  const cleared = toGbpPence(p.amountMinor, p.currency, p.invoicePerGbp);
  return nonZero([
    signed(p.bank, p.gbpPence, "Money in", p.bankForeignMinor),
    signed({ key: "DEBTORS" }, -cleared),
    signed({ key: "FX" }, cleared - p.gbpPence, "Exchange difference"),
  ]);
}

/** Supplier bill: Dr expense accounts (net) / Dr VAT on purchases / Cr Creditors (gross). */
export function billJournal(d: DocForBooks): HqLineDraft[] {
  return reverse(invoiceJournal({ ...d })).map((l) =>
    "key" in l.account && l.account.key === "DEBTORS" ? { ...l, account: { key: "CREDITORS" as const } }
    : "key" in l.account && l.account.key === "VAT_OUTPUT" ? { ...l, account: { key: "VAT_INPUT" as const } } : l);
}

/** Paying a supplier: Dr Creditors at the bill's rate / Cr bank at the day's rate, difference to exchange. */
export function supplierPaymentJournal(p: { amountMinor: number; currency: string; billPerGbp: number; gbpPence: number; bank: HqLineDraft["account"]; bankForeignMinor: number }): HqLineDraft[] {
  const cleared = toGbpPence(p.amountMinor, p.currency, p.billPerGbp);
  return nonZero([
    signed({ key: "CREDITORS" }, cleared),
    signed(p.bank, -p.gbpPence, "Money out", -p.bankForeignMinor),
    signed({ key: "FX" }, p.gbpPence - cleared, "Exchange difference"),
  ]);
}

/** A bank statement line put straight to an account: money in credits it, money out debits it. */
export function bankLineJournal(p: { gbpPence: number; foreignMinor: number; bank: HqLineDraft["account"]; other: HqLineDraft["account"]; description: string }): HqLineDraft[] {
  return nonZero([signed(p.bank, p.gbpPence, p.description, p.foreignMinor), signed(p.other, -p.gbpPence, p.description)]);
}

export const reverse = (lines: HqLineDraft[]): HqLineDraft[] =>
  lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit, foreignMinor: l.foreignMinor === undefined ? undefined : -l.foreignMinor }));

// ---------------- Reports ----------------

export interface Balance { id: string; code: string; name: string; type: AccountType; key: string | null; isBank: boolean; currency: string; debit: number; credit: number; balance: number; foreign: number }

export function profitAndLoss(b: Balance[]) {
  const nz = (a: Balance) => a.balance !== 0;
  const income = b.filter((a) => a.type === "INCOME" && nz(a));
  const cos = b.filter((a) => a.type === "EXPENSE" && COST_OF_SALES_CODES.has(a.code) && nz(a));
  const overheads = b.filter((a) => a.type === "EXPENSE" && !COST_OF_SALES_CODES.has(a.code) && nz(a));
  const sum = (xs: Balance[]) => xs.reduce((n, a) => n + a.balance, 0);
  const totalIncome = sum(income), totalCos = sum(cos), totalOverheads = sum(overheads);
  return { income, cos, overheads, totalIncome, totalCos, grossProfit: totalIncome - totalCos, totalOverheads, netProfit: totalIncome - totalCos - totalOverheads };
}

/** Balance sheet from all balances to a date. Profit not yet moved to retained profit shows as "profit to date". */
export function balanceSheet(b: Balance[]) {
  const nz = (a: Balance) => a.balance !== 0;
  const sum = (xs: Balance[]) => xs.reduce((n, a) => n + a.balance, 0);
  const assets = b.filter((a) => a.type === "ASSET" && nz(a));
  const liabilities = b.filter((a) => a.type === "LIABILITY" && nz(a));
  const equity = b.filter((a) => a.type === "EQUITY" && nz(a));
  const profit = sum(b.filter((a) => a.type === "INCOME")) - sum(b.filter((a) => a.type === "EXPENSE"));
  const totalAssets = sum(assets), totalLiabilities = sum(liabilities), totalEquity = sum(equity) + profit;
  return { assets, liabilities, equity, profit, totalAssets, totalLiabilities, netAssets: totalAssets - totalLiabilities, totalEquity };
}

export function trialBalance(b: Balance[]) {
  const rows = b.filter((a) => a.debit !== 0 || a.credit !== 0).map((a) => {
    const net = a.debit - a.credit;
    return { ...a, dr: net > 0 ? net : 0, cr: net < 0 ? -net : 0 };
  });
  return { rows, totalDr: rows.reduce((n, r) => n + r.dr, 0), totalCr: rows.reduce((n, r) => n + r.cr, 0) };
}

/** Cash flow, direct method: money in and out of the bank accounts, by what the other side of each journal was. */
export function cashFlow(journals: { lines: { accountId: string; debit: number; credit: number }[] }[], accounts: Map<string, { type: AccountType; isBank: boolean; name: string; code: string }>) {
  const byAccount = new Map<string, number>();
  for (const j of journals) {
    const bankNet = j.lines.filter((l) => accounts.get(l.accountId)?.isBank).reduce((n, l) => n + l.debit - l.credit, 0);
    if (!bankNet) continue;
    const others = j.lines.filter((l) => !accounts.get(l.accountId)?.isBank);
    const weight = others.reduce((n, l) => n + Math.abs(l.debit - l.credit), 0);
    if (!weight) continue; // a transfer between bank accounts
    const parts = allocate(Math.abs(bankNet), others.map((l) => Math.abs(l.debit - l.credit)));
    others.forEach((l, i) => byAccount.set(l.accountId, (byAccount.get(l.accountId) ?? 0) + Math.sign(bankNet) * parts[i]));
  }
  const section = (a: { type: AccountType; code: string }) =>
    a.type === "EQUITY" || a.code === "2400" ? "Financing" : a.type === "ASSET" && a.code < "1000" ? "Investing" : "Operating";
  const rows = [...byAccount].filter(([, n]) => n !== 0).map(([id, n]) => ({ id, name: accounts.get(id)!.name, code: accounts.get(id)!.code, section: section(accounts.get(id)!), amount: n }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const total = (s: string) => rows.filter((r) => r.section === s).reduce((n, r) => n + r.amount, 0);
  return { rows, operating: total("Operating"), investing: total("Investing"), financing: total("Financing"), net: rows.reduce((n, r) => n + r.amount, 0) };
}

// ---------------- VAT (phase 4) ----------------

/** Costs that are outside the scope of VAT and so left out of box 7: wages, pensions, depreciation, exchange differences, Corporation Tax. */
const OUTSIDE_VAT = new Set(["6000", "6010", "6020", "6030", "6900", "7900", "8000"]);

/**
 * The nine boxes of a VAT return from the period's balances (accrual basis). Boxes 1-5 in pence; 6-9 in whole
 * pounds, rounded down as HMRC allows. Box 2, 8 and 9 are only for Northern Ireland goods trade, so they're 0.
 */
export function vatBoxes(b: Balance[]) {
  const by = (k: string) => b.find((a) => a.key === k);
  const out = by("VAT_OUTPUT"), inp = by("VAT_INPUT");
  const box1 = out ? out.credit - out.debit : 0;
  const box4 = inp ? inp.debit - inp.credit : 0;
  const sales = b.filter((a) => a.type === "INCOME").reduce((n, a) => n + a.balance, 0);
  const purchases = b.filter((a) => a.type === "EXPENSE" && !OUTSIDE_VAT.has(a.code)).reduce((n, a) => n + a.balance, 0)
    + b.filter((a) => a.type === "ASSET" && a.code < "1000" && !/depreciation/i.test(a.name)).reduce((n, a) => n + Math.max(0, a.debit - a.credit), 0);
  const pounds = (p: number) => (p >= 0 ? Math.floor(p / 100) : -Math.floor(-p / 100));
  return { box1, box2: 0, box3: box1, box4, box5: box1 - box4, box6: pounds(sales), box7: pounds(purchases), box8: 0, box9: 0 };
}
export type VatBoxes = ReturnType<typeof vatBoxes>;

/** Filing a return moves its VAT into "VAT owed to HMRC", which the payment (or refund) then clears. */
export function vatReturnJournal(box1: number, box4: number): HqLineDraft[] {
  return nonZero([
    signed({ key: "VAT_OUTPUT" }, box1, "VAT on sales for the return"),
    signed({ key: "VAT_INPUT" }, -box4, "VAT reclaimed on the return"),
    signed({ key: "VAT_CONTROL" }, box4 - box1, box1 >= box4 ? "VAT to pay" : "VAT refund due"),
  ]);
}

const ymdAdd = (ymd: string, months: number, days = 0) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const t = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)) + days * 86_400_000);
  return t.toISOString().slice(0, 10);
};
const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // m is 1-12

/**
 * VAT quarters from the registration date to today. The stagger is the month (1, 2 or 3) that the first quarter
 * of the calendar year ends in. The first return starts on the registration date. Each is due a month and 7 days
 * after it ends.
 */
export function vatQuarters(registeredFrom: string, stagger: 1 | 2 | 3, today: string) {
  const out: { start: string; end: string; due: string }[] = [];
  let y = Number(registeredFrom.slice(0, 4)) - 1, m = stagger;
  let end = monthEnd(y, m);
  while (end < registeredFrom) { m += 3; if (m > 12) { m -= 12; y++; } end = monthEnd(y, m); }
  let start = registeredFrom;
  while (start <= today && out.length < 200) {
    out.push({ start, end, due: ymdAdd(ymdAdd(end, 0, 1), 1, 6) });
    start = ymdAdd(end, 0, 1);
    m += 3; if (m > 12) { m -= 12; y++; }
    end = monthEnd(y, m);
  }
  return out;
}

/** The UK VAT registration threshold (taxable turnover in any rolling 12 months), in pence. £90,000 since 1 April 2024. */
export const VAT_THRESHOLD_PENCE = 9_000_000;

// ---------------- Year-end (phase 4) ----------------

/** Moves the year's income and costs to retained profit, so the next year starts at nil. */
export function closingJournal(b: Balance[]): HqLineDraft[] {
  const pl = b.filter((a) => (a.type === "INCOME" || a.type === "EXPENSE") && a.debit !== a.credit);
  const lines = pl.map((a) => ({ account: { id: a.id } as HqLineDraft["account"], debit: a.credit > a.debit ? a.credit - a.debit : 0, credit: a.debit > a.credit ? a.debit - a.credit : 0 }));
  const net = lines.reduce((n, l) => n + l.debit - l.credit, 0); // debits here are income being cleared
  return nonZero([...lines, signed({ key: "RETAINED" }, -net, "Profit for the year")]);
}

/**
 * Corporation Tax on a year's taxable profit, in pence, for the rates from 1 April 2023: 19% up to £50,000,
 * 25% from £250,000, with marginal relief between. The limits are shared out for a short year. An estimate only:
 * it assumes no associated companies, and that the accounting profit is the taxable profit.
 */
export function corporationTax(profitPence: number, months = 12) {
  if (profitPence <= 0) return 0;
  const lower = (5_000_000 * months) / 12, upper = (25_000_000 * months) / 12;
  if (profitPence <= lower) return Math.round(profitPence * 0.19);
  if (profitPence >= upper) return Math.round(profitPence * 0.25);
  return Math.round(profitPence * 0.25 - (3 / 200) * (upper - profitPence));
}

/** Put the estimated Corporation Tax aside: Dr Corporation Tax / Cr Corporation Tax owed. */
export const corporationTaxJournal = (taxPence: number): HqLineDraft[] =>
  nonZero([signed({ key: "CT_EXPENSE" }, taxPence, "Corporation Tax for the year"), signed({ key: "CT_OWED" }, -taxPence)]);

/** The deadlines that follow a company's year end (not its first accounts, which can differ). */
export function yearEndDeadlines(yearEnd: string) {
  return {
    accounts: ymdAdd(yearEnd, 9), // annual accounts to Companies House
    ctPayment: ymdAdd(ymdAdd(yearEnd, 9), 0, 1), // Corporation Tax to pay, 9 months and a day after
    ct600: ymdAdd(yearEnd, 12), // Company Tax Return (CT600) to HMRC
  };
}

/** The financial year that a date falls in, for a year ending on the given month and day. */
export function financialYear(date: string, endMonth: number, endDay: number) {
  const y = Number(date.slice(0, 4));
  const endThis = new Date(Date.UTC(y, endMonth - 1, Math.min(endDay, new Date(Date.UTC(y, endMonth, 0)).getUTCDate()))).toISOString().slice(0, 10);
  const end = date <= endThis ? endThis : ymdAdd(endThis, 12);
  return { start: ymdAdd(ymdAdd(end, -12), 0, 1), end };
}
