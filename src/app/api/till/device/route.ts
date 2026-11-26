import { cookies } from "next/headers";
import { db } from "@/lib/server/db";
import { getAdmin, cookieOpts } from "@/lib/server/auth";
import { DEVICE_COOKIE, DEVICE_MAX_AGE, TILL_COOKIE, atLeast, sign } from "@/lib/session";
import { json, fail } from "@/lib/server/till";

/** Lists tills a manager can link this device to. */
export async function GET() {
  const admin = await getAdmin();
  if (!admin || !atLeast(admin.role, "MANAGER")) return fail("Sign in as a manager to set up this till", 401);
  const stores = await db.store.findMany({ where: { organizationId: admin.orgId }, include: { registers: { orderBy: { number: "asc" } } }, orderBy: { name: "asc" } });
  return json({ stores: stores.map((s) => ({ id: s.id, name: s.name, code: s.code, registers: s.registers.map((r) => ({ id: r.id, name: r.name })) })) });
}

/** Links this browser to a till. Requires a manager's back office session. */
export async function POST(req: Request) {
  const admin = await getAdmin();
  if (!admin || !atLeast(admin.role, "MANAGER")) return fail("Sign in as a manager to set up this till", 401);
  const { registerId } = await req.json().catch(() => ({}));
  const register = await db.register.findFirst({ where: { id: String(registerId), store: { organizationId: admin.orgId } } });
  if (!register) return fail("Till not found", 404);
  const token = await sign({ kind: "device", orgId: admin.orgId, storeId: register.storeId, registerId: register.id }, DEVICE_MAX_AGE);
  const jar = await cookies();
  jar.set(DEVICE_COOKIE, token, cookieOpts(DEVICE_MAX_AGE));
  jar.delete(TILL_COOKIE);
  return json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(DEVICE_COOKIE);
  jar.delete(TILL_COOKIE);
  return json({ ok: true });
}
