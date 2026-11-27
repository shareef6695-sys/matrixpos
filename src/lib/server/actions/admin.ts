"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { requireAdmin, hash, compare } from "@/lib/server/auth";
import { nextCounter, audit } from "@/lib/server/till";
import { postSaleVoid, postStockAdjustment } from "@/lib/server/accounting";
import { parseGBP } from "@/lib/pos/money";
import type { FormState } from "./auth";
import { overLimit, clampFeatures } from "@/lib/server/billing";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optional = (f: FormData, k: string) => str(f, k) || null;

// ---------------- Stock ----------------

export async function adjustStock(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireAdmin();
  const productId = str(f, "productId");
  const storeId = str(f, "storeId");
  const type = str(f, "type") as "ADJUSTMENT" | "WASTE" | "RECEIVED" | "TRANSFER_OUT";
  const mode = str(f, "mode"); // set | add
  const toStoreId = str(f, "toStoreId");
  const note = optional(f, "note");
  const [product, store] = await Promise.all([
    db.product.findFirst({ where: { id: productId, organizationId: s.orgId } }),
    db.store.findFirst({ where: { id: storeId, organizationId: s.orgId } }),
  ]);
  if (!product || !store) return { error: "Choose a product and store" };
  const raw = parseFloat(str(f, "quantity"));
  if (Number.isNaN(raw)) return { error: "Enter a quantity" };
  const qty = product.unit === "PER_KG" ? Math.round(raw * 1000) : Math.round(raw);
  const current = (await db.stockLevel.findUnique({ where: { storeId_productId: { storeId, productId } } }))?.quantity ?? 0;

  let delta: number;
  if (type === "ADJUSTMENT" && mode === "set") delta = qty - current;
  else if (type === "WASTE" || type === "TRANSFER_OUT") delta = -Math.abs(qty);
  else delta = qty;

  const to = type === "TRANSFER_OUT" ? await db.store.findFirst({ where: { id: toStoreId, organizationId: s.orgId } }) : null;
  if (type === "TRANSFER_OUT" && (!to || to.id === storeId)) return { error: "Choose a different store to transfer to" };

  await db.$transaction(async (tx) => {
    await tx.stockLevel.upsert({ where: { storeId_productId: { storeId, productId } }, create: { storeId, productId, quantity: delta }, update: { quantity: { increment: delta } } });
    const mv = await tx.stockMovement.create({ data: { storeId, productId, type, quantity: delta, note, userId: s.userId, reference: to ? `to ${to.name}` : null } });
    if ((type === "ADJUSTMENT" || type === "WASTE") && product.costPence) {
      const value = Math.round(product.unit === "PER_KG" ? (product.costPence * delta) / 1000 : product.costPence * delta);
      await postStockAdjustment(tx, s.orgId, mv.id, value, `${type === "WASTE" ? "Waste" : "Stock count"}: ${product.name}`, s.userId);
    }
    if (to) {
      await tx.stockLevel.upsert({ where: { storeId_productId: { storeId: to.id, productId } }, create: { storeId: to.id, productId, quantity: -delta }, update: { quantity: { increment: -delta } } });
      await tx.stockMovement.create({ data: { storeId: to.id, productId, type: "TRANSFER_IN", quantity: -delta, note, userId: s.userId, reference: `from ${store.name}` } });
    }
  });
  revalidatePath("/admin/stock");
  return { ok: `${product.name}: ${delta > 0 ? "+" : ""}${product.unit === "PER_KG" ? `${(delta / 1000).toFixed(3)}kg` : delta} at ${store.name}` };
}

// ---------------- Promotions ----------------

