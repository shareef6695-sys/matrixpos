import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { PricingData } from "@/lib/pos/verify-sale";
import type { PromotionRule } from "@/lib/pos/pricing";

type Product = { id: string; name: string; pricePence: number; vatCode: PricingData["products"][string]["vat"]; unit: "EACH" | "PER_KG"; plu: string | null };
type Promo = { id: string; name: string; type: PromotionRule["type"]; quantity: number | null; freeQuantity: number | null; pricePence: number | null; percentOff: number | null; startsAt: Date | null; endsAt: Date | null; items: { productId: string; group: number }[] };

export function pricingData(products: Product[], promotions: Promo[], settings: { enablePromotions: boolean; embeddedBarcodeMode: string } | null): PricingData {
  return {
    products: Object.fromEntries(products.map((p) => [p.id, { name: p.name, price: p.pricePence, vat: p.vatCode, unit: p.unit, plu: !!p.plu }])),
    promotions: settings?.enablePromotions
      ? promotions.map((p) => ({
          id: p.id, name: p.name, type: p.type, quantity: p.quantity, freeQuantity: p.freeQuantity, pricePence: p.pricePence, percentOff: p.percentOff,
          startsAt: p.startsAt?.toISOString() ?? null, endsAt: p.endsAt?.toISOString() ?? null, items: p.items.map((i) => ({ productId: i.productId, group: i.group })),
        }))
      : [],
    embeddedPrice: settings?.embeddedBarcodeMode === "PRICE",
  };
}

/** Saves the price list a till is being given and returns its id, which the till sends back with each sale. */
export async function savePricing(orgId: string, data: PricingData) {
  const id = createHash("sha256").update(orgId).update("\0").update(JSON.stringify(data)).digest("hex");
  // createdAt is "last given to a till", so a price list still in use isn't cleaned up.
  await db.pricingSnapshot.upsert({ where: { id }, create: { id, organizationId: orgId, data: data as unknown as Prisma.InputJsonValue }, update: { createdAt: new Date() } });
  return id;
}

/** The price list a sale was rung up with, or the current one for sales from tills that haven't reloaded since this check was added. */
export async function pricingFor(orgId: string, pricingId: string | null | undefined): Promise<PricingData> {
  if (pricingId) {
    const snap = await db.pricingSnapshot.findFirst({ where: { id: pricingId, organizationId: orgId }, select: { data: true } });
    if (snap) return snap.data as unknown as PricingData;
  }
  const [products, promotions, settings] = await Promise.all([
    db.product.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, pricePence: true, vatCode: true, unit: true, plu: true } }),
    db.promotion.findMany({ where: { organizationId: orgId, active: true }, include: { items: true } }),
    db.orgSettings.findUnique({ where: { organizationId: orgId } }),
  ]);
  return pricingData(products, promotions, settings);
}
