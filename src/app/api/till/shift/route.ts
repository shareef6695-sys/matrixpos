import { db } from "@/lib/server/db";
import { postCashMovement, postShiftClose } from "@/lib/server/accounting";
import { tillContext, shiftSummary, nextCounter, json, fail, audit } from "@/lib/server/till";

/** Current shift summary (X report). */
export async function GET() {
  const ctx = await tillContext();
  if (!ctx) return fail("Sign in at the till first", 401);
  const shift = await db.shift.findFirst({ where: { registerId: ctx.device.registerId, closedAt: null } });
  return json({ report: shift ? await shiftSummary(shift.id) : null });
}

/** open | close (Z report) | cash (paid in / paid out / safe drop) */
export async function POST(req: Request) {
  const ctx = await tillContext();
  if (!ctx) return fail("Sign in at the till first", 401);
  const body = await req.json().catch(() => ({}));
  const open = await db.shift.findFirst({ where: { registerId: ctx.device.registerId, closedAt: null } });

  if (body.action === "open") {
    if (open) return json({ shift: open });
    const shift = await db.shift.create({
      data: { storeId: ctx.device.storeId, registerId: ctx.device.registerId, userId: ctx.user.id, openingFloatPence: Math.max(0, Math.trunc(Number(body.floatPence) || 0)) },
    });
    await audit(ctx.device.orgId, ctx.user.id, "shift.open", { float: shift.openingFloatPence });
    return json({ shift });
  }

  if (!open) return fail("No shift is open on this till");

  if (body.action === "cash") {
    const amount = Math.trunc(Number(body.amountPence) || 0);
    if (!amount) return fail("Enter an amount");
    const reason = String(body.reason ?? "").slice(0, 120) || (amount > 0 ? "Paid in" : "Paid out");
    const mv = await db.cashMovement.create({ data: { shiftId: open.id, amountPence: amount, reason, userId: ctx.user.id } });
    await postCashMovement(db, ctx.device.orgId, mv.id, amount, `Till cash: ${reason}`, ctx.user.id);
    return json({ report: await shiftSummary(open.id) });
  }

  if (body.action === "close") {
    if (ctx.user.role === "CASHIER") return fail("A supervisor or manager must close the till", 403);
    const before = await shiftSummary(open.id);
    const zNumber = await db.$transaction((tx) => nextCounter(tx, `z:${ctx.device.registerId}`));
    await db.shift.update({
      where: { id: open.id },
      data: { closedAt: new Date(), countedCashPence: Math.trunc(Number(body.countedCashPence) || 0), expectedCashPence: before!.expectedCash, zNumber },
    });
    const counted = Math.trunc(Number(body.countedCashPence) || 0);
    await postShiftClose(db, ctx.device.orgId, open.id, counted - before!.expectedCash, zNumber, ctx.user.id);
    await audit(ctx.device.orgId, ctx.user.id, "shift.close", { zNumber, counted: body.countedCashPence, expected: before!.expectedCash });
    return json({ report: await shiftSummary(open.id) });
  }
  return fail("Unknown action");
}
