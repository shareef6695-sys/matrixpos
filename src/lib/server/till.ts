import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { compare, getDevice, getTillUser, orgAllowed } from "./auth";
import { atLeast, verify, type ApprovalProof, type CashierProof, type Role } from "@/lib/session";
import { checkSale, SaleCheckError } from "@/lib/pos/verify-sale";
import { pricingFor } from "./pricing-snapshot";
import type { Prisma } from "@prisma/client";
import { postSale } from "./accounting";
import { UserError } from "./errors";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Resolves device + signed-in cashier for till API routes. With requireActive, a business whose trial has ended
 * or that is suspended is refused even if a till session is still open (till sessions last a working day).
 */
export async function tillContext(opts: { requireActive?: boolean } = {}) {
  const ctx = await getTillUser();
  if (!ctx) return null;
  const user = await db.user.findFirst({ where: { id: ctx.till.userId, organizationId: ctx.device.orgId, active: true } });
  if (!user) return null;
  if (opts.requireActive && !(await orgAllowed(ctx.device.orgId))) return null;
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

const INTEGRATED: string[] = ["STRIPE_TERMINAL", "SUMUP", "DOJO"];
const ROLE_ORDER: Role[] = ["CASHIER", "SUPERVISOR", "MANAGER", "OWNER"];

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
  /** Which price list the till used (from bootstrap). */
  pricingId: z.string().max(80).nullish(),
  /** Signed proof of which cashier rang the sale up, given to the till when they signed in. */
  cashierProof: z.string().max(2000).nullish(),
  /** Signed supervisor / manager approvals for this sale (discount, refund). */
  approvals: z.array(z.string().max(2000)).max(10).nullish(),
});
export type SalePayload = z.infer<typeof saleSchema>;

/** How long a till may stay offline and still sync its sales. */
const MAX_OFFLINE_DAYS = 14;

/**
 * Stores a sale from a till. Idempotent on sale id, so a till that was offline can resend safely.
 *
 * Nothing in the payload is trusted. The server re-prices every line from the price list the till was given,
 * re-applies the shop's offers, and only accepts a bigger discount or a refund with a signed approval.
 * The cashier, shift, loyalty customer and refunded receipt must all belong to this business and till.
 * Stores the server's own figures, then moves stock and awards loyalty points.
 */
