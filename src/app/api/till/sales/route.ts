import { z } from "zod";
import { db } from "@/lib/server/db";
import { getDevice } from "@/lib/server/auth";
import { recordSale, saleSchema, json, fail } from "@/lib/server/till";

/**
 * Sync endpoint. Accepts one or more sales queued by the till (including ones made offline).
 * Only needs the device link, so sales queued before a cashier signed out still sync.
 */
export async function POST(req: Request) {
  const device = await getDevice();
  if (!device) return fail("This device is not set up as a till", 401);
  const body = await req.json().catch(() => null);
  const parsed = z.object({ sales: z.array(z.unknown()).max(200) }).safeParse(body);
  if (!parsed.success) return fail("Invalid request");

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const raw of parsed.data.sales) {
    const s = saleSchema.safeParse(raw);
    const id = (raw as { id?: string })?.id ?? "unknown";
    if (!s.success) { results.push({ id, ok: false, error: s.error.issues[0]?.message }); continue; }
    try {
      const r = await recordSale(device.orgId, device.storeId, device.registerId, s.data);
      results.push({ id, ok: !!r, error: r ? undefined : "Not allowed" });
    } catch (e) {
      results.push({ id, ok: false, error: e instanceof Error ? e.message : "Failed" });
    }
  }
  return json({ results });
}

/** Receipt lookup for refunds and reprints. */
export async function GET(req: Request) {
  const device = await getDevice();
  if (!device) return fail("This device is not set up as a till", 401);
  const q = new URL(req.url).searchParams.get("receipt")?.trim().toUpperCase();
  if (!q) return fail("Enter a receipt number");
  const sale = await db.sale.findFirst({
    where: { organizationId: device.orgId, receiptNo: q, kind: "SALE" },
    include: { lines: true, payments: true, vatLines: true, user: { select: { name: true } } },
  });
  if (!sale) return fail("Receipt not found", 404);
  const refunds = await db.sale.findMany({ where: { originalSaleId: sale.id }, include: { lines: true } });
  const refunded: Record<string, number> = {};
  for (const r of refunds) for (const l of r.lines) refunded[`${l.productId ?? l.name}`] = (refunded[`${l.productId ?? l.name}`] ?? 0) + Math.abs(l.quantity);
  return json({ sale, refunded });
}
