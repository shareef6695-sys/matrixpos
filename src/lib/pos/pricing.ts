import { allocate } from "./money";
import { VAT_RATES, vatSummary, type VatBand, type VatCode } from "./vat";

export type PricingUnit = "EACH" | "PER_KG";

export interface CartLine {
  lineId: string;
  productId: string | null;
  name: string;
  unit: PricingUnit;
  /** Units for EACH, grams for PER_KG. */
  quantity: number;
  /** Per unit, or per kg for PER_KG. VAT inclusive. */
  unitPricePence: number;
  vatCode: VatCode;
  minAge?: number | null;
  /** Price fixed by an embedded-price barcode; such lines skip promotions. */
  fixedPricePence?: number | null;
  /** Manual price override or line discount set by a supervisor. */
  manualDiscountPence?: number;
}

export interface PromotionRule {
  id: string;
  name: string;
  type: "MULTIBUY_PRICE" | "BUY_X_GET_Y" | "PERCENT_OFF" | "MEAL_DEAL";
  quantity?: number | null;
  freeQuantity?: number | null;
  pricePence?: number | null;
  percentOff?: number | null;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  items: { productId: string; group: number }[];
}

export type PricedLine<T extends CartLine = CartLine> = T & {
  grossPence: number;
  discountPence: number;
  netPence: number;
  vatRate: number;
  promotionNames: string[];
};

export interface AppliedPromotion {
  promotionId: string;
  name: string;
  savingPence: number;
  times: number;
}

export interface PricedBasket<T extends CartLine = CartLine> {
  lines: PricedLine<T>[];
  subtotalPence: number;
  discountPence: number;
  totalPence: number;
  vatPence: number;
  vat: VatBand[];
  promotions: AppliedPromotion[];
  itemCount: number;
  /** Highest minimum age across the basket, or 0. */
  requiredAge: number;
}

export function lineGross(line: CartLine): number {
  if (line.fixedPricePence != null) return line.fixedPricePence;
  if (line.unit === "PER_KG") return Math.round((line.unitPricePence * line.quantity) / 1000);
  return line.unitPricePence * line.quantity;
}

interface Unit {
  lineIndex: number;
  productId: string;
  price: number;
  used: boolean;
}

function isLive(p: PromotionRule, now: Date): boolean {
  if (p.startsAt && new Date(p.startsAt) > now) return false;
  if (p.endsAt && new Date(p.endsAt) < now) return false;
  return true;
}

const PROMO_ORDER: PromotionRule["type"][] = ["MEAL_DEAL", "MULTIBUY_PRICE", "BUY_X_GET_Y", "PERCENT_OFF"];

/**
 * Prices a basket: applies live promotions, allocates each saving back to the lines it came from
 * (so mixed-VAT deals report VAT correctly), and builds the VAT summary.
 * Each unit is used by at most one promotion.
 */