export async function recordSale(orgId: string, storeId: string, registerId: string, s: SalePayload, opts: { tillUserId?: string } = {}) {
  const existing = await db.sale.findUnique({ where: { id: s.id }, select: { id: true, organizationId: true } });
  if (existing) return existing.organizationId === orgId ? { id: s.id, duplicate: true } : null;

  const at = new Date(s.createdAt);
  if (at.getTime() > Date.now() + 10 * 60_000 || at.getTime() < Date.now() - MAX_OFFLINE_DAYS * 86_400_000)
    throw new UserError("The sale's date is outside what a till can send. Check the till's clock.");

  const user = await db.user.findFirst({ where: { id: s.userId, organizationId: orgId } });
  if (!user) throw new UserError("Unknown cashier");

  // Who rang it up: the signed proof from their till sign-in, valid at the time of the sale.
  let role: Role;
  if (s.cashierProof) {
    const c = await verify<CashierProof>(s.cashierProof, "cashier", at);
    if (!c || c.orgId !== orgId || c.registerId !== registerId || c.userId !== s.userId) throw new UserError("This sale's cashier couldn't be confirmed");
    role = ROLE_ORDER.indexOf(c.role) < ROLE_ORDER.indexOf(user.role) ? c.role : user.role;
  } else {
    // Sales queued by a till running the older app: only accepted while that same cashier is signed in.
    if (opts.tillUserId !== s.userId) throw new UserError("Sign in at the till as the cashier who made this sale to send it");
    role = user.role;
  }

  const approved = new Set<string>();
  for (const token of s.approvals ?? []) {
    const a = await verify<ApprovalProof>(token, "approval", at);
    if (!a || a.orgId !== orgId || a.registerId !== registerId || a.saleId !== s.id) continue;
    if (a.action === "discount" && atLeast(a.approverRole, "SUPERVISOR")) approved.add("discount");
    if (a.action === "refund" && atLeast(a.approverRole, "MANAGER")) approved.add("refund");
  }

  const settings = await db.orgSettings.findUnique({ where: { organizationId: orgId } });
  const [shift, customer] = await Promise.all([
    s.shiftId ? db.shift.findFirst({ where: { id: s.shiftId, registerId }, select: { id: true } }) : null,
    s.customerId ? db.customer.findFirst({ where: { id: s.customerId, organizationId: orgId }, select: { id: true } }) : null,
  ]);
  if (s.shiftId && !shift) throw new UserError("This sale's shift isn't on this till");
  if (s.customerId && !customer) throw new UserError("Unknown loyalty customer");

  let original = null;
  if (s.kind === "REFUND") {
    const o = s.originalSaleId
      ? await db.sale.findFirst({ where: { id: s.originalSaleId, organizationId: orgId, kind: "SALE", status: "COMPLETED" }, include: { lines: true } })
      : null;
    if (!o) throw new UserError("The receipt being refunded wasn't found");
    const earlier = await db.saleLine.findMany({ where: { sale: { originalSaleId: o.id, organizationId: orgId, status: "COMPLETED" } } });
    original = { lines: o.lines, refunded: earlier };
  }

  let checked;
  try {
    checked = checkSale(s, {
      pricing: await pricingFor(orgId, s.pricingId),
      original,
      canDiscount: atLeast(role, "SUPERVISOR") || approved.has("discount"),
      canRefund: !(settings?.requireManagerForRefund && role === "CASHIER") || approved.has("refund"),
    });
  } catch (e) {
    if (e instanceof SaleCheckError) {
      // Logged once per sale (the till retries), so a manager can see refused sales in the audit log.
      const seen = await db.auditLog.findFirst({ where: { organizationId: orgId, action: "sale.rejected", detail: { path: ["saleId"], equals: s.id } }, select: { id: true } });
      if (!seen) await audit(orgId, s.userId, "sale.rejected", { saleId: s.id, receiptNo: s.receiptNo, reason: e.message });
      throw new UserError(e.message);
    }
    throw e;
  }

  // Card machine payments must be ones the provider approved, for this sale and amount, started from this till.
  const payments = s.payments.map((p) => ({ method: p.method, amountPence: p.amountPence, reference: p.reference ?? null, cardPaymentId: null as string | null }));
  const card = payments.filter((p) => INTEGRATED.includes(p.method));
  if (card.length) {
    if (s.kind === "REFUND") throw new UserError("Refunds can't be paid back through the card machine from the till");
    const rows = await db.cardPayment.findMany({ where: { organizationId: orgId, registerId, saleId: s.id, approvedAt: { not: null }, usedAt: null } });
    for (const p of card) {
      const row = rows.find((r) => r.provider === p.method && r.amountPence === p.amountPence && !payments.some((q) => q.cardPaymentId === r.id));
      if (!row) {
        const seen = await db.auditLog.findFirst({ where: { organizationId: orgId, action: "sale.rejected", detail: { path: ["saleId"], equals: s.id } }, select: { id: true } });
        if (!seen) await audit(orgId, s.userId, "sale.rejected", { saleId: s.id, receiptNo: s.receiptNo, reason: "card payment not approved by the provider" });
        throw new UserError("A card machine payment on this sale wasn't approved by the card provider");
      }
      p.cardPaymentId = row.id;
      p.reference = row.reference ?? row.ref;
    }
  }

  const productIds = [...new Set(checked.lines.map((l) => l.productId).filter(Boolean) as string[])];
  const products = await db.product.findMany({ where: { id: { in: productIds }, organizationId: orgId }, select: { id: true, trackStock: true } });
  const known = new Map(products.map((p) => [p.id, p]));

  return db.$transaction(async (tx) => {
    await tx.sale.create({
      data: {
        id: s.id, organizationId: orgId, storeId, registerId, userId: s.userId,
        shiftId: shift?.id ?? null, customerId: customer?.id ?? null, receiptNo: s.receiptNo, kind: s.kind,
        originalSaleId: s.kind === "REFUND" ? s.originalSaleId! : null,
        subtotalPence: checked.subtotalPence, discountPence: checked.discountPence, totalPence: checked.totalPence, vatPence: checked.vatPence,
        changePence: s.changePence, ageVerified: s.ageVerified, createdAt: at,
        lines: { create: checked.lines.map((l) => ({ ...l, productId: l.productId && known.has(l.productId) ? l.productId : null })) },
        vatLines: { create: checked.vat },
        payments: { create: payments.map((p) => ({ method: p.method, amountPence: p.amountPence, reference: p.reference })) },
      },
    });
    // Each approved card payment pays for one sale only.
    const ids = card.map((p) => p.cardPaymentId!);
    if (ids.length) {
      const { count } = await tx.cardPayment.updateMany({ where: { id: { in: ids }, usedAt: null }, data: { usedAt: new Date() } });
      if (count !== ids.length) throw new UserError("A card machine payment on this sale was already used");
    }

    if (settings?.enableStockControl !== false) {
      for (const l of checked.lines) {
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

    if (customer && settings?.enableLoyalty) {
      const pts = Math.trunc((checked.totalPence / 100) * (settings.loyaltyPointsPerPound ?? 1));
      await tx.customer.updateMany({ where: { id: customer.id, organizationId: orgId }, data: { points: { increment: pts } } });
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
