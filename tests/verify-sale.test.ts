import { describe, expect, it } from "vitest";
import { priceBasket, type CartLine, type PromotionRule } from "../src/lib/pos/pricing";
import { checkSale, SaleCheckError, type ClaimedSale, type PricingData, type CheckContext } from "../src/lib/pos/verify-sale";

const promos: PromotionRule[] = [
  { id: "md", name: "Meal deal £3.50", type: "MEAL_DEAL", pricePence: 350, items: [{ productId: "sandwich", group: 1 }, { productId: "crisps", group: 2 }, { productId: "drink", group: 3 }] },
  { id: "pc", name: "10% off cheese", type: "PERCENT_OFF", percentOff: 10, items: [{ productId: "cheese", group: 1 }] },
];
const pricing: PricingData = {
  products: {
    sandwich: { name: "Sandwich", price: 250, vat: "ZERO", unit: "EACH", plu: false },
    crisps: { name: "Crisps", price: 100, vat: "STANDARD", unit: "EACH", plu: false },
    drink: { name: "Drink", price: 150, vat: "STANDARD", unit: "EACH", plu: false },
    beer: { name: "Beer", price: 200, vat: "STANDARD", unit: "EACH", plu: false },
    cheese: { name: "Cheddar", price: 1299, vat: "ZERO", unit: "PER_KG", plu: true },
    ham: { name: "Deli ham", price: 400, vat: "ZERO", unit: "EACH", plu: true },
  },
  promotions: promos,
  embeddedPrice: true,
};
const ctx = (over: Partial<CheckContext> = {}): CheckContext => ({ pricing, canDiscount: false, canRefund: true, ...over });

/** Builds the payload exactly the way the till does (TillApp.complete). */
function tillSale(cart: (Omit<CartLine, "lineId" | "name" | "vatCode" | "unit"> & Partial<CartLine>)[], opts: { refund?: boolean; promotions?: PromotionRule[] } = {}): ClaimedSale {
  const lines = cart.map((c, i) => {
    const p = c.productId ? pricing.products[c.productId] : undefined;
    return { lineId: String(i), name: p?.name ?? "Misc", unit: p?.unit ?? "EACH", vatCode: p?.vat ?? "STANDARD", ...c } as CartLine;
  });
  const b = priceBasket(lines, opts.refund ? [] : opts.promotions ?? promos);
  const sign = opts.refund ? -1 : 1;
  return {
    kind: opts.refund ? "REFUND" : "SALE", createdAt: new Date().toISOString(),
    subtotalPence: sign * b.subtotalPence, discountPence: sign * b.discountPence, totalPence: sign * b.totalPence, vatPence: sign * b.vatPence,
    changePence: 0,
    lines: b.lines.map((l) => ({
      productId: l.productId, name: l.name, quantity: sign * l.quantity, unit: l.unit, unitPricePence: l.unitPricePence,
      grossPence: sign * l.grossPence, discountPence: sign * l.discountPence, netPence: sign * l.netPence, vatCode: l.vatCode, vatRate: l.vatRate,
      promotionName: l.promotionNames.join(", ") || null,
    })),
    payments: [{ method: "CASH", amountPence: sign * b.totalPence }],
  };
}

const rejects = (s: ClaimedSale, c = ctx(), msg?: RegExp) => {
  expect(() => checkSale(s, c)).toThrow(SaleCheckError);
  if (msg) expect(() => checkSale(s, c)).toThrow(msg);
};

