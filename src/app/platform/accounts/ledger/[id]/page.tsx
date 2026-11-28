import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { PageHeader } from "@/components/admin";
import { BooksNav } from "@/components/hq/BooksNav";
import { balanceOf } from "@/lib/hq/books";
import { formatMoney } from "@/lib/hq/money";
import { formatGBP } from "@/lib/pos/money";
import { fmtDate, londonDayStart } from "@/lib/dates";
import { SOURCE_LABEL } from "@/lib/hq/labels";

export const metadata = { title: "Ledger" };

const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

export default async function Ledger({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireHq("accounts.view");
  const { id } = await params;
  const sp = await searchParams;
  const from = ok(sp.from), to = ok(sp.to);
  const a = await db.hqAccount.findUnique({ where: { id } });
  if (!a) notFound();
  const gte = from ? londonDayStart(from) : undefined;
  const lt = to ? new Date(londonDayStart(to).getTime() + 86_400_000) : undefined;
  const [before, lines] = await Promise.all([
    gte ? db.hqJournalLine.aggregate({ where: { accountId: id, journal: { date: { lt: gte } } }, _sum: { debitPence: true, creditPence: true, foreignMinor: true } }) : null,
    db.hqJournalLine.findMany({ where: { accountId: id, journal: { date: { gte, lt } } }, include: { journal: true }, orderBy: [{ journal: { date: "asc" } }, { journal: { createdAt: "asc" } }], take: 2000 }),
  ]);
  let run = before ? balanceOf(a.type, before._sum.debitPence ?? 0, before._sum.creditPence ?? 0) : 0;
  let runF = before?._sum.foreignMinor ?? 0;
  const foreign = a.isBank && a.currency !== "GBP";
  return (
    <div>
      <PageHeader title={`${a.code} ${a.name}`} sub={a.isBank ? `Bank account in ${a.currency}` : undefined} actions={a.isBank ? <Link href={`/platform/bank/${a.id}`} className="btn-secondary">Bank statement</Link> : null} />
      <BooksNav current="" />
      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm">
        <div><label className="label">From</label><input type="date" name="from" className="input" defaultValue={from} /></div>
        <div><label className="label">To</label><input type="date" name="to" className="input" defaultValue={to} /></div>
        <button className="btn-secondary">Show</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Date</th><th>Type</th><th>Details</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th>{foreign && <th className="text-right">{a.currency}</th>}</tr></thead>
          <tbody>
            {before && <tr className="text-slate-500"><td colSpan={5}>Brought forward</td><td className="text-right tabular-nums">{formatGBP(run)}</td>{foreign && <td className="text-right tabular-nums">{formatMoney(runF, a.currency)}</td>}</tr>}
            {lines.map((l) => {
              run += balanceOf(a.type, l.debitPence, l.creditPence);
              runF += l.foreignMinor ?? 0;
              return (
                <tr key={l.id}>
                  <td className="whitespace-nowrap">{fmtDate(l.journal.date)}</td>
                  <td className="whitespace-nowrap text-xs">{SOURCE_LABEL[l.journal.source] ?? l.journal.source}</td>
                  <td className="text-sm">{l.journal.memo}{l.journal.reference ? <span className="font-mono text-xs text-slate-500"> {l.journal.reference}</span> : null}{l.description ? <span className="text-slate-400"> · {l.description}</span> : null}</td>
                  <td className="text-right tabular-nums">{l.debitPence ? formatGBP(l.debitPence) : ""}</td>
                  <td className="text-right tabular-nums">{l.creditPence ? formatGBP(l.creditPence) : ""}</td>
                  <td className="text-right tabular-nums">{formatGBP(run)}</td>
                  {foreign && <td className="text-right tabular-nums">{formatMoney(runF, a.currency)}</td>}
                </tr>
              );
            })}
            {!lines.length && <tr><td colSpan={foreign ? 7 : 6} className="text-center text-slate-500">No entries in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
