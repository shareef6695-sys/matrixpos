import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { compare, getDevice, getTillUser } from "./auth";
import { atLeast, type Role } from "@/lib/session";
import type { Prisma } from "@prisma/client";
import { postSale } from "./accounting";
import { UserError } from "./errors";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Resolves device + signed-in cashier for till API routes. */
export async function tillContext() {
  const ctx = await getTillUser();
  if (!ctx) return null;
  const user = await db.user.findFirst({ where: { id: ctx.till.userId, organizationId: ctx.device.orgId, active: true } });
  if (!user) return null;
  return { ...ctx, user };
}

export async function deviceContext() {
  const device = await getDevice();
  if (!device) return null;
  const register = await db.register.findFirst({
    where: { id: device.registerId, store: { id: device.storeId, organizationId: device.orgId } },
    include: { store: true },
  });
  return register ? { device, register } : null;
}

/** Finds the active staff member in this business whose PIN matches. */
export async function userByPin(orgId: string, pin: string, storeId?: string) {
  if (!/^\d{4,6}$/.test(pin)) return null;
  const users = await db.user.findMany({
    where: { organizationId: orgId, active: true, ...(storeId ? { OR: [{ stores: { some: { storeId } } }, { role: "OWNER" }] } : {}) },
  });
  for (const u of users) if (await compare(pin, u.pinHash)) return u;
  return null;
}

/** Checks a supervisor/manager PIN for an override (refund, void, price change, no-sale). */
export async function authorizeOverride(orgId: string, pin: string, min: Role = "SUPERVISOR") {
  const u = await userByPin(orgId, pin);
  return u && atLeast(u.role, min) ? u : null;
}

export async function nextCounter(tx: Prisma.TransactionClient, key: string) {
  const c = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return c.value;
}

export async function audit(orgId: string, userId: string | null, action: string, detail?: Prisma.InputJsonValue) {
  await db.auditLog.create({ data: { organizationId: orgId, userId, action, detail } });
}

// ---------- Sales ----------

const vatCode = z.enum(["STANDARD", "REDUCED", "ZERO", "EXEMPT"]);
const payMethod = z.enum(["CASH", "CARD_MANUAL", "STRIPE_TERMINAL", "SUMUP", "DOJO", "VOUCHER"]);

export const saleSchema = z.object({
  id: z.string().uuid(),
  receiptNo: z.string().min(3).max(40),
  kind: z.enum(["SALE", "REFUND"]).default("SALE"),
  originalSaleId: z.string().nullish(),
  shiftId: z.string().nullish(),
  userId: z.string(),
  customerId: z.string().nullish(),
  createdAt: z.string().datetime(),
  subtotalPence: z.number().int(),
  discountPence: z.number().int(),
  totalPence: z.number().int(),
  vatPence: z.number().int(),
  changePence: z.number().int().min(0),
  ageVerified: z.boolean().default(false),
  lines: z.array(z.object({
    productId: z.string().nullish(),
    name: z.string().max(200),
    quantity: z.number().int(),
    unit: z.enum(["EACH", "PER_KG"]),
    unitPricePence: z.number().int(),
    grossPence: z.number().int(),
    discountPence: z.number().int(),
    netPence: z.number().int(),
    vatCode,
    vatRate: z.number().int(),
    promotionName: z.string().max(200).nullish(),
  })).min(1).max(500),
  vat: z.array(z.object({ vatCode, vatRate: z.number().int(), grossPence: z.number().int(), vatPence: z.number().int() })).max(10),
  payments: z.array(z.object({ method: payMethod, amountPence: z.number().int(), reference: z.string().max(120).nullish() })).min(1).max(20),
});
export type SalePayload = z.infer<typeof saleSchema>;

/**
 * Stores a sale from a till. Idempotent on sale id, so a till that was offline can resend safely.
 * Totals are checked for consistency; stock is moved and loyalty points are awarded.
 */
