import { db } from "@/lib/server/db";
import { getTillUser } from "@/lib/server/auth";
import { deviceContext, json } from "@/lib/server/till";
import { apiRoute } from "@/lib/server/errors";

/** Everything a till needs to sell offline: business details, settings, catalogue, offers. */
export const GET = apiRoute("GET /api/till/bootstrap", async () => {
  const ctx = await deviceContext();
  if (!ctx) return json({ device: null });
  const { device, register } = ctx;
  const orgId = device.orgId;
  const [org, settings, categories, products, promotions, lastSale, tillUser] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    db.orgSettings.findUnique({ where: { organizationId: orgId } }),
    db.category.findMany({ where: { organizationId: orgId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.product.findMany({
      where: { organizationId: orgId, active: true },
      include: { barcodes: true, stockLevels: { where: { storeId: register.storeId } } },
      orderBy: { name: "asc" },
    }),
    db.promotion.findMany({ where: { organizationId: orgId, active: true, OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }, include: { items: true } }),
    db.sale.findFirst({ where: { registerId: register.id }, orderBy: { syncedAt: "desc" }, select: { receiptNo: true } }),
    getTillUser(),
  ]);
  const user = tillUser ? await db.user.findUnique({ where: { id: tillUser.till.userId }, select: { id: true, name: true, role: true } }) : null;
  const shift = user ? await db.shift.findFirst({ where: { registerId: register.id, closedAt: null }, orderBy: { openedAt: "desc" } }) : null;
  const lastSeq = lastSale ? parseInt(lastSale.receiptNo.split("-").pop() ?? "0", 10) || 0 : 0;

  const s = settings!;
  return json({
    device: { storeId: register.storeId, registerId: register.id },
    org: { name: org!.name, vatNumber: org!.vatNumber, receiptFooter: org!.receiptFooter, brandColor: org!.brandColor, companyNo: org!.companyNo },
    store: { name: register.store.name, code: register.store.code, address: [register.store.addressLine1, register.store.addressLine2, register.store.town, register.store.postcode].filter(Boolean).join(", "), phone: register.store.phone },
    register: { name: register.name, number: register.number, hasStripe: !!register.stripeReaderId, hasSumUp: !!register.sumupReaderId, hasDojo: !!register.dojoTerminalId },
    settings: {
      enableCash: s.enableCash, enableCardManual: s.enableCardManual, enableStripeTerminal: s.enableStripeTerminal, enableSumUp: s.enableSumUp, enableDojo: s.enableDojo,
      enablePromotions: s.enablePromotions, enableAgeCheck: s.enableAgeCheck, enableWeighedItems: s.enableWeighedItems, enableStockControl: s.enableStockControl,
      enableLoyalty: s.enableLoyalty, enableOfflineMode: s.enableOfflineMode, embeddedBarcodeMode: s.embeddedBarcodeMode, ageCheckThreshold: s.ageCheckThreshold,
      requireManagerForRefund: s.requireManagerForRefund, requireManagerForVoid: s.requireManagerForVoid,
    },
    categories: categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    products: products.map((p) => ({
      id: p.id, name: p.name, pricePence: p.pricePence, vatCode: p.vatCode, unit: p.unit, minAge: p.minAge, plu: p.plu, sku: p.sku,
      categoryId: p.categoryId, quickKey: p.quickKey, barcodes: p.barcodes.map((b) => ({ code: b.code, packQty: b.packQty })),
      stock: p.trackStock ? p.stockLevels[0]?.quantity ?? 0 : null,
    })),
    promotions: s.enablePromotions ? promotions.map((p) => ({
      id: p.id, name: p.name, type: p.type, quantity: p.quantity, freeQuantity: p.freeQuantity, pricePence: p.pricePence, percentOff: p.percentOff,
      startsAt: p.startsAt, endsAt: p.endsAt, items: p.items.map((i) => ({ productId: i.productId, group: i.group })),
    })) : [],
    lastSeq,
    user,
    shift: shift ? { id: shift.id, openedAt: shift.openedAt, openingFloatPence: shift.openingFloatPence } : null,
  });
});
