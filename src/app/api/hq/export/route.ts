import type { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { hqSession } from "@/lib/server/hq";
import { hqBalances } from "@/lib/server/hq-books";
import { tradingBalances } from "@/lib/server/hq-vat";
import { apiRoute } from "@/lib/server/errors";
import { profitAndLoss, trialBalance } from "@/lib/hq/books";
import { csv } from "@/lib/csv";
import { addDays, londonDate, londonDayStart } from "@/lib/dates";

export const dynamic = "force-dynamic";

const ok = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const gbp = (p: number) => (p / 100).toFixed(2);

/** The books as CSV for the accountant: trial balance, general ledger, or profit and loss. */
export const GET = apiRoute("GET /api/hq/export", async (req: NextRequest) => {
  const h = await hqSession();
  if (!h || !h.can("accounts.view")) return new Response("Not found", { status: 404 });
  const p = req.nextUrl.searchParams;
  const kind = p.get("kind");
  const to = ok(p.get("to")) ?? londonDate();
  const from = ok(p.get("from")) ?? `${to.slice(0, 4)}-01-01`;
  const lt = londonDayStart(addDays(to, 1)), gte = londonDayStart(from);
  let rows: unknown[][];
  if (kind === "tb") {
    const t = trialBalance(await hqBalances({ lt }));
    rows = [["code", "account", "debit", "credit"], ...t.rows.map((r) => [r.code, r.name, r.dr ? gbp(r.dr) : "", r.cr ? gbp(r.cr) : ""]), ["", "Total", gbp(t.totalDr), gbp(t.totalCr)]];
  } else if (kind === "pl") {
    const pl = profitAndLoss(await tradingBalances({ gte, lt }));
    const ct = pl.overheads.find((a) => a.key === "CT_EXPENSE")?.balance ?? 0;
    rows = [["section", "code", "account", "amount"],
      ...pl.income.map((a) => ["Income", a.code, a.name, gbp(a.balance)]), ["", "", "Total income", gbp(pl.totalIncome)],
      ...pl.cos.map((a) => ["Cost of sales", a.code, a.name, gbp(a.balance)]), ["", "", "Gross profit", gbp(pl.grossProfit)],
      ...pl.overheads.filter((a) => a.key !== "CT_EXPENSE").map((a) => ["Overheads", a.code, a.name, gbp(a.balance)]),
      ["", "", "Profit before tax", gbp(pl.netProfit + ct)], ["Tax", "8000", "Corporation Tax", gbp(ct)], ["", "", "Profit after tax", gbp(pl.netProfit)]];
  } else if (kind === "gl") {
    const lines = await db.hqJournalLine.findMany({
      where: { journal: { date: { gte, lt } } },
      include: { journal: true, account: { select: { code: true, name: true } } },
      orderBy: [{ account: { code: "asc" } }, { journal: { date: "asc" } }, { journal: { createdAt: "asc" } }],
    });
    rows = [["account_code", "account", "date", "reference", "type", "memo", "description", "debit", "credit"],
      ...lines.map((l) => [l.account.code, l.account.name, londonDate(l.journal.date), l.journal.reference, l.journal.source, l.journal.memo, l.description, l.debitPence ? gbp(l.debitPence) : "", l.creditPence ? gbp(l.creditPence) : ""])];
  } else return new Response("Unknown export", { status: 400 });
  const name = { tb: `trial-balance-${to}`, pl: `profit-and-loss-${from}-to-${to}`, gl: `general-ledger-${from}-to-${to}` }[kind];
  return new Response(csv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="matrix-infotech-${name}.csv"`, "cache-control": "no-store" } });
});
