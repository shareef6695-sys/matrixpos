import { db } from "@/lib/server/db";
import { getAdmin } from "@/lib/server/auth";
import { atLeast } from "@/lib/session";
import { londonRange, londonDate } from "@/lib/dates";

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Prefix formula-like cells so spreadsheets don't execute them (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(esc).join(",")).join("\r\n");
const p = (n: number | null | undefined) => (n == null ? "" : (n / 100).toFixed(2));
const VAT = { STANDARD: "20", REDUCED: "5", ZERO: "0", EXEMPT: "exempt" } as const;

export async function GET(req: Request) {
  const s = await getAdmin();
  if (!s || !atLeast(s.role, "MANAGER")) return new Response("Unauthorised", { status: 401 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  let body = "", name = "export.csv";

  if (type === "products") {
    const products = await db.product.findMany({ where: { organizationId: s.orgId }, include: { barcodes: true, category: true, stockLevels: true }, orderBy: { name: "asc" } });
    body = csv([["name", "price", "barcode", "sku", "plu", "vat", "unit", "category", "cost", "min_age", "stock", "reorder_level", "active"],
      ...products.map((x) => [x.name, p(x.pricePence), x.barcodes[0]?.code, x.sku, x.plu, VAT[x.vatCode], x.unit === "PER_KG" ? "kg" : "each", x.category?.name, p(x.costPence), x.minAge, x.stockLevels.reduce((a, l) => a + l.quantity, 0) / (x.unit === "PER_KG" ? 1000 : 1), x.reorderLevel, x.active])]);
    name = "products.csv";
  } else if (type === "sales") {
    const from = url.searchParams.get("from") ?? londonDate();
    const to = url.searchParams.get("to") ?? from;
    const sales = await db.sale.findMany({ where: { organizationId: s.orgId, createdAt: londonRange(from, to) }, include: { store: true, user: true, payments: true }, orderBy: { createdAt: "asc" } });
    body = csv([["receipt", "date", "store", "cashier", "type", "status", "total", "vat", "discount", "payments"],
      ...sales.map((x) => [x.receiptNo, x.createdAt.toISOString(), x.store.name, x.user.name, x.kind, x.status, p(x.totalPence), p(x.vatPence), p(x.discountPence), x.payments.map((y) => `${y.method}:${p(y.amountPence)}`).join(" ")])]);
    name = `sales-${from}-to-${to}.csv`;
  } else return new Response("Unknown export", { status: 400 });

  return new Response("﻿" + body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
