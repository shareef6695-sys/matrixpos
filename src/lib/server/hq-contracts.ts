import "server-only";
import { db } from "./db";
import { sendEmail, appUrl } from "./email";
import { platformEmails } from "./billing";
import { addMonths, daysLeft, renewalState, renewedEnd } from "@/lib/hq/projects";
import { formatMoney } from "@/lib/hq/money";
import { fmtDate, londonDate, londonDayStart } from "@/lib/dates";

/**
 * Runs once a day. Contracts that renew themselves get their next term once the end date has passed.
 * Contracts inside their notice period are emailed to the owner, once per end date, in one email.
 */
export async function runRenewals(now = new Date()) {
  const today = londonDate(now);
  const renewed = await autoRenew(now);
  const active = await db.hqContract.findMany({ where: { status: "ACTIVE", endDate: { not: null } }, include: { client: { select: { name: true } } } });
  const due = active.filter((c) => {
    const s = renewalState({ status: c.status, endDate: londonDate(c.endDate!), noticeDays: c.noticeDays }, today);
    return (s === "due" || s === "overdue") && (!c.remindedFor || c.remindedFor.getTime() !== c.endDate!.getTime());
  });
  let emailed = false;
  const to = platformEmails();
  if (due.length && to.length) {
    const base = await appUrl();
    const lines = due.map((c) => {
      const left = daysLeft(londonDate(c.endDate!), today);
      const when = left < 0 ? `ended ${fmtDate(c.endDate!)}` : left === 0 ? "ends today" : `ends ${fmtDate(c.endDate!)} (${left} day${left === 1 ? "" : "s"})`;
      return `- ${c.client.name}: ${c.title} ${when}${c.autoRenew ? `, renews automatically for ${c.renewMonths} months` : ""}${c.valueMinor ? `, ${formatMoney(c.valueMinor, c.currency)} per term` : ""}\n  ${base}/platform/contracts/${c.id}`;
    });
    emailed = await sendEmail({
      to: to[0],
      subject: `${due.length} contract${due.length === 1 ? "" : "s"} to renew`,
      text: ["These contracts are coming up for renewal:", "", ...lines, "", "Matrix HQ"].join("\n"),
    });
    if (emailed) await Promise.all(due.map((c) => db.hqContract.update({ where: { id: c.id }, data: { remindedFor: c.endDate } })));
  }
  return { renewed, reminders: emailed ? due.length : 0 };
}

/** Gives contracts that renew themselves their next term once the end date has passed. Also run when the contracts are viewed, so they're never shown as lapsed. */
export async function autoRenew(now = new Date()) {
  const today = londonDate(now);
  const lapsed = await db.hqContract.findMany({ where: { status: "ACTIVE", autoRenew: true, endDate: { lt: londonDayStart(today) } } });
  for (const c of lapsed) {
    const r = renewedEnd(londonDate(c.endDate!), c.renewMonths, today);
    await db.hqContract.update({ where: { id: c.id }, data: { endDate: londonDayStart(r.endDate), renewedCount: { increment: r.terms }, remindedFor: null } });
  }
  return lapsed.length;
}

/** The next term's end date when renewing by hand. */
export const nextTerm = (end: Date | null, months: number) => londonDayStart(addMonths(londonDate(end ?? new Date()), months));