export function priceBasket<T extends CartLine>(cart: T[], promotions: PromotionRule[], now = new Date()): PricedBasket<T> {
  const gross = cart.map(lineGross);
  const lineDiscount = cart.map(() => 0);
  const lineNames = cart.map(() => new Set<string>());

  // Expand promotable lines into individual units.
  const units: Unit[] = [];
  cart.forEach((l, i) => {
    if (l.unit !== "EACH" || l.fixedPricePence != null || !l.productId || l.quantity <= 0) return;
    for (let q = 0; q < l.quantity; q++)
      units.push({ lineIndex: i, productId: l.productId, price: l.unitPricePence, used: false });
  });

  const applied: AppliedPromotion[] = [];
  const live = promotions
    .filter((p) => isLive(p, now))
    .sort((a, b) => PROMO_ORDER.indexOf(a.type) - PROMO_ORDER.indexOf(b.type));

  const credit = (group: Unit[], saving: number, promo: PromotionRule) => {
    const parts = allocate(saving, group.map((u) => u.price));
    group.forEach((u, k) => {
      u.used = true;
      lineDiscount[u.lineIndex] += parts[k];
      lineNames[u.lineIndex].add(promo.name);
    });
  };

  for (const promo of live) {
    const groupOf = new Map(promo.items.map((it) => [it.productId, it.group]));
    const eligible = () =>
      units.filter((u) => !u.used && groupOf.has(u.productId)).sort((a, b) => b.price - a.price);
    let saving = 0;
    let times = 0;

    if (promo.type === "MULTIBUY_PRICE" && promo.quantity && promo.pricePence != null) {
      const pool = eligible();
      for (let s = 0; s + promo.quantity <= pool.length; s += promo.quantity) {
        const group = pool.slice(s, s + promo.quantity);
        const save = group.reduce((a, u) => a + u.price, 0) - promo.pricePence;
        if (save <= 0) continue;
        credit(group, save, promo);
        saving += save;
        times++;
      }
    } else if (promo.type === "BUY_X_GET_Y" && promo.quantity && promo.freeQuantity) {
      const size = promo.quantity + promo.freeQuantity;
      const pool = eligible();
      for (let s = 0; s + size <= pool.length; s += size) {
        const group = pool.slice(s, s + size);
        // Cheapest items in each group are free.
        const save = group.slice(-promo.freeQuantity).reduce((a, u) => a + u.price, 0);
        if (save <= 0) continue;
        credit(group, save, promo);
        saving += save;
        times++;
      }
    } else if (promo.type === "MEAL_DEAL" && promo.pricePence != null) {
      const groups = [...new Set(promo.items.map((i) => i.group))].sort();
      for (;;) {
        const pool = eligible();
        const pick = groups.map((g) => pool.find((u) => groupOf.get(u.productId) === g));
        if (pick.some((u) => !u)) break;
        const group = pick as Unit[];
        const save = group.reduce((a, u) => a + u.price, 0) - promo.pricePence;
        if (save <= 0) break;
        credit(group, save, promo);
        saving += save;
        times++;
      }
    } else if (promo.type === "PERCENT_OFF" && promo.percentOff) {
      const pct = promo.percentOff;
      for (const u of eligible()) {
        const save = Math.round((u.price * pct) / 100);
        if (save <= 0) continue;
        credit([u], save, promo);
        saving += save;
        times++;
      }
      // Percent-off deals also apply to weighed lines.
      cart.forEach((l, i) => {
        if (l.unit === "PER_KG" && l.productId && groupOf.has(l.productId) && l.fixedPricePence == null) {
          const save = Math.round((gross[i] * pct) / 100);
          if (save <= 0) return;
          lineDiscount[i] += save;
          lineNames[i].add(promo.name);
          saving += save;
          times++;
        }
      });
    }

    if (saving > 0) applied.push({ promotionId: promo.id, name: promo.name, savingPence: saving, times });
  }

  const lines: PricedLine<T>[] = cart.map((l, i) => {
    const discountPence = Math.min(gross[i], lineDiscount[i] + (l.manualDiscountPence ?? 0));
    return {
      ...l,
      grossPence: gross[i],
      discountPence,
      netPence: gross[i] - discountPence,
      vatRate: VAT_RATES[l.vatCode],
      promotionNames: [...lineNames[i]],
    };
  });

  const vat = vatSummary(lines);
  const subtotalPence = lines.reduce((a, l) => a + l.grossPence, 0);
  const discountPence = lines.reduce((a, l) => a + l.discountPence, 0);
  return {
    lines,
    subtotalPence,
    discountPence,
    totalPence: subtotalPence - discountPence,
    vatPence: vat.reduce((a, b) => a + b.vatPence, 0),
    vat,
    promotions: applied,
    itemCount: cart.reduce((a, l) => a + (l.unit === "EACH" ? l.quantity : 1), 0),
    requiredAge: cart.reduce((a, l) => Math.max(a, l.minAge ?? 0), 0),
  };
}

export type TenderMethod = "CASH" | "CARD_MANUAL" | "STRIPE_TERMINAL" | "SUMUP" | "DOJO" | "VOUCHER";

/** Works out what's still owed and the change due, given tenders so far. Only cash can give change. */
export function tenderStatus(totalPence: number, tenders: { method: TenderMethod; amountPence: number }[]) {
  const paid = tenders.reduce((a, t) => a + t.amountPence, 0);
  const remaining = Math.max(0, totalPence - paid);
  const overpaid = Math.max(0, paid - totalPence);
  const cash = tenders.filter((t) => t.method === "CASH").reduce((a, t) => a + t.amountPence, 0);
  return { paid, remaining, changePence: Math.min(overpaid, cash), complete: paid >= totalPence };
}

/** Suggested quick-cash buttons: exact, then the next round notes. */
export function cashSuggestions(totalPence: number): number[] {
  const out = new Set<number>([totalPence]);
  for (const step of [500, 1000, 2000, 5000]) {
    const v = Math.ceil(totalPence / step) * step;
    if (v > totalPence) out.add(v);
  }
  return [...out].slice(0, 4);
}
