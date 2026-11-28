import { priceBasket, type CartLine, type PromotionRule, type PricingUnit } from "./pricing";
import { VAT_RATES, vatSummary, type VatCode } from "./vat";

/**
 * Server-side re-pricing of a sale sent by a till.
 *
 * The till prices baskets itself (it has to, to keep selling offline), so everything it sends is a claim.
 * This works the sale out again from the price list the till was actually given (a PricingSnapshot), and
 * refuses it if prices, quantities, discounts, totals or payments don't add up. Pure, so it is unit tested.
 */

export interface PricedProduct { name: string; price: number; vat: VatCode; unit: PricingUnit; plu: boolean }

export interface PricingData {
  products: Record<string, PricedProduct>;
  promotions: PromotionRule[];
  /** Scale labels carry a price (EAN-13 starting 2). Such lines are priced by the label, not the price list. */
  embeddedPrice: boolean;
}

export interface ClaimedLine {
  productId?: string | null; name: string; quantity: number; unit: PricingUnit; unitPricePence: number;
  grossPence: number; discountPence: number; netPence: number; vatCode: VatCode; vatRate: number; promotionName?: string | null;
}

export interface ClaimedSale {
  kind: "SALE" | "REFUND"; createdAt: string;
  subtotalPence: number; discountPence: number; totalPence: number; vatPence: number; changePence: number;
  lines: ClaimedLine[];
  payments: { method: string; amountPence: number }[];
}

/** The receipt being refunded, and the lines of refunds already made against it (negative quantities). */
export interface OriginalSale {
  lines: { productId: string | null; name: string; quantity: number; unit: PricingUnit; netPence: number; vatCode: VatCode }[];
  refunded: { productId: string | null; name: string; quantity: number; netPence: number }[];
}

export interface CheckContext {
  pricing: PricingData;
  original?: OriginalSale | null;
  /** The cashier is a supervisor or above, or a supervisor approved a discount on this sale. */
  canDiscount: boolean;
  /** Refunds don't need approval here, or a manager approved this one. */
  canRefund: boolean;
}

export interface CheckedSale {
  lines: (Omit<ClaimedLine, "productId" | "promotionName"> & { productId: string | null; promotionName: string | null })[];
  vat: { vatCode: VatCode; vatRate: number; grossPence: number; vatPence: number }[];
  subtotalPence: number; discountPence: number; totalPence: number; vatPence: number;
}

export class SaleCheckError extends Error {}
const no = (msg: string): never => { throw new SaleCheckError(msg); };

/** A weight read from a scale label is rounded to the gram, so its price can be out by about a penny per £10/kg. */
const weighedTolerance = (pricePerKg: number) => Math.max(1, Math.ceil(pricePerKg / 1000));

export function checkSale(s: ClaimedSale, ctx: CheckContext): CheckedSale {
  const r = s.kind === "REFUND" ? checkRefund(s, ctx) : checkSaleLines(s, ctx);
  const subtotalPence = r.lines.reduce((a, l) => a + l.grossPence, 0);
  const discountPence = r.lines.reduce((a, l) => a + l.discountPence, 0);
  const totalPence = subtotalPence - discountPence;
  // VAT is worked out on the positive amounts and then signed, the same way the till does it.
  const sign = s.kind === "REFUND" ? -1 : 1;
  const bands = vatSummary(r.lines.map((l) => ({ vatCode: l.vatCode, netPence: sign * l.netPence })));
  const vat = bands.map((b) => ({ vatCode: b.vatCode, vatRate: b.vatRate, grossPence: sign * b.grossPence, vatPence: sign * b.vatPence }));
  const vatPence = vat.reduce((a, b) => a + b.vatPence, 0);

  if (s.subtotalPence !== subtotalPence || s.discountPence !== discountPence || s.totalPence !== totalPence || s.vatPence !== vatPence)
    no("The sale totals don't match its lines");

  const paid = s.payments.reduce((a, p) => a + p.amountPence, 0);
  if (s.kind === "SALE") {
    if (s.payments.some((p) => p.amountPence <= 0)) no("Payments on a sale must be positive");
    const cash = s.payments.filter((p) => p.method === "CASH").reduce((a, p) => a + p.amountPence, 0);
    if (s.changePence > cash) no("Change can only be given from cash");
  } else {
    if (s.payments.some((p) => p.amountPence > 0)) no("Payments on a refund must be negative");
    if (s.changePence !== 0) no("A refund can't give change");
  }
  if (paid - s.changePence !== totalPence) no("Payments do not match the sale total");
  return { lines: r.lines, vat, subtotalPence, discountPence, totalPence, vatPence };
}

