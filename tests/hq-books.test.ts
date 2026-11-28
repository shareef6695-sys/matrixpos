import { describe, expect, it } from "vitest";
import {
  HQ_CHART, balanceSheet, billJournal, cashFlow, creditNoteJournal, incomeKeyFor, invoiceJournal, isBalanced, profitAndLoss, receiptJournal,
  reverse, supplierPaymentJournal, trialBalance, bankLineJournal, type Balance, type HqLineDraft,
} from "@/lib/hq/books";
import { parseStatement, parseStatementDate, csvRows } from "@/lib/hq/bank-csv";
import { addPeriod, parseBillLines } from "@/lib/hq/bill-lines";

const sum = (ls: HqLineDraft[], k: string) => ls.filter((l) => "key" in l.account && l.account.key === k).reduce((n, l) => n + l.debit - l.credit, 0);

describe("HQ chart of accounts", () => {
  it("has unique codes and every automatic account", () => {
    expect(new Set(HQ_CHART.map((a) => a.code)).size).toBe(HQ_CHART.length);
    for (const k of ["BANK", "DEBTORS", "CREDITORS", "VAT_OUTPUT", "VAT_INPUT", "SALES", "FX", "RETAINED", "GENERAL_EXPENSES"]) expect(HQ_CHART.some((a) => a.key === k)).toBe(true);
  });
  it("sends POS plans and third-party apps to their own income", () => {
    expect(incomeKeyFor("SUBSCRIPTION", "POS-PRO")).toBe("SALES_POS");
    expect(incomeKeyFor("THIRD_PARTY")).toBe("SALES_RESALE");
    expect(incomeKeyFor(null)).toBe("SALES");
  });
});

describe("HQ journals", () => {
  const doc = { currency: "GBP", perGbp: 1, totalMinor: 120000, taxMinor: 0, lines: [{ account: { key: "SALES" as const }, amountMinor: 80000 }, { account: { key: "SALES_SUPPORT" as const }, amountMinor: 40000 }] };

  it("an invoice debits debtors and credits each income account", () => {
    const j = invoiceJournal(doc);
    expect(isBalanced(j)).toBe(true);
    expect(sum(j, "DEBTORS")).toBe(120000);
    expect(sum(j, "SALES")).toBe(-80000);
    expect(sum(j, "SALES_SUPPORT")).toBe(-40000);
  });

  it("a foreign invoice converts at its rate, and the lines still add up exactly", () => {
    const j = invoiceJournal({ ...doc, currency: "USD", perGbp: 1.2731, totalMinor: 100001, lines: [{ account: { key: "SALES" }, amountMinor: 33334 }, { account: { key: "SALES_WEB" }, amountMinor: 66667 }] });
    expect(isBalanced(j)).toBe(true);
    expect(sum(j, "DEBTORS")).toBe(Math.round(100001 / 1.2731));
  });

  it("a credit note is the opposite of an invoice", () => {
    const c = creditNoteJournal(doc);
    expect(isBalanced(c)).toBe(true);
    expect(sum(c, "DEBTORS")).toBe(-120000);
  });

  it("money received in another currency books the exchange difference", () => {
    // Invoiced $1,000 at 1.25 (£800), paid when the rate was 1.30 (£769.23).
    const j = receiptJournal({ amountMinor: 100000, currency: "USD", invoicePerGbp: 1.25, gbpPence: 76923, bank: { key: "BANK" }, bankForeignMinor: 76923 });
    expect(isBalanced(j)).toBe(true);
    expect(sum(j, "DEBTORS")).toBe(-80000);
    expect(sum(j, "BANK")).toBe(76923);
    expect(sum(j, "FX")).toBe(3077); // a loss
  });

  it("a received payment into a USD bank account keeps the dollar amount", () => {
    const j = receiptJournal({ amountMinor: 100000, currency: "USD", invoicePerGbp: 1.25, gbpPence: 80000, bank: { id: "usd" }, bankForeignMinor: 100000 });
    expect(j.find((l) => "id" in l.account)!.foreignMinor).toBe(100000);
    expect(sum(j, "FX")).toBe(0);
  });

  it("a bill credits creditors; paying it clears them", () => {
    const b = billJournal({ currency: "GBP", perGbp: 1, totalMinor: 5000, taxMinor: 0, lines: [{ account: { id: "software" }, amountMinor: 5000 }] });
    expect(isBalanced(b)).toBe(true);
    expect(sum(b, "CREDITORS")).toBe(-5000);
    const p = supplierPaymentJournal({ amountMinor: 5000, currency: "GBP", billPerGbp: 1, gbpPence: 5000, bank: { key: "BANK" }, bankForeignMinor: 5000 });
    expect(sum(p, "CREDITORS")).toBe(5000);
    expect(sum(p, "BANK")).toBe(-5000);
    expect(p.find((l) => "key" in l.account && l.account.key === "BANK")!.foreignMinor).toBe(-5000);
  });

  it("a bank line goes straight to an account", () => {
    const j = bankLineJournal({ gbpPence: -1584, foreignMinor: -1584, bank: { key: "BANK" }, other: { id: "fees" }, description: "GITHUB" });
    expect(isBalanced(j)).toBe(true);
    expect(sum(j, "BANK")).toBe(-1584);
  });

  it("reversing a journal swaps debits and credits", () => {
    const j = invoiceJournal(doc);
    const r = reverse(j);
    expect(sum([...j, ...r], "DEBTORS")).toBe(0);
  });
});