export async function savePromotion(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireAdmin();
  const id = optional(f, "id");
  const type = str(f, "type") as "MULTIBUY_PRICE" | "BUY_X_GET_Y" | "PERCENT_OFF" | "MEAL_DEAL";
  const name = str(f, "name");
  if (!name) return { error: "Give the offer a name customers will see on the receipt" };
  const items: { productId: string; group: number }[] = [];
  for (const g of [1, 2, 3, 4]) for (const pid of f.getAll(`group${g}`)) if (pid) items.push({ productId: String(pid), group: g });
  const owned = await db.product.findMany({ where: { id: { in: items.map((i) => i.productId) }, organizationId: s.orgId }, select: { id: true } });
  const ok = new Set(owned.map((o) => o.id));
  const clean = items.filter((i) => ok.has(i.productId)).filter((i, k, a) => a.findIndex((x) => x.productId === i.productId) === k);
  if (!clean.length) return { error: "Pick at least one product" };

  const n = (k: string) => (str(f, k) ? parseInt(str(f, k), 10) : null);
  const data = {
    name, type, active: f.get("active") === "on",
    quantity: n("quantity"), freeQuantity: n("freeQuantity"), percentOff: n("percentOff"),
    pricePence: str(f, "price") ? parseGBP(str(f, "price")) : null,
    startsAt: str(f, "startsAt") ? new Date(str(f, "startsAt")) : null,
    endsAt: str(f, "endsAt") ? new Date(str(f, "endsAt") + "T23:59:59") : null,
  };
  if (type === "MULTIBUY_PRICE" && (!data.quantity || data.quantity < 2 || data.pricePence == null)) return { error: "Multibuy needs a quantity (2 or more) and a price" };
  if (type === "BUY_X_GET_Y" && (!data.quantity || !data.freeQuantity)) return { error: "Enter how many to buy and how many are free" };
  if (type === "PERCENT_OFF" && (!data.percentOff || data.percentOff < 1 || data.percentOff > 100)) return { error: "Enter a percentage between 1 and 100" };
  if (type === "MEAL_DEAL" && (data.pricePence == null || new Set(clean.map((c) => c.group)).size < 2)) return { error: "A meal deal needs a price and products in at least two groups" };

  if (id) {
    const existing = await db.promotion.findFirst({ where: { id, organizationId: s.orgId } });
    if (!existing) return { error: "Offer not found" };
    await db.$transaction([
      db.promotion.update({ where: { id }, data }),
      db.promotionItem.deleteMany({ where: { promotionId: id } }),
      db.promotionItem.createMany({ data: clean.map((c) => ({ ...c, promotionId: id })) }),
    ]);
  } else {
    await db.promotion.create({ data: { ...data, organizationId: s.orgId, items: { create: clean } } });
  }
  revalidatePath("/admin/promotions");
  redirect("/admin/promotions");
}

export async function deletePromotion(f: FormData) {
  const s = await requireAdmin();
  await db.promotion.deleteMany({ where: { id: str(f, "id"), organizationId: s.orgId } });
  revalidatePath("/admin/promotions");
}

// ---------------- Suppliers & purchase orders ----------------

export async function saveSupplier(f: FormData) {
  const s = await requireAdmin();
  const id = optional(f, "id");
  const data = { name: str(f, "name"), contactName: optional(f, "contactName"), email: optional(f, "email"), phone: optional(f, "phone"), accountNo: optional(f, "accountNo") };
  if (!data.name) return;
  if (id) await db.supplier.updateMany({ where: { id, organizationId: s.orgId }, data });
  else await db.supplier.create({ data: { ...data, organizationId: s.orgId } }).catch(() => {});
  revalidatePath("/admin/purchasing");
}

/** Creates a draft purchase order from everything at or below its reorder level for one supplier and store. */
export async function createPurchaseOrder(f: FormData) {
  const s = await requireAdmin();
  const supplierId = str(f, "supplierId");
  const storeId = str(f, "storeId");
  const [supplier, store] = await Promise.all([
    db.supplier.findFirst({ where: { id: supplierId, organizationId: s.orgId } }),
    db.store.findFirst({ where: { id: storeId, organizationId: s.orgId } }),
  ]);
  if (!supplier || !store) return;
  const products = await db.product.findMany({ where: { organizationId: s.orgId, supplierId, active: true, trackStock: true }, include: { stockLevels: { where: { storeId } } } });
  const lines = products
    .filter((p) => f.get("all") === "on" || (p.stockLevels[0]?.quantity ?? 0) <= (p.reorderLevel ?? 0))
    .map((p) => ({ productId: p.id, quantity: p.reorderQty ?? Math.max(1, (p.reorderLevel ?? 0) * 2), costPence: p.costPence }));
  const n = await db.$transaction((tx) => nextCounter(tx, `po:${s.orgId}`));
  const po = await db.purchaseOrder.create({
    data: { organizationId: s.orgId, supplierId, storeId, reference: `PO-${String(n).padStart(5, "0")}`, lines: { create: lines } },
  });
  redirect(`/admin/purchasing/${po.id}`);
}

