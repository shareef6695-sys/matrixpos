import { describe, expect, it } from "vitest";
import { priceBasket, type CartLine, type PromotionRule } from "../src/lib/pos/pricing";
import { checkSale, SaleCheckError, type ClaimedSale, type PricingData } from "../src/lib/pos/verify-sale";
import { csv } from "../src/lib/csv";

/** Regression tests for the attack-test findings (see docs/SECURITY.md). */

const cart: CartLine[] = [{ lineId: "0", productId: "beer", name: "Beer", unit: "EACH", quantity: 3, unitPricePence: 200, vatCode: "STANDARD" }];

describe("offers with nonsense numbers", () => {
  // Before the fix, each of these looped forever, freezing the till and the server for every sale in the shop.
  const bad: PromotionRule[] = [
    { id: "a", name: "neg multibuy", type: "MULTIBUY_PRICE", quantity: -1, pricePence: 100, items: [{ productId: "beer", group: 1 }] },
    { id: "b", name: "neg bogof", type: "BUY_X_GET_Y", quantity: -2, freeQuantity: 1, items: [{ productId: "beer", group: 1 }] },
    { id: "c", name: "neg free", type: "BUY_X_GET_Y", quantity: 1, freeQuantity: -1, items: [{ productId: "beer", group: 1 }] },
    { id: "d", name: "neg price", type: "MEAL_DEAL", pricePence: -500, items: [{ productId: "beer", group: 1 }, { productId: "beer", group: 2 }] },
  ];
  for (const p of bad)
    it(`ignores "${p.name}"`, () => {
      const r = priceBasket(cart, [p]);
      expect(r.discountPence).toBe(0);
      expect(r.totalPence).toBe(600);
    });
});

describe("sale quantity limits", () => {
  const pricing: PricingData = { products: { beer: { name: "Beer", price: 200, vat: "STANDARD", unit: "EACH", plu: false } }, promotions: [], embeddedPrice: false };
  const sale = (q: number): ClaimedSale => {
    const b = priceBasket([{ ...cart[0], quantity: q }], []);
    return {
      kind: "SALE", createdAt: new Date().toISOString(), subtotalPence: b.subtotalPence, discountPence: 0, totalPence: b.totalPence, vatPence: b.vatPence, changePence: 0,
      lines: b.lines.map((l) => ({ productId: l.productId, name: l.name, quantity: l.quantity, unit: l.unit, unitPricePence: l.unitPricePence, grossPence: l.grossPence, discountPence: 0, netPence: l.netPence, vatCode: l.vatCode, vatRate: l.vatRate })),
      payments: [{ method: "CASH", amountPence: b.totalPence }],
    };
  };
  it("accepts a big but real line", () => expect(() => checkSale(sale(9_999), { pricing, canDiscount: false, canRefund: true })).not.toThrow());
  it("refuses a 5 million item line", () => expect(() => checkSale(sale(10_000), { pricing, canDiscount: false, canRefund: true })).toThrow(SaleCheckError));
});

describe("CSV export", () => {
  it("neutralises formulas and keeps rows intact", () => {
    expect(csv([["=HYPERLINK(\"http://x\")", "-1.50", "@SUM(A1)", "a\rb"]])).toBe(`"'=HYPERLINK(""http://x"")",-1.50,'@SUM(A1),"a\rb"`);
  });
});
