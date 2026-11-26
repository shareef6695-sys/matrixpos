import { describe, expect, it } from "vitest";
import { priceBasket, tenderStatus, cashSuggestions, type CartLine, type PromotionRule } from "../src/lib/pos/pricing";
import { formatGBP, parseGBP, allocate } from "../src/lib/pos/money";
import { vatFromGross } from "../src/lib/pos/vat";
import { isValidGtin, parseEmbeddedBarcode, buildEmbeddedBarcode, parseScanInput } from "../src/lib/pos/barcode";

const line = (p: Partial<CartLine> & { productId: string; unitPricePence: number }): CartLine => ({
  lineId: p.productId,
  name: p.productId,
  unit: "EACH",
  quantity: 1,
  vatCode: "STANDARD",
  ...p,
});

describe("money", () => {
  it("formats and parses GBP", () => {
    expect(formatGBP(123456)).toBe("£1,234.56");
    expect(formatGBP(-5)).toBe("-£0.05");
    expect(parseGBP("£1.5")).toBe(150);
    expect(parseGBP("99p")).toBe(99);
    expect(parseGBP("abc")).toBeNull();
  });
  it("allocates exactly", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(7, [0, 0]).reduce((a, b) => a + b)).toBe(7);
  });
});

describe("VAT", () => {
  it("extracts VAT from inclusive price", () => {
    expect(vatFromGross(120, 2000)).toBe(20);
    expect(vatFromGross(105, 500)).toBe(5);
    expect(vatFromGross(100, 0)).toBe(0);
  });
  it("summarises by band", () => {
    const b = priceBasket(
      [line({ productId: "beer", unitPricePence: 600 }), line({ productId: "bread", unitPricePence: 140, vatCode: "ZERO" })],
      [],
    );
    expect(b.totalPence).toBe(740);
    expect(b.vatPence).toBe(100);
    expect(b.vat.map((v) => v.vatCode)).toEqual(["STANDARD", "ZERO"]);
  });
});

describe("promotions", () => {
  const threeForTwo: PromotionRule = {
    id: "p1", name: "3 for £2", type: "MULTIBUY_PRICE", quantity: 3, pricePence: 200,
    items: [{ productId: "a", group: 1 }, { productId: "b", group: 1 }],
  };
  it("applies a mixed multibuy", () => {
    const b = priceBasket([line({ productId: "a", unitPricePence: 100, quantity: 2 }), line({ productId: "b", unitPricePence: 90, quantity: 2 })], [threeForTwo]);
    // most expensive three grouped: 100+100+90 = 290 -> 200 saves 90, one b left at 90
    expect(b.discountPence).toBe(90);
    expect(b.totalPence).toBe(290);
    expect(b.promotions[0].times).toBe(1);
  });
  it("BOGOF gives cheapest free", () => {
    const bogof: PromotionRule = { id: "p2", name: "BOGOF", type: "BUY_X_GET_Y", quantity: 1, freeQuantity: 1, items: [{ productId: "a", group: 1 }, { productId: "b", group: 1 }] };
    const b = priceBasket([line({ productId: "a", unitPricePence: 300 }), line({ productId: "b", unitPricePence: 200 })], [bogof]);
    expect(b.discountPence).toBe(200);
    expect(b.totalPence).toBe(300);
  });
  it("meal deal across VAT bands allocates saving", () => {
    const deal: PromotionRule = {
      id: "p3", name: "Meal deal £3.50", type: "MEAL_DEAL", pricePence: 350,
      items: [{ productId: "sandwich", group: 1 }, { productId: "crisps", group: 2 }, { productId: "drink", group: 3 }],
    };
    const b = priceBasket(
      [
        line({ productId: "sandwich", unitPricePence: 300, vatCode: "ZERO" }),
        line({ productId: "crisps", unitPricePence: 100 }),
        line({ productId: "drink", unitPricePence: 150 }),
      ],
      [deal],
    );
    expect(b.totalPence).toBe(350);
    expect(b.lines.reduce((a, l) => a + l.netPence, 0)).toBe(350);
    expect(b.lines.every((l) => l.promotionNames.includes("Meal deal £3.50"))).toBe(true);
  });
  it("does not apply when incomplete or expired", () => {
    const b = priceBasket([line({ productId: "a", unitPricePence: 100, quantity: 2 })], [threeForTwo]);
    expect(b.discountPence).toBe(0);
    const expired = { ...threeForTwo, endsAt: "2000-01-01" };
    expect(priceBasket([line({ productId: "a", unitPricePence: 100, quantity: 3 })], [expired]).discountPence).toBe(0);
  });
  it("prices weighed goods and applies percent off", () => {
    const pct: PromotionRule = { id: "p4", name: "25% off", type: "PERCENT_OFF", percentOff: 25, items: [{ productId: "apples", group: 1 }] };
    const b = priceBasket([line({ productId: "apples", unit: "PER_KG", quantity: 750, unitPricePence: 200, vatCode: "ZERO" })], [pct]);
    expect(b.subtotalPence).toBe(150);
    expect(b.totalPence).toBe(112);
  });
  it("tracks age restriction", () => {
    expect(priceBasket([line({ productId: "wine", unitPricePence: 800, minAge: 18 })], []).requiredAge).toBe(18);
  });
});

describe("tender", () => {
  it("calculates change from cash only", () => {
    expect(tenderStatus(740, [{ method: "CASH", amountPence: 1000 }])).toMatchObject({ complete: true, changePence: 260 });
    expect(tenderStatus(740, [{ method: "CARD_MANUAL", amountPence: 500 }])).toMatchObject({ complete: false, remaining: 240 });
    expect(cashSuggestions(740)).toEqual([740, 1000, 2000, 5000]);
  });
});

describe("barcodes", () => {
  it("validates EAN-13", () => {
    expect(isValidGtin("5000112637922")).toBe(true);
    expect(isValidGtin("5000112637923")).toBe(false);
  });
  it("parses embedded price labels", () => {
    const code = buildEmbeddedBarcode("123", 349);
    expect(code).toHaveLength(13);
    expect(parseEmbeddedBarcode(code, "PRICE")).toEqual({ plu: "123", value: 349, mode: "PRICE" });
    expect(parseEmbeddedBarcode(code, "OFF")).toBeNull();
  });
  it("parses quantity prefix", () => {
    expect(parseScanInput("6*5000112637922")).toEqual({ quantity: 6, code: "5000112637922" });
    expect(parseScanInput("5000112637922")).toEqual({ quantity: 1, code: "5000112637922" });
  });
});

import { londonDayStart, londonDate, addDays } from "../src/lib/dates";
describe("London dates", () => {
  it("handles GMT and BST", () => {
    expect(londonDayStart("2026-01-15").toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(londonDayStart("2026-07-15").toISOString()).toBe("2026-07-14T23:00:00.000Z");
    expect(londonDate(new Date("2026-07-14T23:30:00Z"))).toBe("2026-07-15");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
