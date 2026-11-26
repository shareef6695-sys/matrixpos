import { db } from "@/lib/server/db";
import { tillContext, json, fail } from "@/lib/server/till";

/** Loyalty lookup by card code, phone or email. */
export async function GET(req: Request) {
  const ctx = await tillContext();
  if (!ctx) return fail("Sign in at the till first", 401);
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 3) return json({ customers: [] });
  const customers = await db.customer.findMany({
    where: { organizationId: ctx.device.orgId, OR: [{ loyaltyCode: q.toUpperCase() }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] },
    take: 8, select: { id: true, name: true, loyaltyCode: true, points: true },
  });
  return json({ customers });
}