export async function updatePurchaseOrder(f: FormData) {
  const s = await requireAdmin();
  const id = str(f, "id");
  const po = await db.purchaseOrder.findFirst({ where: { id, organizationId: s.orgId }, include: { lines: { include: { product: true } } } });
  if (!po) return;
  const action = str(f, "op");

  if (action === "addLine") {
    const productId = str(f, "productId");
    const product = await db.product.findFirst({ where: { id: productId, organizationId: s.orgId } });
    if (product) await db.purchaseOrderLine.create({ data: { purchaseOrderId: id, productId, quantity: Math.max(1, parseInt(str(f, "quantity"), 10) || 1), costPence: product.costPence } });
  } else if (action === "save" || action === "send") {
    for (const l of po.lines) {
      const q = parseInt(str(f, `qty_${l.id}`), 10);
      if (Number.isNaN(q)) continue;
      if (q <= 0) await db.purchaseOrderLine.delete({ where: { id: l.id } });
      else await db.purchaseOrderLine.update({ where: { id: l.id }, data: { quantity: q, costPence: str(f, `cost_${l.id}`) ? parseGBP(str(f, `cost_${l.id}`)) : l.costPence } });
    }
    await db.purchaseOrder.update({ where: { id }, data: { notes: optional(f, "notes"), ...(action === "send" ? { status: "SENT" } : {}) } });
  } else if (action === "receive") {
    // Book in what arrived; stock goes up and the PO becomes partial or received.
    await db.$transaction(async (tx) => {
      let complete = true;
      for (const l of po.lines) {
        const got = Math.max(0, parseInt(str(f, `recv_${l.id}`), 10) || 0);
        const units = l.product.unit === "PER_KG" ? got * 1000 : got;
        if (got > 0) {
          await tx.purchaseOrderLine.update({ where: { id: l.id }, data: { receivedQty: { increment: got } } });
          await tx.stockLevel.upsert({ where: { storeId_productId: { storeId: po.storeId, productId: l.productId } }, create: { storeId: po.storeId, productId: l.productId, quantity: units }, update: { quantity: { increment: units } } });
          await tx.stockMovement.create({ data: { storeId: po.storeId, productId: l.productId, type: "RECEIVED", quantity: units, reference: po.reference, userId: s.userId } });
          if (f.get("updateCost") === "on" && l.costPence != null) await tx.product.update({ where: { id: l.productId }, data: { costPence: l.costPence } });
        }
        if (l.receivedQty + got < l.quantity) complete = false;
      }
      await tx.purchaseOrder.update({ where: { id }, data: { status: complete ? "RECEIVED" : "PARTIAL", receivedAt: complete ? new Date() : null } });
    });
  } else if (action === "cancel") {
    await db.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
  }
  revalidatePath(`/admin/purchasing/${id}`);
}

// ---------------- Sales ----------------

export async function voidSale(f: FormData) {
  const s = await requireAdmin("MANAGER");
  const sale = await db.sale.findFirst({ where: { id: str(f, "id"), organizationId: s.orgId }, include: { lines: { include: { product: true } } } });
  if (!sale || sale.status === "VOIDED") return;
  await db.$transaction(async (tx) => {
    await tx.sale.update({ where: { id: sale.id }, data: { status: "VOIDED" } });
    await postSaleVoid(tx, s.orgId, sale.id, s.userId);
    for (const l of sale.lines) {
      if (!l.productId || !l.product?.trackStock) continue;
      const back = sale.kind === "SALE" ? Math.abs(l.quantity) : -Math.abs(l.quantity);
      await tx.stockLevel.updateMany({ where: { storeId: sale.storeId, productId: l.productId }, data: { quantity: { increment: back } } });
      await tx.stockMovement.create({ data: { storeId: sale.storeId, productId: l.productId, type: "ADJUSTMENT", quantity: back, reference: `void ${sale.receiptNo}`, userId: s.userId } });
    }
  });
  await audit(s.orgId, s.userId, "sale.void", { receiptNo: sale.receiptNo });
  revalidatePath(`/admin/sales/${sale.id}`);
}

// ---------------- Customers ----------------

export async function saveCustomer(f: FormData) {
  const s = await requireAdmin();
  const id = optional(f, "id");
  const data = {
    name: str(f, "name"), email: optional(f, "email"), phone: optional(f, "phone"),
    loyaltyCode: optional(f, "loyaltyCode")?.toUpperCase() ?? null, marketingOptIn: f.get("marketingOptIn") === "on",
  };
  if (!data.name) return;
  if (id) await db.customer.updateMany({ where: { id, organizationId: s.orgId }, data });
  else {
    const code = data.loyaltyCode ?? `MX${Date.now().toString().slice(-6)}`;
    await db.customer.create({ data: { ...data, loyaltyCode: code, organizationId: s.orgId } }).catch(() => {});
  }
  revalidatePath("/admin/customers");
}

