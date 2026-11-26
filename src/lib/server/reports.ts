import "server-only";
import { db } from "./db";
import { londonDate, londonRange, addDays } from "@/lib/dates";

export async function salesReport(orgId: string, from: string, to: string, storeId?: string) {
  const where = { organizationId: orgId, status: "COMPLETED" as const, createdAt: londonRange(from, to), ...(storeId ? { storeId } : {}) };
  const sales = await db.sale.findMany({ where, include: { payments: true, vatLines: true, lines: true, store: { select: { name: true } } } });

  const byDay = new Map<string, { gross: number; count: number }>();
  for (let d = from; d <= to; d = addDays(d, 1)) byDay.set(d, { gross: 0, count: 0 });
  const byMethod: Record<string, number> = {};
  const byStore: Record<string, number> = {};
  const vat: Record<string, { rate: number; gross: number; vat: number }> = {};
  const products = new Map<string, { name: string; qty: number; revenue: number; weighed: boolean }>();
  const byHour = Array.from({ length: 24 }, () => 0);
  let gross = 0, refunds = 0, count = 0, discounts = 0, vatTotal = 0;

  for (const s of sales) {
    const day = londonDate(s.createdAt);
    const b = byDay.get(day);
    if (b) { b.gross += s.totalPence; if (s.kind === "SALE") b.count++; }
    if (s.kind === "SALE") { gross += s.totalPence; count++; } else refunds += s.totalPence;
    discounts += s.discountPence;
    vatTotal += s.vatPence;
    byStore[s.store.name] = (byStore[s.store.name] ?? 0) + s.totalPence;
    const hour = parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(s.createdAt), 10);
    byHour[hour] += s.totalPence;
    for (const p of s.payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amountPence;
    // Cash payments include the change handed back; report cash net of change.
    if (s.changePence) byMethod.CASH = (byMethod.CASH ?? 0) - s.changePence;
    for (const v of s.vatLines) {
      const x = (vat[v.vatCode] ??= { rate: v.vatRate, gross: 0, vat: 0 });
      x.gross += v.grossPence;
      x.vat += v.vatPence;
    }
    for (const l of s.lines) {
      const key = l.productId ?? `misc:${l.name}`;
      const x = products.get(key) ?? { name: l.name, qty: 0, revenue: 0, weighed: l.unit === "PER_KG" };
      x.qty += l.quantity;
      x.revenue += l.netPence;
      products.set(key, x);
    }
  }

  return {
    gross, refunds, net: gross + refunds, count, discounts, vat: vatTotal,
    avgBasket: count ? Math.round(gross / count) : 0,
    byDay: [...byDay.entries()].map(([day, v]) => ({ day, ...v })),
    byMethod, byStore, byHour,
    vatBands: Object.entries(vat).map(([code, v]) => ({ code, ...v, net: v.gross - v.vat })),
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 15),
  };
}

export async function lowStock(orgId: string, storeId?: string) {
  const rows = await db.stockLevel.findMany({
    where: { store: { organizationId: orgId }, ...(storeId ? { storeId } : {}), product: { trackStock: true, active: true, reorderLevel: { not: null } } },
    include: { product: { select: { id: true, name: true, reorderLevel: true, reorderQty: true, unit: true, supplierId: true } }, store: { select: { id: true, name: true } } },
  });
  return rows.filter((r) => r.quantity <= (r.product.reorderLevel ?? 0));
}
