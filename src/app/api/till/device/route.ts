import { cookies } from "next/headers";
import { db } from "@/lib/server/db";
import { getAdmin, cookieOpts, orgAllowed } from "@/lib/server/auth";
import { DEVICE_COOKIE, DEVICE_MAX_AGE, TILL_COOKIE, atLeast, sign } from "@/lib/session";
import { json, fail } from "@/lib/server/till";
import { apiRoute } from "@/lib/server/errors";

/** Lists tills a manager can link this device to. */
export const GET = apiRoute("GET /api/till/device", async () => {
  const admin = await getAdmin();
  if (!admin || !atLeast(admin.role, "MANAGER")) return fail("Sign in as a manager to set up this till", 401);
  const stores = await db.store.findMany({ where: { organizationId: admin.orgId }, include: { registers: { orderBy: { number: "asc" } } }, orderBy: { name: "asc" } });
  return json({ stores: stores.map((s) => ({ id: s.id, name: s.name, code: s.code, registers: s.registers.map((r) => ({ id: r.id, name: r.name })) })) });
});

/** Links this browser to a till. Requires a manager's back office session. */
export const POST = apiRoute("POST /api/till/device", async (req: Request) => {
  const admin = await getAdmin();
  if (!admin || !atLeast(admin.role, "MANAGER")) return fail("Sign in as a manager to set up this till", 401);
  if (!(await orgAllowed(admin.orgId))) return fail("This shop's MatrixPOS subscription isn't active. See Billing in the back office.", 402);
  const { registerId } = await req.json().catch(() => ({}));
  const register = await db.register.findFirst({ where: { id: String(registerId), store: { organizationId: admin.orgId } } });
  if (!register) return fail("Till not found", 404);
  const token = await sign({ kind: "device", orgId: admin.orgId, storeId: register.storeId, registerId: register.id }, DEVICE_MAX_AGE);
  const jar = await cookies();
  jar.set(DEVICE_COOKIE, token, cookieOpts(DEVICE_MAX_AGE));
  jar.delete(TILL_COOKIE);
  return json({ ok: true });
});

export const DELETE = apiRoute("DELETE /api/till/device", async () => {
  const jar = await cookies();
  jar.delete(DEVICE_COOKIE);
  jar.delete(TILL_COOKIE);
  return json({ ok: true });
});
