import { cookies } from "next/headers";
import { cookieOpts, orgAllowed } from "@/lib/server/auth";
import { TILL_COOKIE, TILL_MAX_AGE, sign } from "@/lib/session";
import { deviceContext, userByPin, json, fail, audit } from "@/lib/server/till";
import { isLimited, recordAttempt } from "@/lib/server/ratelimit";
import { apiRoute } from "@/lib/server/errors";

export const POST = apiRoute("POST /api/till/pin", async (req: Request) => {
  const ctx = await deviceContext();
  if (!ctx) return fail("This device is not set up as a till", 401);
  if (!(await orgAllowed(ctx.device.orgId))) return fail("This shop's MatrixPOS subscription isn't active. The owner can sort it out under Billing in the back office.", 402);
  // Stored in the database so the limit holds across server instances: 5 wrong PINs a minute per till, 30 in 15 minutes per business.
  const keys = [`pin:${ctx.register.id}`, `pinorg:${ctx.device.orgId}`];
  if ((await isLimited(keys[0], 5, 1)) || (await isLimited(keys[1], 30, 15))) return fail("Too many wrong PINs. Wait a minute and try again.", 429);

  const { pin } = await req.json().catch(() => ({}));
  const user = await userByPin(ctx.device.orgId, String(pin ?? ""), ctx.register.storeId);
  if (!user) {
    await recordAttempt(keys, false);
    return fail("PIN not recognised", 401);
  }
  const token = await sign({ kind: "till", userId: user.id, orgId: user.organizationId, registerId: ctx.register.id, role: user.role }, TILL_MAX_AGE);
  (await cookies()).set(TILL_COOKIE, token, cookieOpts(TILL_MAX_AGE));
  await audit(user.organizationId, user.id, "till.signin", { register: ctx.register.name });
  return json({ user: { id: user.id, name: user.name, role: user.role } });
});
