import { z } from "zod";
import { db } from "@/lib/server/db";
import { getTillUser } from "@/lib/server/auth";
import { deviceContext, recordSale, saleSchema, tillContext, json, fail } from "@/lib/server/till";
import { apiRoute, publicMessage } from "@/lib/server/errors";

/**
 * Sync endpoint. Accepts one or more sales queued by the till (including ones made offline).
 * Only needs the device link, so sales queued before a cashier signed out still sync.
 */
export const POST = apiRoute("POST /api/till/sales", async (req: Request) => {
  // The till must still exist in this business (a deleted till's device link stops working).
  const ctx = await deviceContext();
  if (!ctx) return fail("This device is not set up as a till", 401);
  const { device } = ctx;
  const tillUserId = (await getTillUser())?.till.userId;
  const body = await req.json().catch(() => null);
  const parsed = z.object({ sales: z.array(z.unknown()).max(200) }).safeParse(body);
  if (!parsed.success) return fail("Invalid request");

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const raw of parsed.data.sales) {
    const s = saleSchema.safeParse(raw);
    const id = (raw as { id?: string })?.id ?? "unknown";
    if (!s.success) { results.push({ id, ok: false, error: s.error.issues[0]?.message }); continue; }
    try {
      const r = await recordSale(device.orgId, ctx.register.storeId, ctx.register.id, s.data, { tillUserId });
      results.push({ id, ok: !!r, error: r ? undefined : "Not allowed" });
    } catch (e) {
      results.push({ id, ok: false, error: await publicMessage(e, `sync sale ${id}`, "This sale couldn't be saved") });
    }
  }
  return json({ results });
});

/** Receipt lookup for refunds and reprints. */
export const GET = apiRoute("GET /api/till/sales", async (req: Request) => {
  const ctx = await tillContext();
  if (!ctx) return fail("Sign in at the till first", 401);
  const { device } = ctx;
  const q = new URL(req.url).searchParams.get("receipt")?.trim().toUpperCase();
  if (!q) return fail("Enter a receipt number");
  // Only what the refund screen shows: no cashier, customer, payment references or internal ids beyond the sale's own.
  const sale = await db.sale.findFirst({
    where: { organizationId: device.orgId, receiptNo: q, kind: "SALE" },
    select: {
      id: true, receiptNo: true, createdAt: true, totalPence: true,
      lines: { select: { productId: true, name: true, quantity: true, unit: true, unitPricePence: true, grossPence: true, netPence: true, vatCode: true } },
    },
  });
  if (!sale) return fail("Receipt not found", 404);
  const refunds = await db.sale.findMany({ where: { originalSaleId: sale.id, organizationId: device.orgId, status: "COMPLETED" }, select: { lines: { select: { productId: true, name: true, quantity: true } } } });
  const refunded: Record<string, number> = {};
  for (const r of refunds) for (const l of r.lines) refunded[`${l.productId ?? l.name}`] = (refunded[`${l.productId ?? l.name}`] ?? 0) + Math.abs(l.quantity);
  return json({ sale, refunded });
});
