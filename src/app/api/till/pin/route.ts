import { cookies } from "next/headers";
import { cookieOpts, orgAllowed } from "@/lib/server/auth";
import { TILL_COOKIE, TILL_MAX_AGE, sign } from "@/lib/session";
import { deviceContext, userByPin, json, fail, audit } from "@/lib/server/till";

const attempts = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  const ctx = await deviceContext();
  if (!ctx) return fail("This device is not set up as a till", 401);
  if (!(await orgAllowed(ctx.device.orgId))) return fail("This shop's MatrixPOS subscription isn't active. The owner can sort it out under Billing in the back office.", 402);
  const key = ctx.register.id;
  const a = attempts.get(key);
  if (a && a.until > Date.now()) return fail("Too many wrong PINs. Wait a minute and try again.", 429);

  const { pin } = await req.json().catch(() => ({}));
  const user = await userByPin(ctx.device.orgId, String(pin ?? ""), ctx.register.storeId);
  if (!user) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(key, { n: n >= 5 ? 0 : n, until: n >= 5 ? Date.now() + 60_000 : 0 });
    return fail("PIN not recognised", 401);
  }
  attempts.delete(key);
  const token = await sign({ kind: "till", userId: user.id, orgId: user.organizationId, registerId: ctx.register.id, role: user.role, name: user.name }, TILL_MAX_AGE);
  (await cookies()).set(TILL_COOKIE, token, cookieOpts(TILL_MAX_AGE));
  await audit(user.organizationId, user.id, "till.signin", { register: ctx.register.name });
  return json({ user: { id: user.id, name: user.name, role: user.role } });
}
