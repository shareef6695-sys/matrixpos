/**
 * Double-entry bookkeeping rules for MatrixPOS. Pure functions, unit tested.
 * Money is integer pence. Every journal must balance (total debits = total credits).
 */

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export type SystemKey =
  | "BANK" | "CASH_TILL" | "CASH_SAFE" | "CARD_CLEARING" | "VOUCHER_CLEARING" | "STOCK"
  | "CREDITORS" | "VAT_OUTPUT" | "VAT_INPUT" | "CAPITAL" | "RETAINED" | "DRAWINGS"
  | "SALES" | "OTHER_INCOME" | "COST_OF_SALES" | "STOCK_LOSS" | "CASH_OVER_SHORT" | "GENERAL_EXPENSES";

export interface ChartAccount { code: string; name: string; type: AccountType; systemKey?: SystemKey; isBank?: boolean }

/** A simple UK small-retail chart of accounts, created for every new business. */
export const DEFAULT_CHART: ChartAccount[] = [
  { code: "1001", name: "Stock", type: "ASSET", systemKey: "STOCK" },
  { code: "1200", name: "Bank current account", type: "ASSET", systemKey: "BANK", isBank: true },
  { code: "1210", name: "Cash in tills", type: "ASSET", systemKey: "CASH_TILL", isBank: true },
  { code: "1220", name: "Cash in safe / to bank", type: "ASSET", systemKey: "CASH_SAFE", isBank: true },
  { code: "1230", name: "Card payments awaiting settlement", type: "ASSET", systemKey: "CARD_CLEARING" },
  { code: "1240", name: "Vouchers awaiting redemption", type: "ASSET", systemKey: "VOUCHER_CLEARING" },
  { code: "2100", name: "Trade creditors (suppliers)", type: "LIABILITY", systemKey: "CREDITORS" },
  { code: "2200", name: "VAT on sales (output)", type: "LIABILITY", systemKey: "VAT_OUTPUT" },
  { code: "2201", name: "VAT on purchases (input)", type: "LIABILITY", systemKey: "VAT_INPUT" },
  { code: "2300", name: "PAYE and NI owed", type: "LIABILITY" },
  { code: "3000", name: "Owner's capital", type: "EQUITY", systemKey: "CAPITAL" },
  { code: "3100", name: "Retained profit", type: "EQUITY", systemKey: "RETAINED" },
  { code: "3200", name: "Owner's drawings", type: "EQUITY", systemKey: "DRAWINGS" },
  { code: "4000", name: "Shop sales", type: "INCOME", systemKey: "SALES" },
  { code: "4900", name: "Other income", type: "INCOME", systemKey: "OTHER_INCOME" },
  { code: "5000", name: "Cost of goods sold", type: "EXPENSE", systemKey: "COST_OF_SALES" },
  { code: "5100", name: "Stock losses and waste", type: "EXPENSE", systemKey: "STOCK_LOSS" },
  { code: "6000", name: "Wages and salaries", type: "EXPENSE" },
  { code: "6100", name: "Rent and business rates", type: "EXPENSE" },
  { code: "6200", name: "Electricity, gas and water", type: "EXPENSE" },
  { code: "6300", name: "Insurance", type: "EXPENSE" },
  { code: "6400", name: "Card processing fees", type: "EXPENSE" },
  { code: "6500", name: "Repairs and maintenance", type: "EXPENSE" },
  { code: "6600", name: "Shop supplies and packaging", type: "EXPENSE" },
  { code: "6700", name: "Delivery and motor", type: "EXPENSE" },
  { code: "6800", name: "Accountancy and legal", type: "EXPENSE" },
  { code: "6850", name: "Telephone, internet and software", type: "EXPENSE" },
  { code: "6900", name: "Bank charges", type: "EXPENSE" },
  { code: "7000", name: "General expenses", type: "EXPENSE", systemKey: "GENERAL_EXPENSES" },
  { code: "7100", name: "Till cash over / short", type: "EXPENSE", systemKey: "CASH_OVER_SHORT" },
];

export interface JLine { key?: SystemKey; accountId?: string; debit: number; credit: number; description?: string }

export function isBalanced(lines: JLine[]): boolean {
  const d = lines.reduce((a, l) => a + l.debit, 0);
  const c = lines.reduce((a, l) => a + l.credit, 0);
  return d === c;
}

