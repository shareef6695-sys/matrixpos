import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";
import { londonDayStart } from "@/lib/dates";
import type { StatementLine } from "@/lib/hq/bank-csv";

/**
 * A fingerprint for a statement line, so importing the same statement twice (or two overlapping ones) adds each
 * line once. Identical lines on the same day (two £5 coffees) are told apart by how many times they appear in the file.
 */
export function importKeys(accountId: string, lines: StatementLine[]) {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const base = `${accountId}|${l.date}|${l.amountMinor}|${l.description.toLowerCase().replace(/\s+/g, " ")}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return createHash("sha256").update(`${base}|${n}`).digest("hex");
  });
}

/** Entries already in the books for this bank account with the same amount, within 10 days, not yet matched. */
export async function matchSuggestions(txn: { id: string; accountId: string; date: Date; amountMinor: number }) {
  const day = 86_400_000;
  const lines = await db.hqJournalLine.findMany({
    where: {
      accountId: txn.accountId, foreignMinor: txn.amountMinor,
      journal: { date: { gte: new Date(txn.date.getTime() - 10 * day), lte: new Date(txn.date.getTime() + 10 * day) }, bankTxn: null },
    },
    include: { journal: true },
    take: 10,
  });
  return lines
    .map((l) => ({ journalId: l.journalId, date: l.journal.date, reference: l.journal.reference, memo: l.journal.memo, source: l.journal.source }))
    .sort((a, b) => Math.abs(a.date.getTime() - txn.date.getTime()) - Math.abs(b.date.getTime() - txn.date.getTime()));
}

/** Open invoices and bills a statement line might be paying, by amount, for the "receive" and "pay" choices. */
export async function openDocumentsFor(amountMinor: number, currency: string) {
  if (amountMinor > 0) {
    return {
      invoices: await db.hqInvoice.findMany({
        where: { status: { in: ["SENT", "PARTIAL"] }, ...(currency === "GBP" ? {} : { currency }) },
        orderBy: { dueDate: "asc" }, take: 200, select: { id: true, number: true, billToName: true, currency: true, totalMinor: true, paidMinor: true },
      }),
      bills: [],
    };
  }
  return {
    invoices: [],
    bills: await db.hqBill.findMany({
      where: { status: { in: ["OPEN", "PARTIAL"] }, ...(currency === "GBP" ? {} : { currency }) },
      orderBy: { dueDate: "asc" }, take: 200, select: { id: true, payee: true, reference: true, currency: true, totalMinor: true, paidMinor: true },
    }),
  };
}

export const statementDate = (ymd: string) => londonDayStart(ymd);
