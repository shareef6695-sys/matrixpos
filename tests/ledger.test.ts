import { describe, expect, it } from "vitest";
import { saleJournal, reverse, isBalanced, billJournal, billPaymentJournal, stockAdjustmentJournal, cashOverShortJournal, cashMovementJournal, balanceOf, splitVat, DEFAULT_CHART } from "../src/lib/accounting/ledger";

const sum = (lines: { key?: string; debit: number; credit: number }[], key: string) =>
  lines.filter((l) => l.key === key).reduce((a, l) => a + l.debit - l.credit, 0);

describe("ledger postings", () => {
  it("chart has unique codes and every system account", () => {
    expect(new Set(DEFAULT_CHART.map((a) => a.code)).size).toBe(DEFAULT_CHART.length);
    for (const k of ["SALES", "VAT_OUTPUT", "VAT_INPUT", "CASH_TILL", "CARD_CLEARING", "STOCK", "COST_OF_SALES", "CREDITORS"])
      expect(DEFAULT_CHART.some((a) => a.systemKey === k)).toBe(true);
  });
  it("posts a cash sale with change, VAT and cost of sales", () => {
    const j = saleJournal({ totalPence: 1198, vatPence: 153, changePence: 802, payments: [{ method: "CASH", amountPence: 2000 }], costPence: 700 });
    expect(isBalanced(j)).toBe(true);
    expect(sum(j, "CASH_TILL")).toBe(1198);
    expect(sum(j, "SALES")).toBe(-1045);
    expect(sum(j, "VAT_OUTPUT")).toBe(-153);
    expect(sum(j, "COST_OF_SALES")).toBe(700);
    expect(sum(j, "STOCK")).toBe(-700);
  });
  it("splits card and cash, and handles refunds as negatives", () => {
    const sale = saleJournal({ totalPence: 1000, vatPence: 100, changePence: 0, payments: [{ method: "CASH", amountPence: 400 }, { method: "SUMUP", amountPence: 600 }], costPence: 0 });
    expect(isBalanced(sale)).toBe(true);
    expect(sum(sale, "CARD_CLEARING")).toBe(600);
    const refund = saleJournal({ totalPence: -155, vatPence: 0, changePence: 0, payments: [{ method: "CASH", amountPence: -155 }], costPence: -100 });
    expect(isBalanced(refund)).toBe(true);
    expect(sum(refund, "CASH_TILL")).toBe(-155);
    expect(sum(refund, "STOCK")).toBe(100);
  });
  it("reverses a journal", () => {
    const j = saleJournal({ totalPence: 500, vatPence: 83, changePence: 0, payments: [{ method: "CARD_MANUAL", amountPence: 500 }], costPence: 0 });
    const r = reverse(j);
    expect(isBalanced(r)).toBe(true);
    expect(sum([...j, ...r], "SALES")).toBe(0);
  });
  it("posts bills, payments, stock and cash adjustments", () => {
    expect(isBalanced(billJournal({ accountId: "rent", netPence: 1000, vatPence: 200, grossPence: 1200 }))).toBe(true);
    expect(isBalanced(billPaymentJournal(1200, "bank"))).toBe(true);
    expect(sum(stockAdjustmentJournal(-250), "STOCK_LOSS")).toBe(250);
    expect(sum(cashOverShortJournal(-30), "CASH_TILL")).toBe(-30);
    expect(sum(cashMovementJournal(-5000), "CASH_SAFE")).toBe(5000);
    expect(stockAdjustmentJournal(0)).toEqual([]);
  });
  it("balances and VAT split", () => {
    expect(balanceOf("ASSET", 100, 30)).toBe(70);
    expect(balanceOf("INCOME", 10, 100)).toBe(90);
    expect(splitVat(1200, 2000)).toEqual({ netPence: 1000, vatPence: 200 });
  });
});
