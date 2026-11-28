import { db } from "@/lib/server/db";
import { getAdmin } from "@/lib/server/auth";
import { audit } from "@/lib/server/till";
import { apiRoute } from "@/lib/server/errors";

/** UK GDPR data portability: everything the business holds in MatrixPOS, as one JSON file. Owners only. */
export const GET = apiRoute("GET /api/admin/export-all", async () => {
  const s = await getAdmin();
  if (!s || s.role !== "OWNER") return new Response("Unauthorised", { status: 401 });
  const where = { organizationId: s.orgId };
  const storeWhere = { store: { organizationId: s.orgId } };
  const [organization, settings, stores, users, categories, products, promotions, customers, suppliers, purchaseOrders, shifts, sales, stockMovements, ledgerAccounts, journals, bills, auditLog] = await Promise.all([
    db.organization.findUnique({ where: { id: s.orgId } }),
    db.orgSettings.findUnique({ where }),
    db.store.findMany({ where, include: { registers: true, stockLevels: true } }),
    db.user.findMany({ where, select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, emailVerifiedAt: true, stores: { select: { storeId: true } } } }),
    db.category.findMany({ where }),
    db.product.findMany({ where, include: { barcodes: true } }),
    db.promotion.findMany({ where, include: { items: true } }),
    db.customer.findMany({ where }),
    db.supplier.findMany({ where }),
    db.purchaseOrder.findMany({ where, include: { lines: true } }),
    db.shift.findMany({ where: storeWhere, include: { cashMovements: true } }),
    db.sale.findMany({ where, include: { lines: true, payments: true, vatLines: true } }),
    db.stockMovement.findMany({ where: storeWhere }),
    db.ledgerAccount.findMany({ where }),
    db.journalEntry.findMany({ where, include: { lines: true } }),
    db.bill.findMany({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "asc" } }),
  ]);
  // Card provider keys are secrets: say whether they're set, but never export them.
  const safeSettings = settings && {
    ...settings,
    stripeSecretKey: settings.stripeSecretKey ? "(set)" : null,
    sumupApiKey: settings.sumupApiKey ? "(set)" : null,
    dojoApiKey: settings.dojoApiKey ? "(set)" : null,
  };
  await audit(s.orgId, s.userId, "data.export");
  const body = JSON.stringify({
    exportedAt: new Date().toISOString(), format: "MatrixPOS export v1. Money is in pence, weights in grams.",
    organization, settings: safeSettings, stores, users, categories, products, promotions, customers, suppliers, purchaseOrders, shifts, sales, stockMovements, ledgerAccounts, journals, bills, auditLog,
  }, null, 1);
  const name = `${organization?.slug ?? "matrixpos"}-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
});
