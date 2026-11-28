import "server-only";
import { db } from "./db";
import { nextInvoiceNumber, publicToken, rateFor } from "./hq";
import { billTo, emailHqInvoice } from "./hq-docs";
import { postInvoice, HqLockedError } from "./hq-books";
import { parseLines } from "@/lib/hq/lines";
import { addPeriod } from "@/lib/hq/bill-lines";
import { seller } from "@/lib/legal";
import { addDays, londonDate, londonDayStart } from "@/lib/dates";

/**
 * Makes every repeating invoice that is due (its next date is today or earlier), then moves its next date on.
 * Each one is made in its own transaction, at most 24 periods per run so a long-paused schedule can't flood.
 * Returns what happened, for the cron job's log and the HQ page.
 */
export async function runRecurring(now = new Date()) {
  const today = londonDate(now);
  const due = await db.hqRecurring.findMany({ where: { active: true, nextDate: { lte: londonDayStart(today) } }, include: { client: { include: { contacts: true } } } });
  const out = { made: 0, emailed: 0, problems: [] as string[] };
  for (const r of due) {
    let next = londonDate(r.nextDate);
    for (let guard = 0; guard < 24 && next <= today; guard++) {
      if (r.endDate && londonDayStart(next) > r.endDate) break;
      const rate = await rateFor(r.currency, londonDayStart(next));
      const parsed = parseLines(JSON.stringify(r.lines), r.currency, seller().chargeVat);
      if ("error" in parsed) { out.problems.push(`${r.client.name}: ${parsed.error}`); break; }
      if (rate === null) { out.problems.push(`${r.client.name}: no exchange rate for ${r.currency}`); break; }
      const issue = londonDayStart(next);
      try {
        const inv = await db.$transaction(async (tx) => {
          const created = await tx.hqInvoice.create({
            data: {
              number: await nextInvoiceNumber(issue), clientId: r.clientId, hqRecurringId: r.id, title: r.title, issueDate: issue,
              dueDate: londonDayStart(addDays(next, r.client.paymentDays)), currency: r.currency, perGbp: rate, ...parsed.totals,
              notes: r.notes, terms: r.terms, publicToken: publicToken(), createdById: r.createdById, ...billTo(r.client),
              status: r.autoSend ? "SENT" : "DRAFT", sentAt: r.autoSend ? new Date() : null,
              lines: { create: parsed.lines.map(({ itemId, position, description, quantity, unitMinor, discountPct, taxPct, amountMinor }) => ({ itemId, position, description, quantity, unitMinor, discountPct, taxPct, amountMinor })) },
            },
          });
          if (r.autoSend) await postInvoice(tx, created.id, r.createdById);
          next = addPeriod(next, r.frequency);
          await tx.hqRecurring.update({ where: { id: r.id }, data: { nextDate: londonDayStart(next), lastRunAt: new Date(), active: !r.endDate || londonDayStart(next) <= r.endDate } });
          return created;
        });
        out.made++;
        if (r.autoSend) {
          const problem = await emailHqInvoice(inv.id);
          if (problem) out.problems.push(`${r.client.name} (${inv.number}): ${problem}`);
          else out.emailed++;
        }
      } catch (e) {
        if (e instanceof HqLockedError) { out.problems.push(`${r.client.name}: ${e.message}`); break; }
        throw e;
      }
    }
  }
  return out;
}
