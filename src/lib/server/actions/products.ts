"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { parseGBP } from "@/lib/pos/money";
import type { FormState } from "./auth";

const money = z.string().transform((v, ctx) => {
  const p = parseGBP(v);
  if (p == null || p < 0) { ctx.addIssue({ code: "custom", message: "Enter a valid price, e.g. 1.99" }); return z.NEVER; }
  return p;
});
const optMoney = z.string().optional().transform((v) => (v ? parseGBP(v) ?? null : null));
const optInt = z.string().optional().transform((v) => (v ? parseInt(v, 10) || null : null));
const optStr = z.string().optional().transform((v) => (v?.trim() ? v.trim() : null));

const productSchema = z.object({
  id: optStr,
  name: z.string().trim().min(1, "Name is required").max(120),
  sku: optStr,
  plu: optStr,
  price: money,
  cost: optMoney,
  vatCode: z.enum(["STANDARD", "REDUCED", "ZERO", "EXEMPT"]),
  unit: z.enum(["EACH", "PER_KG"]),
  categoryId: optStr,
  supplierId: optStr,
  minAge: optInt,
  reorderLevel: optInt,
  reorderQty: optInt,
  barcodes: z.string().optional().transform((v) => [...new Set((v ?? "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))]),
  trackStock: z.string().optional().transform((v) => v === "on"),
  quickKey: z.string().optional().transform((v) => v === "on"),
  active: z.string().optional().transform((v) => v === "on"),
});

export async function saveProduct(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireAdmin();
  const parsed = productSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.minAge && ![16, 18, 21].includes(d.minAge)) return { error: "Minimum age must be 16, 18 or 21" };

  const clash = d.barcodes.length
    ? await db.barcode.findFirst({ where: { organizationId: s.orgId, code: { in: d.barcodes }, ...(d.id ? { productId: { not: d.id } } : {}) }, include: { product: true } })
    : null;
  if (clash) return { error: `Barcode ${clash.code} is already used by ${clash.product.name}` };

  const data = {
    name: d.name, sku: d.sku, plu: d.plu, pricePence: d.price, costPence: d.cost, vatCode: d.vatCode, unit: d.unit,
    categoryId: d.categoryId, supplierId: d.supplierId, minAge: d.minAge, reorderLevel: d.reorderLevel, reorderQty: d.reorderQty,
    trackStock: d.trackStock, quickKey: d.quickKey, active: d.id ? d.active : true,
  };
  try {
    if (d.id) {
      const existing = await db.product.findFirst({ where: { id: d.id, organizationId: s.orgId } });
      if (!existing) return { error: "Product not found" };
      await db.$transaction([
        db.product.update({ where: { id: d.id }, data }),
        db.barcode.deleteMany({ where: { productId: d.id } }),
        db.barcode.createMany({ data: d.barcodes.map((code) => ({ organizationId: s.orgId, productId: d.id!, code })) }),
      ]);
    } else {
      await db.product.create({ data: { ...data, organizationId: s.orgId, barcodes: { create: d.barcodes.map((code) => ({ organizationId: s.orgId, code })) } } });
    }
  } catch (e) {
    if (String(e).includes("Unique constraint")) return { error: "That SKU or PLU is already used by another product" };
    throw e;
  }
  revalidatePath("/admin/products");
  redirect("/admin/products?saved=1");
}

/**
 * CSV import. Columns (header row required, any order):
 * name, price, barcode, sku, plu, vat (20/5/0/exempt), unit (each/kg), category, cost, min_age, stock, reorder_level
 * Rows matching an existing barcode or SKU are updated.
 */
export async function importProducts(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireAdmin();
  const file = form.get("file");
  const storeId = String(form.get("storeId") ?? "");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file" };
  if (file.size > 5_000_000) return { error: "File is too large (5 MB max)" };
  const rows = parseCsv(await file.text());
  if (rows.length < 2) return { error: "The file has no rows" };
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (r: string[], name: string) => { const i = head.indexOf(name); return i >= 0 ? (r[i] ?? "").trim() : ""; };
  if (!head.includes("name") || !head.includes("price")) return { error: "The header row needs at least name and price columns" };
  const store = storeId ? await db.store.findFirst({ where: { id: storeId, organizationId: s.orgId } }) : null;

  const vatMap: Record<string, "STANDARD" | "REDUCED" | "ZERO" | "EXEMPT"> = { "20": "STANDARD", "20%": "STANDARD", standard: "STANDARD", s: "STANDARD", "5": "REDUCED", "5%": "REDUCED", reduced: "REDUCED", "0": "ZERO", "0%": "ZERO", zero: "ZERO", z: "ZERO", exempt: "EXEMPT", e: "EXEMPT" };
  const cats = new Map((await db.category.findMany({ where: { organizationId: s.orgId } })).map((c) => [c.name.toLowerCase(), c.id]));
  let created = 0, updated = 0;
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.every((c) => !c.trim())) continue;
    const name = col(r, "name");
    const price = parseGBP(col(r, "price"));
    if (!name || price == null) { errors.push(`Row ${i + 1}: needs a name and price`); continue; }
    const barcode = col(r, "barcode");
    const sku = col(r, "sku") || null;
    const catName = col(r, "category");
    let categoryId: string | null = null;
    if (catName) {
      categoryId = cats.get(catName.toLowerCase()) ?? null;
      if (!categoryId) { const c = await db.category.create({ data: { organizationId: s.orgId, name: catName } }); cats.set(catName.toLowerCase(), c.id); categoryId = c.id; }
    }
    const data = {
      name, pricePence: price, vatCode: vatMap[col(r, "vat").toLowerCase()] ?? "STANDARD",
      unit: (/kg/i.test(col(r, "unit")) ? "PER_KG" : "EACH") as "PER_KG" | "EACH",
      sku, plu: col(r, "plu") || null, categoryId,
      costPence: col(r, "cost") ? parseGBP(col(r, "cost")) : null,
      minAge: parseInt(col(r, "min_age"), 10) || null,
      reorderLevel: parseInt(col(r, "reorder_level"), 10) || null,
    };
    try {
      const existing = barcode
        ? (await db.barcode.findUnique({ where: { organizationId_code: { organizationId: s.orgId, code: barcode } } }))?.productId
        : sku ? (await db.product.findFirst({ where: { organizationId: s.orgId, sku } }))?.id : undefined;
      let productId: string;
      if (existing) { await db.product.update({ where: { id: existing }, data }); productId = existing; updated++; }
      else {
        const p = await db.product.create({ data: { ...data, organizationId: s.orgId, barcodes: barcode ? { create: { organizationId: s.orgId, code: barcode } } : undefined } });
        productId = p.id;
        created++;
      }
      const stock = col(r, "stock");
      if (store && stock !== "") {
        const q = data.unit === "PER_KG" ? Math.round(parseFloat(stock) * 1000) : parseInt(stock, 10);
        if (!Number.isNaN(q)) await db.stockLevel.upsert({ where: { storeId_productId: { storeId: store.id, productId } }, create: { storeId: store.id, productId, quantity: q }, update: { quantity: q } });
      }
    } catch (e) {
      errors.push(`Row ${i + 1}: ${String(e).includes("Unique") ? "SKU or PLU already used" : "could not be saved"}`);
    }
  }
  revalidatePath("/admin/products");
  return { ok: `Imported: ${created} new, ${updated} updated.${errors.length ? ` ${errors.length} skipped: ${errors.slice(0, 5).join("; ")}` : ""}` };
}

export async function saveCategory(form: FormData) {
  const s = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const color = String(form.get("color") ?? "#64748b");
  const id = String(form.get("id") ?? "");
  if (!name) return;
  if (id) await db.category.updateMany({ where: { id, organizationId: s.orgId }, data: { name, color } });
  else await db.category.create({ data: { organizationId: s.orgId, name, color } }).catch(() => {});
  revalidatePath("/admin/products");
}

export async function deleteCategory(form: FormData) {
  const s = await requireAdmin();
  await db.category.deleteMany({ where: { id: String(form.get("id")), organizationId: s.orgId } });
  revalidatePath("/admin/products");
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
