import { describe, expect, it } from "vitest";
import { documentTotals, formatMoney, lineTotals, minorDigits, parseMoney, toGbpPence } from "../src/lib/hq/money";
import { parseLines } from "../src/lib/hq/lines";
import { can, ROLE_PERMISSIONS, STAFF_ROLES } from "../src/lib/hq/roles";

describe("HQ money in any currency", () => {
  it("knows each currency's decimals", () => {
    expect(minorDigits("GBP")).toBe(2);
    expect(minorDigits("JPY")).toBe(0);
    expect(minorDigits("KWD")).toBe(3);
  });
  it("parses amounts in the currency's own decimals", () => {
    expect(parseMoney("1,250.5", "GBP")).toBe(125050);
    expect(parseMoney("£12", "GBP")).toBe(1200);
    expect(parseMoney("1.234", "KWD")).toBe(1234);
    expect(parseMoney("1.5", "JPY")).toBeNull();
    expect(parseMoney("1.999", "GBP")).toBeNull();
    expect(parseMoney("abc", "GBP")).toBeNull();
    expect(parseMoney("1e5", "GBP")).toBeNull();
  });
  it("formats", () => {
    expect(formatMoney(125050, "GBP")).toBe("£1,250.50");
    expect(formatMoney(5000, "JPY")).toBe("JP¥5,000");
  });
  it("converts to pence at the document's rate", () => {
    expect(toGbpPence(12700, "USD", 1.27)).toBe(10000);
    expect(toGbpPence(4760, "SAR", 4.76)).toBe(1000);
    expect(toGbpPence(500, "GBP", 99)).toBe(500);
    expect(toGbpPence(500, "USD", 0)).toBe(0);
  });
});

describe("HQ line maths", () => {
  it("rounds half up per line and adds up exactly", () => {
    const l = { description: "Dev", quantity: 1.5, unitMinor: 22000, discountPct: 10, taxPct: 0 };
    expect(lineTotals(l).amountMinor).toBe(29700);
    const t = documentTotals([l, { description: "Hosting", quantity: 3, unitMinor: 333, discountPct: 0, taxPct: 20 }]);
    expect(t).toEqual({ subtotalMinor: 33000 + 999, discountMinor: 3300, taxMinor: 200, totalMinor: 29700 + 999 + 200 });
  });
  it("handles huge numbers without float errors", () => {
    expect(lineTotals({ description: "x", quantity: 333.333, unitMinor: 3_000_000_001, discountPct: 0, taxPct: 0 }).amountMinor).toBe(999_999_000_333);
    // A line too big to add up exactly is refused rather than rounded.
    expect("error" in parseLines(JSON.stringify([{ description: "x", quantity: "999999", unit: "999999999" }]), "GBP", false)).toBe(true);
  });
});

describe("HQ lines from the browser", () => {
  const json = (rows: unknown[]) => JSON.stringify(rows);
  it("works out every amount on the server, ignoring anything else sent", () => {
    const r = parseLines(json([{ description: "Website", quantity: "1", unit: "795", amountMinor: 1, totalMinor: 1 }]), "GBP", false);
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.lines[0].amountMinor).toBe(79500);
    expect(r.totals.totalMinor).toBe(79500);
  });
  it("refuses tax while not VAT registered", () => {
    const r = parseLines(json([{ description: "Website", quantity: "1", unit: "100", taxPct: "20" }]), "GBP", false);
    if ("error" in r) throw new Error(r.error);
    expect(r.totals.taxMinor).toBe(0);
  });
  it("refuses nonsense", () => {
    for (const bad of [
      [{ description: "x", quantity: "-1", unit: "10" }],
      [{ description: "x", quantity: "0", unit: "10" }],
      [{ description: "x", quantity: "1.0001", unit: "10" }],
      [{ description: "x", quantity: "1", unit: "-10" }],
      [{ description: "x", quantity: "1", unit: "10", discountPct: "150" }],
      [{ description: "", quantity: "1", unit: "10" }],
      [],
    ]) expect("error" in parseLines(json(bad), "GBP", true)).toBe(true);
    expect("error" in parseLines("not json", "GBP", true)).toBe(true);
    expect("error" in parseLines(json(Array(101).fill({ description: "x", quantity: 1, unit: "1" })), "GBP", true)).toBe(true);
  });
  it("skips empty rows", () => {
    const r = parseLines(json([{ description: "", quantity: "1", unit: "" }, { description: "A", quantity: 2, unit: "5" }]), "GBP", false);
    if ("error" in r) throw new Error(r.error);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].position).toBe(0);
  });
});

describe("HQ roles", () => {
  it("only the owner manages HQ staff and the POS shops", () => {
    for (const r of STAFF_ROLES) {
      expect(can(r, "team.manage")).toBe(false);
      expect(can(r, "shops.manage")).toBe(false);
    }
    expect(can("OWNER", "team.manage")).toBe(true);
  });
  it("read only changes nothing", () => {
    expect(ROLE_PERMISSIONS.VIEWER.some((p) => !p.endsWith(".view"))).toBe(false);
  });
  it("sales can't take payments, accounts can't edit quotes", () => {
    expect(can("SALES", "payments.edit")).toBe(false);
    expect(can("SALES", "invoices.edit")).toBe(false);
    expect(can("ACCOUNTS", "quotes.edit")).toBe(false);
    expect(can("ACCOUNTS", "payments.edit")).toBe(true);
  });
});