describe("HQ reports", () => {
  const b = (code: string, type: Balance["type"], debit: number, credit: number, isBank = false): Balance => ({
    id: code, code, name: code, type, key: null, isBank, currency: "GBP", debit, credit, balance: type === "ASSET" || type === "EXPENSE" ? debit - credit : credit - debit, foreign: 0,
  });
  const all = [b("1200", "ASSET", 100000, 20000, true), b("1100", "ASSET", 50000, 0), b("2100", "LIABILITY", 0, 10000), b("3000", "EQUITY", 0, 100), b("4000", "INCOME", 0, 150000), b("5100", "EXPENSE", 20000, 0), b("6200", "EXPENSE", 10100, 0)];

  it("profit and loss splits cost of sales from overheads", () => {
    const p = profitAndLoss(all);
    expect(p.totalIncome).toBe(150000);
    expect(p.grossProfit).toBe(130000);
    expect(p.netProfit).toBe(119900);
  });

  it("the balance sheet balances", () => {
    const s = balanceSheet(all);
    expect(s.netAssets).toBe(s.totalEquity);
  });

  it("the trial balance's debits equal its credits", () => {
    const t = trialBalance(all);
    expect(t.totalDr).toBe(t.totalCr);
  });

  it("cash flow counts money in and out of the bank by the other side", () => {
    const acc = new Map([["bank", { type: "ASSET" as const, isBank: true, name: "Bank", code: "1200" }], ["debt", { type: "ASSET" as const, isBank: false, name: "Debtors", code: "1100" }], ["cap", { type: "EQUITY" as const, isBank: false, name: "Capital", code: "3000" }]]);
    const c = cashFlow([
      { lines: [{ accountId: "bank", debit: 5000, credit: 0 }, { accountId: "debt", debit: 0, credit: 5000 }] },
      { lines: [{ accountId: "bank", debit: 100, credit: 0 }, { accountId: "cap", debit: 0, credit: 100 }] },
    ], acc);
    expect(c.operating).toBe(5000);
    expect(c.financing).toBe(100);
    expect(c.net).toBe(5100);
  });
});