/** Turns a signed amount into a debit or credit on one account; drops zero lines. */
const dr = (key: SystemKey, amount: number, description?: string): JLine =>
  amount >= 0 ? { key, debit: amount, credit: 0, description } : { key, debit: 0, credit: -amount, description };
const cr = (key: SystemKey, amount: number, description?: string): JLine => dr(key, -amount, description);
const nonZero = (lines: JLine[]) => lines.filter((l) => l.debit !== 0 || l.credit !== 0);

export interface SaleForLedger {
  totalPence: number; // signed, negative for refunds
  vatPence: number; // signed
  changePence: number;
  payments: { method: string; amountPence: number }[]; // signed
  /** Cost of the goods on the sale (ex VAT), signed like the sale. */
  costPence: number;
}

/**
 * Sale (or refund, where all amounts are negative):
 *   Dr cash / card clearing / voucher clearing   (what was taken)
 *   Cr Shop sales                                 (net of VAT)
 *   Cr VAT on sales
 *   Dr Cost of goods sold / Cr Stock              (at cost, when costs are known)
 */
export function saleJournal(s: SaleForLedger): JLine[] {
  let cash = 0, card = 0, voucher = 0;
  for (const p of s.payments) {
    if (p.method === "CASH") cash += p.amountPence;
    else if (p.method === "VOUCHER") voucher += p.amountPence;
    else card += p.amountPence;
  }
  cash -= s.changePence;
  return nonZero([
    dr("CASH_TILL", cash, "Cash taken"),
    dr("CARD_CLEARING", card, "Card payments"),
    dr("VOUCHER_CLEARING", voucher, "Vouchers"),
    cr("SALES", s.totalPence - s.vatPence, "Sales net of VAT"),
    cr("VAT_OUTPUT", s.vatPence, "VAT on sales"),
    dr("COST_OF_SALES", s.costPence, "Cost of goods sold"),
    cr("STOCK", s.costPence, "Stock sold"),
  ]);
}

/** Reverses any journal (used when a sale is voided). */
export function reverse(lines: JLine[]): JLine[] {
  return lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
}

/** Stock count corrections and waste, valued at cost. Positive = stock found, negative = lost. */
export function stockAdjustmentJournal(valuePence: number): JLine[] {
  return nonZero([dr("STOCK", valuePence, "Stock adjustment"), cr("STOCK_LOSS", valuePence, "Stock adjustment")]);
}

/** Till cash paid in (positive) or taken out to the safe / bank (negative). */
export function cashMovementJournal(amountPence: number): JLine[] {
  return nonZero([dr("CASH_TILL", amountPence, "Till cash movement"), cr("CASH_SAFE", amountPence, "Till cash movement")]);
}

/** Till count at close. Positive difference = over, negative = short. */
export function cashOverShortJournal(diffPence: number): JLine[] {
  return nonZero([dr("CASH_TILL", diffPence, "Cash over/short at close"), cr("CASH_OVER_SHORT", diffPence, "Cash over/short at close")]);
}

export interface BillForLedger { accountId: string; netPence: number; vatPence: number; grossPence: number }

/** Supplier bill or expense: Dr expense or stock (net), Dr VAT on purchases, Cr creditors. */
export function billJournal(b: BillForLedger): JLine[] {
  return nonZero([
    { accountId: b.accountId, debit: b.netPence, credit: 0, description: "Net" },
    dr("VAT_INPUT", b.vatPence, "VAT on purchases"),
    cr("CREDITORS", b.grossPence, "Owed to supplier"),
  ]);
}

/** Paying a bill: Dr creditors, Cr the bank or cash account it was paid from. */
export function billPaymentJournal(grossPence: number, paidFromId: string): JLine[] {
  return nonZero([dr("CREDITORS", grossPence, "Bill paid"), { accountId: paidFromId, debit: 0, credit: grossPence, description: "Bill paid" }]);
}

/** Normal balance sign: assets and expenses are debit balances, the rest credit balances. */
export function balanceOf(type: AccountType, debit: number, credit: number): number {
  return type === "ASSET" || type === "EXPENSE" ? debit - credit : credit - debit;
}

/** UK VAT net from a gross amount (for expenses entered inc. VAT). */
export function splitVat(grossPence: number, rateBp: number) {
  const vat = rateBp ? Math.round((grossPence * rateBp) / (10000 + rateBp)) : 0;
  return { netPence: grossPence - vat, vatPence: vat };
}