/** UK GDPR right to erasure: removes personal data but keeps sales for tax records. */
export async function eraseCustomer(f: FormData) {
  const s = await requireAdmin("MANAGER");
  const id = str(f, "id");
  await db.customer.updateMany({ where: { id, organizationId: s.orgId }, data: { name: "Erased customer", email: null, phone: null, marketingOptIn: false, loyaltyCode: null } });
  await audit(s.orgId, s.userId, "customer.erase", { id });
  revalidatePath("/admin/customers");
}

// ---------------- Staff ----------------

async function pinInUse(orgId: string, pin: string, exceptId?: string | null) {
  const users = await db.user.findMany({ where: { organizationId: orgId, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { pinHash: true } });
  for (const u of users) if (await compare(pin, u.pinHash)) return true;
  return false;
}

export async function saveStaff(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireAdmin();
  const id = optional(f, "id");
  const role = str(f, "role") as "OWNER" | "MANAGER" | "SUPERVISOR" | "CASHIER";
  if (!["OWNER", "MANAGER", "SUPERVISOR", "CASHIER"].includes(role)) return { error: "Choose a role" };
  if (role === "OWNER" && s.role !== "OWNER") return { error: "Only an owner can create another owner" };
  const name = str(f, "name");
  if (!name) return { error: "Enter a name" };
  const pin = str(f, "pin");
  const email = optional(f, "email")?.toLowerCase() ?? null;
  const password = str(f, "password");
  const stores = f.getAll("stores").map(String);
  if (!id && !/^\d{4,6}$/.test(pin)) return { error: "PIN must be 4 to 6 digits" };
  if (pin && !/^\d{4,6}$/.test(pin)) return { error: "PIN must be 4 to 6 digits" };
  if (pin && (await pinInUse(s.orgId, pin, id))) return { error: "That PIN is already used by someone else. Each person needs their own." };
  if ((role === "OWNER" || role === "MANAGER") && email && !id && password.length < 8) return { error: "Back office password must be at least 8 characters" };
  if (email) {
    const other = await db.user.findUnique({ where: { email } });
    if (other && other.id !== id) return { error: "That email is already in use" };
  }
  const validStores = await db.store.findMany({ where: { id: { in: stores }, organizationId: s.orgId }, select: { id: true } });

  const data = {
    name, role, email, active: id ? f.get("active") === "on" : true,
    ...(pin ? { pinHash: await hash(pin) } : {}),
    ...(password ? { passwordHash: await hash(password) } : {}),
  };
  if (id) {
    const u = await db.user.findFirst({ where: { id, organizationId: s.orgId } });
    if (!u) return { error: "Staff member not found" };
    if (u.role === "OWNER" && s.role !== "OWNER") return { error: "Only an owner can edit an owner" };
    if (u.id === s.userId && role !== u.role) return { error: "You can't change your own role" };
    await db.$transaction([
      db.user.update({ where: { id }, data }),
      db.userStore.deleteMany({ where: { userId: id } }),
      db.userStore.createMany({ data: validStores.map((v) => ({ userId: id, storeId: v.id })) }),
    ]);
  } else {
    const limit = await overLimit(s.orgId, "staff");
    if (limit) return { error: limit };
    await db.user.create({ data: { ...data, pinHash: data.pinHash!, organizationId: s.orgId, stores: { create: validStores.map((v) => ({ storeId: v.id })) } } });
  }
  await audit(s.orgId, s.userId, id ? "staff.update" : "staff.create", { name, role });
  revalidatePath("/admin/staff");
  return { ok: "Saved" };
}

// ---------------- Stores & tills ----------------

export async function saveStore(f: FormData) {
  const s = await requireAdmin("OWNER");
  const id = optional(f, "id");
  const data = {
    name: str(f, "name"), code: str(f, "code").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "S",
    addressLine1: optional(f, "addressLine1"), addressLine2: optional(f, "addressLine2"), town: optional(f, "town"), postcode: optional(f, "postcode")?.toUpperCase() ?? null, phone: optional(f, "phone"),
  };
  if (!data.name) return;
  if (id) await db.store.updateMany({ where: { id, organizationId: s.orgId }, data });
  else {
    const limit = await overLimit(s.orgId, "store");
    if (limit) redirect(`/admin/stores?limit=${encodeURIComponent(limit)}`);
    const store = await db.store.create({ data: { ...data, organizationId: s.orgId, registers: { create: { name: "Till 1", number: 1 } } } }).catch(() => null);
    if (store) {
      // Owners and managers can work in every store.
      const leads = await db.user.findMany({ where: { organizationId: s.orgId, role: { in: ["OWNER", "MANAGER"] } } });
      await db.userStore.createMany({ data: leads.map((u) => ({ userId: u.id, storeId: store.id })), skipDuplicates: true });
    }
  }
  revalidatePath("/admin/stores");
}

export async function saveRegister(f: FormData) {
  const s = await requireAdmin("OWNER");
  const id = optional(f, "id");
  const storeId = str(f, "storeId");
  const store = await db.store.findFirst({ where: { id: storeId, organizationId: s.orgId }, include: { registers: true } });
  if (!store) return;
  const data = { name: str(f, "name") || "Till", stripeReaderId: optional(f, "stripeReaderId"), sumupReaderId: optional(f, "sumupReaderId"), dojoTerminalId: optional(f, "dojoTerminalId") };
  if (id) await db.register.updateMany({ where: { id, storeId }, data });
  else {
    const limit = await overLimit(s.orgId, "register");
    if (limit) redirect(`/admin/stores?limit=${encodeURIComponent(limit)}`);
    const number = Math.max(0, ...store.registers.map((r) => r.number)) + 1;
    await db.register.create({ data: { ...data, name: str(f, "name") || `Till ${number}`, number, storeId } });
  }
  revalidatePath("/admin/stores");
}

// ---------------- Settings ----------------

export async function saveSettings(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireAdmin("OWNER");
  const on = (k: string) => f.get(k) === "on";
  const secret = (k: string) => {
    const v = str(f, k);
    return v === "" ? undefined : v === "-" ? null : v; // blank keeps the saved key, "-" clears it
  };
  const org = await db.organization.update({
    where: { id: s.orgId },
    data: { name: str(f, "name") || undefined, vatNumber: optional(f, "vatNumber"), companyNo: optional(f, "companyNo"), receiptFooter: optional(f, "receiptFooter") },
  });
  await db.orgSettings.upsert({
    where: { organizationId: s.orgId },
    create: { organizationId: s.orgId },
    update: clampFeatures(org.plan, {
      enableCash: on("enableCash"), enableCardManual: on("enableCardManual"), enableStripeTerminal: on("enableStripeTerminal"), enableSumUp: on("enableSumUp"), enableDojo: on("enableDojo"),
      enablePromotions: on("enablePromotions"), enableAgeCheck: on("enableAgeCheck"), enableWeighedItems: on("enableWeighedItems"), enableStockControl: on("enableStockControl"),
      enableLoyalty: on("enableLoyalty"), enableOfflineMode: on("enableOfflineMode"), enableAccounting: on("enableAccounting"),
      requireManagerForRefund: on("requireManagerForRefund"), requireManagerForVoid: on("requireManagerForVoid"),
      embeddedBarcodeMode: ["PRICE", "WEIGHT", "OFF"].includes(str(f, "embeddedBarcodeMode")) ? str(f, "embeddedBarcodeMode") : "PRICE",
      ageCheckThreshold: [21, 25].includes(parseInt(str(f, "ageCheckThreshold"), 10)) ? parseInt(str(f, "ageCheckThreshold"), 10) : 25,
      loyaltyPointsPerPound: Math.max(0, Math.min(100, parseInt(str(f, "loyaltyPointsPerPound"), 10) || 1)),
      stripeSecretKey: secret("stripeSecretKey"), sumupApiKey: secret("sumupApiKey"), sumupMerchantCode: secret("sumupMerchantCode"), dojoApiKey: secret("dojoApiKey"),
    }),
  });
  await audit(s.orgId, s.userId, "settings.update");
  revalidatePath("/admin/settings");
  return { ok: "Settings saved. Tills pick them up next time they refresh." };
}

// One action per button (more reliable than reading the submit button's value).
export async function poSave(f: FormData) { f.set("op", "save"); await updatePurchaseOrder(f); }
export async function poSend(f: FormData) { f.set("op", "send"); await updatePurchaseOrder(f); }
export async function poReceive(f: FormData) { f.set("op", "receive"); await updatePurchaseOrder(f); }
export async function poCancel(f: FormData) { f.set("op", "cancel"); await updatePurchaseOrder(f); }