describe("bank statement CSVs", () => {
  it("reads Lloyds' Debit Amount / Credit Amount layout", () => {
    const csv = [
      "Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance",
      "27/11/2026,FPI,'30-99-50,12345678,ACME LTD MPI-2026-K7Q3M,,1250.00,4321.10",
      "26/11/2026,DEB,'30-99-50,12345678,GITHUB.COM,15.84,,3071.10",
      "25/11/2026,DD,'30-99-50,12345678,HMRC NDDS,\"1,200.00\",,3086.94",
    ].join("\n");
    const r = parseStatement(csv, "GBP");
    if ("error" in r) throw new Error(r.error);
    expect(r.lines).toEqual([
      { date: "2026-11-27", description: "ACME LTD MPI-2026-K7Q3M · FPI", amountMinor: 125000 },
      { date: "2026-11-26", description: "GITHUB.COM · DEB", amountMinor: -1584 },
      { date: "2026-11-25", description: "HMRC NDDS · DD", amountMinor: -120000 },
    ]);
  });

  it("reads a single signed Amount column (Monzo, Starling, Wise)", () => {
    const r = parseStatement("Date,Name,Amount\n2026-11-01,Stripe,100.50\n02/11/2026,Coffee,-3.20\n", "GBP");
    if ("error" in r) throw new Error(r.error);
    expect(r.lines.map((l) => l.amountMinor)).toEqual([10050, -320]);
  });

  it("understands brackets and CR/DR for the sign", () => {
    const r = parseStatement("Date,Details,Amount\n01/11/2026,a,(12.50)\n01/11/2026,b,10.00 DR\n01/11/2026,c,5.00 CR\n", "GBP");
    if ("error" in r) throw new Error(r.error);
    expect(r.lines.map((l) => l.amountMinor)).toEqual([-1250, -1000, 500]);
  });

  it("skips lines without a date or amount and refuses files it can't read", () => {
    const r = parseStatement("Date,Description,Amount\n01/11/2026,ok,1\nBalance brought forward,,\n", "GBP");
    if ("error" in r) throw new Error(r.error);
    expect(r.skipped).toBe(1);
    expect("error" in parseStatement("hello,world\n1,2", "GBP")).toBe(true);
  });

  it("reads UK dates day-first", () => {
    expect(parseStatementDate("03/04/2026")).toBe("2026-04-03");
    expect(parseStatementDate("28 Nov 2026")).toBe("2026-11-28");
    expect(parseStatementDate("31/02/2026")).toBeNull();
  });

  it("handles quoted fields with commas and line breaks", () => {
    expect(csvRows('a,"b, c","d\ne"\n1,2,3')).toEqual([["a", "b, c", "d\ne"], ["1", "2", "3"]]);
  });
});

describe("bill lines and repeating dates", () => {
  it("works out the bill total and ignores VAT when not registered", () => {
    const r = parseBillLines(JSON.stringify([{ description: "Hosting", accountId: "a", amount: "100", taxPct: "20" }, { description: "", accountId: "", amount: "" }]), "GBP", false);
    if ("error" in r) throw new Error(r.error);
    expect(r).toMatchObject({ netMinor: 10000, taxMinor: 0, totalMinor: 10000 });
    const v = parseBillLines(JSON.stringify([{ description: "Hosting", accountId: "a", amount: "100", taxPct: "20" }]), "GBP", true);
    if ("error" in v) throw new Error(v.error);
    expect(v.totalMinor).toBe(12000);
  });

  it("refuses a line with no account or no amount", () => {
    expect("error" in parseBillLines(JSON.stringify([{ description: "x", accountId: "", amount: "5" }]), "GBP", false)).toBe(true);
    expect("error" in parseBillLines(JSON.stringify([{ description: "x", accountId: "a", amount: "-5" }]), "GBP", false)).toBe(true);
  });

  it("adds periods, keeping month ends sensible", () => {
    expect(addPeriod("2026-01-31", "MONTHLY")).toBe("2026-02-28");
    expect(addPeriod("2026-11-28", "WEEKLY")).toBe("2026-12-05");
    expect(addPeriod("2026-11-30", "QUARTERLY")).toBe("2027-02-28");
    expect(addPeriod("2028-02-29", "YEARLY")).toBe("2029-02-28");
  });
});
