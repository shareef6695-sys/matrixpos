import { describe, expect, it } from "vitest";
import {
  HQ_CHART, closingJournal, corporationTax, corporationTaxJournal, financialYear, isBalanced, profitAndLoss, vatBoxes, vatQuarters,
  vatReturnJournal, yearEndDeadlines, type Balance, type HqLineDraft,
} from "@/lib/hq/books";
import { fraudHeaders, parseClientInfo, returnBody, utcOffset } from "@/lib/hq/hmrc";

const bal = (code: string, debit: number, credit: number): Balance => {
  const a = HQ_CHART.find((x) => x.code === code)!;
  const balance = a.type === "ASSET" || a.type === "EXPENSE" ? debit - credit : credit - debit;
  return { id: code, code, name: a.name, type: a.type, key: a.key ?? null, isBank: !!a.isBank, currency: "GBP", debit, credit, balance, foreign: 0 };
};
const net = (ls: HqLineDraft[], k: string) => ls.filter((l) => "key" in l.account && l.account.key === k).reduce((n, l) => n + l.debit - l.credit, 0);

describe("VAT return boxes", () => {
  const b = [
    bal("4000", 0, 1_000_050), bal("4020", 500, 200_000), // sales, with a small credit note
    bal("2200", 2_000, 241_910), bal("2201", 30_000, 0),
    bal("6200", 100_000, 0), bal("6000", 400_000, 0), bal("0030", 50_000, 0), bal("1200", 900_000, 0),
  ];
  const v = vatBoxes(b);
  it("takes the VAT from the VAT accounts", () => {
    expect(v.box1).toBe(239_910);
    expect(v.box4).toBe(30_000);
    expect(v.box3).toBe(v.box1);
    expect(v.box5).toBe(209_910);
  });
  it("gives sales and purchases in whole pounds, leaving wages out but counting equipment", () => {
    expect(v.box6).toBe(11_995); // £11,995.50 rounded down
    expect(v.box7).toBe(1_500); // software £1,000 + equipment £500; salaries left out
    expect([v.box2, v.box8, v.box9]).toEqual([0, 0, 0]);
  });
  it("filing moves the VAT into VAT owed to HMRC", () => {
    const j = vatReturnJournal(v.box1, v.box4);
    expect(isBalanced(j)).toBe(true);
    expect(net(j, "VAT_OUTPUT")).toBe(239_910);
    expect(net(j, "VAT_INPUT")).toBe(-30_000);
    expect(net(j, "VAT_CONTROL")).toBe(-209_910);
    expect(net(vatReturnJournal(1000, 5000), "VAT_CONTROL")).toBe(4000); // a refund is owed to us
  });
  it("HMRC's body is in pounds, with net VAT never negative", () => {
    const r = returnBody("26A1", { ...v, box5: -1234 });
    expect(r.vatDueSales).toBe(2399.1);
    expect(r.netVatDue).toBe(12.34);
    expect(r.totalValueSalesExVAT).toBe(11_995);
    expect(r.finalised).toBe(true);
  });
});

describe("VAT quarters", () => {
  it("start on the registration date and follow the stagger", () => {
    const q = vatQuarters("2026-02-10", 3, "2026-11-28");
    expect(q[0]).toEqual({ start: "2026-02-10", end: "2026-03-31", due: "2026-05-07" });
    expect(q[1]).toEqual({ start: "2026-04-01", end: "2026-06-30", due: "2026-08-07" });
    expect(q.at(-1)!.end).toBe("2026-12-31");
  });
  it("handle quarters ending in February", () => {
    const q = vatQuarters("2027-12-15", 2, "2028-03-10");
    expect(q.map((x) => x.end)).toEqual(["2028-02-29", "2028-05-31"]);
    expect(q[0].due).toBe("2028-04-07");
  });
});