function checkSaleLines(s: ClaimedSale, ctx: CheckContext) {
  const { products, promotions, embeddedPrice } = ctx.pricing;
  const cart: CartLine[] = [];
  s.lines.forEach((l, i) => {
    if (!(l.quantity > 0)) no("Sale lines must have a positive quantity");
    if (l.unit === "EACH" && l.quantity > 9_999) no("A sale line can't be more than 9,999 items");
    if (l.productId) {
      const p = products[l.productId] ?? no("A product on this sale isn't in the shop's price list");
      if (l.unit !== p.unit) no(`${p.name}: wrong unit`);
      if (l.unitPricePence !== p.price) no(`${p.name}: the price doesn't match the price list`);
      let fixed: number | null = null;
      if (p.unit === "EACH") {
        if (l.grossPence !== p.price * l.quantity) {
          // Only a scale label with the price in its barcode can set its own price.
          if (!(embeddedPrice && p.plu && l.quantity === 1 && l.grossPence > 0)) no(`${p.name}: the line total doesn't match the price`);
          fixed = l.grossPence;
        }
      } else {
        const expected = Math.round((p.price * l.quantity) / 1000);
        if (Math.abs(l.grossPence - expected) > weighedTolerance(p.price)) no(`${p.name}: the price doesn't match the weight`);
        if (l.grossPence !== expected) fixed = l.grossPence;
      }
      cart.push({ lineId: String(i), productId: l.productId, name: p.name, unit: p.unit, quantity: l.quantity, unitPricePence: p.price, vatCode: p.vat, fixedPricePence: fixed });
    } else {
      // Open-price item ("Miscellaneous"): the cashier keys the price, as on any till.
      if (l.unit !== "EACH" || !(l.unitPricePence > 0) || l.grossPence !== l.unitPricePence * l.quantity) no("An open-price line doesn't add up");
      cart.push({ lineId: String(i), productId: null, name: l.name, unit: "EACH", quantity: l.quantity, unitPricePence: l.unitPricePence, vatCode: l.vatCode });
    }
  });

  // What the shop's own offers take off each line. Anything more is a staff discount.
  const priced = priceBasket(cart, promotions, new Date(s.createdAt));
  const lines = s.lines.map((l, i) => {
    const server = priced.lines[i];
    if (l.discountPence < 0 || l.discountPence > server.grossPence) no(`${server.name}: invalid discount`);
    if (l.discountPence > server.discountPence && !ctx.canDiscount) no(`${server.name}: a discount needs a supervisor's approval`);
    if (l.netPence !== server.grossPence - l.discountPence) no(`${server.name}: the line total doesn't add up`);
    return {
      productId: server.productId, name: server.name.slice(0, 200), quantity: l.quantity, unit: server.unit, unitPricePence: server.unitPricePence,
      grossPence: server.grossPence, discountPence: l.discountPence, netPence: server.grossPence - l.discountPence,
      vatCode: server.vatCode, vatRate: VAT_RATES[server.vatCode], promotionName: l.promotionName?.slice(0, 200) ?? null,
    };
  });
  return { lines };
}

function checkRefund(s: ClaimedSale, ctx: CheckContext) {
  const o = ctx.original ?? no("A refund must be made against a receipt");
  if (!ctx.canRefund) no("This refund needs a manager's approval");
  const key = (l: { productId?: string | null; name: string }) => l.productId ?? `name:${l.name}`;

  type Bought = { productId: string | null; name: string; units: number; net: number; vatCode: VatCode; weighed: boolean };
  const bought = new Map<string, Bought>();
  for (const l of o.lines) {
    const b = bought.get(key(l)) ?? { productId: l.productId, name: l.name, units: 0, net: 0, vatCode: l.vatCode, weighed: l.unit === "PER_KG" };
    // A weighed line is refunded whole, so it counts as one unit.
    b.units += l.unit === "PER_KG" ? 1 : l.quantity;
    b.net += l.netPence;
    bought.set(key(l), b);
  }
  const already = new Map<string, { units: number; net: number }>();
  for (const l of o.refunded) {
    const a = already.get(key(l)) ?? { units: 0, net: 0 };
    a.units += Math.abs(l.quantity);
    a.net += Math.abs(l.netPence);
    already.set(key(l), a);
  }

  const now = new Map<string, { units: number; net: number }>();
  const lines = s.lines.map((l) => {
    const b = bought.get(key(l)) ?? no("A refunded item isn't on the original receipt");
    if (!(l.quantity < 0)) no("Refund lines must have a negative quantity");
    if (l.unit !== "EACH" || (b.weighed && l.quantity !== -1)) no(`${b.name}: invalid refund quantity`);
    if (!(l.unitPricePence >= 0) || l.grossPence !== -l.unitPricePence * Math.abs(l.quantity)) no(`${b.name}: the refund line doesn't add up`);
    if (l.discountPence !== 0 || l.netPence !== l.grossPence) no(`${b.name}: refunds are made at the price paid`);
    const n = now.get(key(l)) ?? { units: 0, net: 0 };
    n.units += Math.abs(l.quantity);
    n.net += Math.abs(l.netPence);
    now.set(key(l), n);
    return {
      productId: b.productId, name: b.name, quantity: l.quantity, unit: "EACH" as const, unitPricePence: l.unitPricePence,
      grossPence: l.grossPence, discountPence: 0, netPence: l.grossPence, vatCode: b.vatCode, vatRate: VAT_RATES[b.vatCode], promotionName: null,
    };
  });
  for (const [k, n] of now) {
    const b = bought.get(k)!;
    const a = already.get(k) ?? { units: 0, net: 0 };
    if (n.units > b.units - a.units) no(`${b.name}: more refunded than was bought`);
    // Per-unit prices are rounded to the penny when a line is split, so allow 1p per unit.
    if (n.net > b.net - a.net + n.units) no(`${b.name}: refund is more than was paid`);
  }
  return { lines };
}