export async function recordSale(orgId: string, storeId: string, registerId: string, s: SalePayload) {
  const existing = await db.sale.findUnique({ where: { id: s.id }, select: { id: true, organizationId: true } });
  if (existing) return existing.organizationId === orgId ? { id: s.id, duplicate: true } : null;

  const linesTotal = s.lines.reduce((a, l) => a + l.netPence, 0);
  const paid = s.payments.reduce((a, p) => a + p.amountPence, 0);
  if (linesTotal !== s.totalPence) throw new UserError("Line totals do not match the sale total");
  if (paid - s.changePence !== s.totalPence) throw new UserError("Payments do not match the sale total");

  const user = await db.user.findFirst({ where: { id: s.userId, organizationId: orgId } });
  if (!user) throw new UserError("Unknown cashier");
  const settings = await db.orgSettings.findUnique({ where: { organizationId: orgId } });
  const productIds = [...new Set(s.lines.map((l) => l.productId).filter(Boolean) as string[])];
  const products = await db.product.findMany({ where: { id: { in: productIds }, organizationId: orgId }, select: { id: true, trackStock: true } });
  const known = new Map(products.map((p) => [p.id, p]));

  return db.$transaction(async (tx) => {
    await tx.sale.create({
      data: {
        id: s.id, organizationId: orgId, storeId, registerId, userId: s.userId,
        shiftId: s.shiftId ?? null, customerId: s.customerId ?? null, receiptNo: s.receiptNo, kind: s.kind,
        originalSaleId: s.originalSaleId ?? null,
        subtotalPence: s.subtotalPence, discountPence: s.discountPence, totalPence: s.totalPence, vatPence: s.vatPence,
        changePence: s.changePence, ageVerified: s.ageVerified, createdAt: new Date(s.createdAt),
        lines: { create: s.lines.map((l) => ({ ...l, productId: l.productId && known.has(l.productId) ? l.productId : null, promotionName: l.promotionName ?? null })) },
        vatLines: { create: s.vat },
        payments: { create: s.payments.map((p) => ({ method: p.method, amountPence: p.amountPence, reference: p.reference ?? null })) },
      },
    });

    if (settings?.enableStockControl !== false) {
      for (const l of s.lines) {
        const p = l.productId ? known.get(l.productId) : undefined;
        if (!p?.trackStock) continue;
        // Sale lines are positive quantities that leave stock; refund lines bring stock back.
        const delta = s.kind === "REFUND" ? Math.abs(l.quantity) : -Math.abs(l.quantity);
        await tx.stockLevel.upsert({
          where: { storeId_productId: { storeId, productId: p.id } },
          create: { storeId, productId: p.id, quantity: delta },
          update: { quantity: { increment: delta } },
        });
        await tx.stockMovement.create({
          data: { storeId, productId: p.id, type: s.kind === "REFUND" ? "REFUND" : "SALE", quantity: delta, reference: s.receiptNo, userId: s.userId },
        });
      }
    }

    if (s.customerId && settings?.enableLoyalty) {
      const pts = Math.trunc((s.totalPence / 100) * (settings.loyaltyPointsPerPound ?? 1));
      await tx.customer.updateMany({ where: { id: s.customerId, organizationId: orgId }, data: { points: { increment: pts } } });
    }
    await postSale(tx, orgId, s.id);
    return { id: s.id, duplicate: false };
  });
}

// ---------- Shift / Z report ----------

export async function shiftSummary(shiftId: string) {
  const shift = await db.shift.findUnique({
    where: { id: shiftId },
    include: { cashMovements: true, user: { select: { name: true } }, register: { include: { store: true } } },
  });
  if (!shift) return null;
  const sales = await db.sale.findMany({ where: { shiftId, status: "COMPLETED" }, include: { payments: true, vatLines: true } });
  const byMethod: Record<string, number> = {};
  const vat: Record<string, { grossPence: number; vatPence: number; vatRate: number }> = {};
  let salesTotal = 0, refundsTotal = 0, salesCount = 0, refundsCount = 0, discounts = 0, changeGiven = 0;
  for (const s of sales) {
    if (s.kind === "SALE") { salesTotal += s.totalPence; salesCount++; } else { refundsTotal += s.totalPence; refundsCount++; }
    discounts += s.discountPence;
    changeGiven += s.changePence;
    for (const p of s.payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amountPence;
    for (const v of s.vatLines) {
      const b = (vat[v.vatCode] ??= { grossPence: 0, vatPence: 0, vatRate: v.vatRate });
      b.grossPence += v.grossPence;
      b.vatPence += v.vatPence;
    }
  }
  const cashIn = shift.cashMovements.reduce((a, m) => a + m.amountPence, 0);
  const expectedCash = shift.openingFloatPence + (byMethod.CASH ?? 0) - changeGiven + cashIn;
  return {
    shift: {
      id: shift.id, openedAt: shift.openedAt, closedAt: shift.closedAt, zNumber: shift.zNumber, user: shift.user.name,
      register: shift.register.name, store: shift.register.store.name, openingFloatPence: shift.openingFloatPence,
      countedCashPence: shift.countedCashPence,
    },
    salesTotal, refundsTotal, netTotal: salesTotal + refundsTotal, salesCount, refundsCount, discounts,
    byMethod, changeGiven, cashMovements: cashIn, expectedCash, vat,
  };
}