describe("server-side sale check", () => {
  it("accepts an honest sale with a meal deal, weighed cheese and an open-price item", () => {
    const s = tillSale([
      { productId: "sandwich", quantity: 1, unitPricePence: 250 },
      { productId: "crisps", quantity: 1, unitPricePence: 100 },
      { productId: "drink", quantity: 1, unitPricePence: 150 },
      { productId: "cheese", quantity: 350, unitPricePence: 1299 },
      { productId: null, name: "Misc", quantity: 1, unitPricePence: 99 },
    ]);
    const r = checkSale(s, ctx());
    expect(r.totalPence).toBe(s.totalPence);
    expect(r.discountPence).toBe(150 + Math.round(Math.round((1299 * 350) / 1000) * 0.1));
  });

  it("refuses a lowered price", () => {
    const s = tillSale([{ productId: "beer", quantity: 2, unitPricePence: 1 }]);
    rejects(s, ctx(), /price doesn't match/);
  });

  it("refuses a line total that doesn't match price x quantity", () => {
    const s = tillSale([{ productId: "beer", quantity: 10, unitPricePence: 200 }]);
    s.lines[0].grossPence = 200; s.lines[0].netPence = 200; s.subtotalPence = 200; s.totalPence = 200; s.payments[0].amountPence = 200;
    rejects(s);
  });

  it("refuses a staff discount from a cashier without approval, accepts it with approval", () => {
    const s = tillSale([{ productId: "beer", quantity: 1, unitPricePence: 200, manualDiscountPence: 150 }]);
    rejects(s, ctx(), /supervisor's approval/);
    expect(checkSale(s, ctx({ canDiscount: true })).totalPence).toBe(50);
  });

  it("refuses discount moved onto other lines (e.g. to cut VAT)", () => {
    const s = tillSale([
      { productId: "sandwich", quantity: 1, unitPricePence: 250 },
      { productId: "crisps", quantity: 1, unitPricePence: 100 },
      { productId: "drink", quantity: 1, unitPricePence: 150 },
    ]);
    // Move the whole meal deal saving onto the 20% VAT drink.
    const total = s.lines.reduce((a, l) => a + l.discountPence, 0);
    s.lines.forEach((l) => { l.discountPence = 0; l.netPence = l.grossPence; });
    s.lines[2].discountPence = total; s.lines[2].netPence = s.lines[2].grossPence - total;
    rejects(s, ctx(), /approval/);
  });

  it("refuses an offer the shop doesn't have", () => {
    const fake: PromotionRule[] = [{ id: "x", name: "Free beer", type: "PERCENT_OFF", percentOff: 100, items: [{ productId: "beer", group: 1 }] }];
    rejects(tillSale([{ productId: "beer", quantity: 1, unitPricePence: 200 }], { promotions: fake }));
  });

  it("refuses totals, VAT or payments that don't add up", () => {
    const base = () => tillSale([{ productId: "beer", quantity: 1, unitPricePence: 200 }]);
    const a = base(); a.totalPence = 1; rejects(a);
    const b = base(); b.vatPence = 0; rejects(b);
    const c = base(); c.payments[0].amountPence = 1; rejects(c);
    const d = base(); d.payments = [{ method: "CARD_MANUAL", amountPence: 500 }]; d.changePence = 300; rejects(d, ctx(), /cash/);
  });

  it("refuses negative quantities on a sale (a refund in disguise)", () => {
    const s = tillSale([{ productId: "beer", quantity: 1, unitPricePence: 200 }]);
    s.lines[0].quantity = -1;
    rejects(s, ctx(), /positive quantity/);
  });

  it("refuses unknown products and scale-label prices on non-label products", () => {
    rejects(tillSale([{ productId: "ghost", quantity: 1, unitPricePence: 100 }]));
    rejects(tillSale([{ productId: "beer", quantity: 1, unitPricePence: 200, fixedPricePence: 5 }]));
    // A real deli label is fine.
    expect(checkSale(tillSale([{ productId: "ham", quantity: 1, unitPricePence: 400, fixedPricePence: 333 }]), ctx()).totalPence).toBe(333);
    expect(() => checkSale(tillSale([{ productId: "ham", quantity: 1, unitPricePence: 400, fixedPricePence: 333 }]), ctx({ pricing: { ...pricing, embeddedPrice: false } }))).toThrow(SaleCheckError);
  });

  describe("refunds", () => {
    const original = {
      lines: [
        { productId: "beer", name: "Beer", quantity: 3, unit: "EACH" as const, netPence: 600, vatCode: "STANDARD" as const },
        { productId: "cheese", name: "Cheddar", quantity: 350, unit: "PER_KG" as const, netPence: 455, vatCode: "ZERO" as const },
      ],
      refunded: [] as { productId: string | null; name: string; quantity: number; netPence: number }[],
    };
    // What RefundModal builds: per-unit price actually paid; weighed lines refunded whole.
    const refund = (beer: number, cheese = false) => tillSale([
      ...(beer ? [{ productId: "beer", quantity: beer, unitPricePence: 200, unit: "EACH" as const, vatCode: "STANDARD" as const }] : []),
      ...(cheese ? [{ productId: "cheese", quantity: 1, unitPricePence: 455, unit: "EACH" as const, vatCode: "ZERO" as const, fixedPricePence: 455 }] : []),
    ], { refund: true });

    it("accepts a refund of what was bought", () => {
      expect(checkSale(refund(2, true), ctx({ original })).totalPence).toBe(-855);
    });
    it("refuses a refund with no receipt, or without a manager's approval when required", () => {
      rejects(refund(1), ctx(), /against a receipt/);
      rejects(refund(1), ctx({ original, canRefund: false }), /manager/);
    });
    it("refuses refunding more than was bought, or more than once", () => {
      rejects(refund(4), ctx({ original }), /more refunded/);
      const after = { ...original, refunded: [{ productId: "beer", name: "Beer", quantity: -2, netPence: -400 }, { productId: "cheese", name: "Cheddar", quantity: -1, netPence: -455 }] };
      expect(checkSale(refund(1), ctx({ original: after })).totalPence).toBe(-200);
      rejects(refund(2), ctx({ original: after }));
      rejects(refund(0, true), ctx({ original: after }));
    });
    it("refuses an inflated refund amount", () => {
      const s = refund(1);
      s.lines[0].unitPricePence = 5000; s.lines[0].grossPence = -5000; s.lines[0].netPence = -5000;
      s.subtotalPence = -5000; s.totalPence = -5000; s.vatPence = -833; s.payments[0].amountPence = -5000;
      rejects(s, ctx({ original }), /more than was paid/);
    });
    it("refuses refund lines for items not on the receipt, and positive payments", () => {
      const s = tillSale([{ productId: "drink", quantity: 1, unitPricePence: 150, unit: "EACH", vatCode: "STANDARD" }], { refund: true });
      rejects(s, ctx({ original }), /isn't on the original receipt/);
      const p = refund(1); p.payments = [{ method: "CASH", amountPence: 100 }, { method: "CASH", amountPence: -300 }];
      rejects(p, ctx({ original }));
    });
  });
});