describe("year end", () => {
  it("Corporation Tax uses the small profits rate, marginal relief and the main rate", () => {
    expect(corporationTax(-500)).toBe(0);
    expect(corporationTax(4_000_000)).toBe(760_000); // £40k at 19%
    expect(corporationTax(10_000_000)).toBe(2_275_000); // £100k: £25,000 less £2,250 relief
    expect(corporationTax(30_000_000)).toBe(7_500_000); // £300k at 25%
    expect(corporationTax(4_000_000, 6)).toBe(872_500); // £40k in a 6 month year is past the £25k limit: £10,000 less £1,275
  });
  it("Corporation Tax is put aside as a cost and a liability", () => {
    const j = corporationTaxJournal(760_000);
    expect(isBalanced(j)).toBe(true);
    expect(net(j, "CT_EXPENSE")).toBe(760_000);
    expect(net(j, "CT_OWED")).toBe(-760_000);
  });
  it("closing a year clears income and costs to retained profit", () => {
    const b = [bal("4000", 0, 5_000_000), bal("6200", 1_000_000, 0), bal("8000", 760_000, 0), bal("1200", 3_000_000, 0)];
    const j = closingJournal(b);
    expect(isBalanced(j)).toBe(true);
    expect(net(j, "RETAINED")).toBe(-3_240_000);
    const after = b.map((a) => { const l = j.find((x) => "id" in x.account && x.account.id === a.id); return l ? bal(a.code, a.debit + l.debit, a.credit + l.credit) : a; });
    expect(profitAndLoss(after).netProfit).toBe(0);
  });
  it("deadlines follow the year end", () => {
    expect(yearEndDeadlines("2026-03-31")).toEqual({ accounts: "2026-12-31", ctPayment: "2027-01-01", ct600: "2027-03-31" });
    expect(yearEndDeadlines("2026-12-31").ctPayment).toBe("2027-10-01");
  });
  it("finds the company year a date is in", () => {
    expect(financialYear("2026-11-28", 3, 31)).toEqual({ start: "2026-04-01", end: "2027-03-31" });
    expect(financialYear("2026-03-31", 3, 31)).toEqual({ start: "2025-04-01", end: "2026-03-31" });
    expect(financialYear("2026-06-01", 12, 31)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(financialYear("2028-02-29", 2, 28)).toEqual({ start: "2028-02-29", end: "2029-02-28" });
  });
});

describe("HMRC fraud prevention headers", () => {
  const raw = JSON.stringify({ userAgent: "Mozilla/5.0", timezoneOffset: -60, screens: [{ width: 1920, height: 1080, scale: 2, depth: 24 }], window: { width: 1256, height: 803 } });
  it("reads what the browser sent, refusing anything without a user agent", () => {
    expect(parseClientInfo(raw)?.window.width).toBe(1256);
    expect(parseClientInfo("{}")).toBeNull();
    expect(parseClientInfo("not json")).toBeNull();
  });
  it("formats the time zone the way HMRC asks", () => {
    expect(utcOffset(-60)).toBe("UTC+01:00");
    expect(utcOffset(0)).toBe("UTC+00:00");
    expect(utcOffset(330)).toBe("UTC-05:30");
  });
  it("builds the headers for a web app through a server", () => {
    const h = fraudHeaders({ client: parseClientInfo(raw)!, deviceId: "beec798b-b366-47fa-b1f8-92cede14a1ce", clientIp: "198.51.100.7", userId: "u1", version: "1.0.0", at: new Date("2026-11-28T10:00:00Z") });
    expect(h["Gov-Client-Connection-Method"]).toBe("WEB_APP_VIA_SERVER");
    expect(h["Gov-Client-Device-ID"]).toBe("beec798b-b366-47fa-b1f8-92cede14a1ce");
    expect(h["Gov-Client-Screens"]).toBe("width=1920&height=1080&scaling-factor=2&colour-depth=24");
    expect(h["Gov-Client-Public-IP-Timestamp"]).toBe("2026-11-28T10:00:00.000Z");
    expect(h["Gov-Vendor-Version"]).toBe("Matrix%20HQ=1.0.0");
    expect(h["Gov-Vendor-Forwarded"]).toBe("for=198.51.100.7");
  });
});

import { shareText, waLink, waNumber } from "@/lib/hq/share";
describe("sharing by WhatsApp", () => {
  it("turns typed phone numbers into WhatsApp's form", () => {
    expect(waNumber("07700 900123")).toBe("447700900123");
    expect(waNumber("+44 (0)7700-900123")).toBe("447700900123");
    expect(waNumber("0092 300 1234567")).toBe("923001234567");
    expect(waNumber("+971 50 123 4567")).toBe("971501234567");
    expect(waNumber("12")).toBeNull();
    expect(waNumber(null)).toBeNull();
  });
  it("builds the link with the message", () => {
    expect(waLink("07700 900123", "Hi & bye")).toBe("https://wa.me/447700900123?text=Hi%20%26%20bye");
    expect(waLink(null, "Hi")).toBe("https://wa.me/?text=Hi");
    expect(shareText({ kind: "invoice", number: "MPI-1", to: "Acme", amount: "£10.00", date: "01 Dec 2026", from: "Matrix Infotech Ltd", link: "https://x/i/t" })).toContain("invoice MPI-1 for £10.00, due by 01 Dec 2026. View or download it here: https://x/i/t");
  });
});
