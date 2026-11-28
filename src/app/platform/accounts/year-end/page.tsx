import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { catchUpBooks } from "@/lib/server/hq-books";
import { hqSettings, tradingBalances } from "@/lib/server/hq-vat";
import { closeYear, postCorporationTax, reopenYear, saveYearEnd } from "@/lib/server/actions/hq-tax";
import { PageHeader } from "@/components/admin";
import { BooksNav } from "@/components/hq/BooksNav";
import { ActionForm } from "@/components/FormMessage";
import { corporationTax, financialYear, profitAndLoss, yearEndDeadlines } from "@/lib/hq/books";
import { MONTHS } from "@/lib/hq/labels";
import { formatGBP } from "@/lib/pos/money";
import { addDays, fmtDate, londonDate, londonDayStart } from "@/lib/dates";

export const metadata = { title: "Year end" };

const months = (start: string, end: string) => Math.min(12, Math.max(1, (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7)) + 1));

export default async function YearEnd({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const h = await requireHq("accounts.view");
  const sp = await searchParams;
  await catchUpBooks();
  const today = londonDate();
  const [s, first, closed] = await Promise.all([hqSettings(), db.hqJournal.findFirst({ orderBy: { date: "asc" }, select: { date: true } }), db.hqYearEnd.findMany()]);
  const em = s?.yearEndMonth ?? 12, ed = s?.yearEndDay ?? 31;
  // Every company year from the first entry in the books to this one, newest first.
  const years: { start: string; end: string }[] = [];
  let y = financialYear(first ? londonDate(first.date) : today, em, ed);
  while (y.start <= today && years.length < 30) { years.push(y); y = financialYear(addDays(y.end, 1), em, ed); }
  years.reverse();
  const closedBy = new Map(closed.map((c) => [londonDate(c.yearEnd), c]));
  const rows = await Promise.all(years.map(async (yr) => {
    const b = await tradingBalances({ gte: londonDayStart(yr.start), lt: londonDayStart(addDays(yr.end, 1)) });
    const ct = b.find((a) => a.key === "CT_EXPENSE")?.balance ?? 0;
    const profit = profitAndLoss(b).netProfit + ct;
    return { ...yr, profit, ct, estimate: corporationTax(profit, months(yr.start, yr.end)), ended: yr.end < today, closed: closedBy.get(yr.end), d: yearEndDeadlines(yr.end) };
  }));
  const edit = h.can("accounts.edit");
  const exp = (kind: string, from: string, to: string) => `/api/hq/export?kind=${kind}&from=${from}&to=${to}`;
  return (
    <div>
      <PageHeader title="Year end" sub="Corporation Tax, closing the year, and what your accountant needs for the accounts and the CT600." />
      <BooksNav current="/platform/accounts/year-end" />
      {sp.error && <p className="mb-4 text-sm text-red-600">{sp.error}</p>}
      <div className="space-y-6">
        {rows.map((r) => (
          <div key={r.end} className="card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Year to {fmtDate(r.end)} <span className="text-sm font-normal text-slate-500">({fmtDate(r.start)} to {fmtDate(r.end)})</span></h2>
              {r.closed ? <span className="badge bg-emerald-100 text-emerald-800">Closed {fmtDate(r.closed.closedAt)}</span> : r.ended ? <span className="badge bg-amber-100 text-amber-800">Ended, not closed</span> : <span className="badge bg-slate-100 text-slate-700">In progress</span>}
            </div>
            <div className="grid gap-4 text-sm sm:grid-cols-3">
              <div><div className="text-xs uppercase tracking-wide text-slate-500">Profit before tax</div><div className="text-lg font-bold tabular-nums">{formatGBP(r.profit)}</div></div>
              <div><div className="text-xs uppercase tracking-wide text-slate-500">Corporation Tax estimate</div><div className="text-lg font-bold tabular-nums">{formatGBP(r.estimate)}</div><div className="text-xs text-slate-500">19% to £50k, 25% from £250k, marginal relief between{months(r.start, r.end) < 12 ? ", limits cut for a short year" : ""}</div></div>
              <div><div className="text-xs uppercase tracking-wide text-slate-500">Put aside in the books</div><div className="text-lg font-bold tabular-nums">{formatGBP(r.ct)}</div></div>
            </div>
            <ul className="mt-4 grid gap-1 text-sm sm:grid-cols-3">
              <li><span className="text-slate-500">Accounts to Companies House:</span> {fmtDate(r.d.accounts)}</li>
              <li><span className="text-slate-500">Corporation Tax to pay:</span> {fmtDate(r.d.ctPayment)}</li>
              <li><span className="text-slate-500">CT600 to HMRC:</span> {fmtDate(r.d.ct600)}</li>
            </ul>
            <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-slate-100 pt-4 text-sm">
              <a className="btn-secondary" href={exp("tb", r.start, r.end)}>Trial balance (CSV)</a>
              <a className="btn-secondary" href={exp("gl", r.start, r.end)}>General ledger (CSV)</a>
              <a className="btn-secondary" href={exp("pl", r.start, r.end)}>Profit and loss (CSV)</a>
              <a className="btn-secondary" href={`/platform/accounts/reports?r=bs&to=${r.end}`}>Balance sheet</a>
            </div>
            {edit && r.ended && !r.closed && (
              <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2">
                <form action={postCorporationTax} className="space-y-2 text-sm">
                  <input type="hidden" name="yearEnd" value={r.end} />
                  <label className="label">Corporation Tax to put aside (£)</label>
                  <div className="flex gap-2"><input name="taxPounds" className="input" inputMode="decimal" placeholder={`Blank = estimate (${(r.estimate / 100).toFixed(2)})`} /><button className="btn-secondary shrink-0">{r.ct ? "Update" : "Put aside"}</button></div>
                  <p className="text-xs text-slate-500">Use your accountant&apos;s figure once you have it. Posts Dr Corporation Tax, Cr Corporation Tax owed, dated the year end.</p>
                </form>
                <form action={closeYear} className="space-y-2 text-sm">
                  <input type="hidden" name="yearEnd" value={r.end} />
                  <label className="flex items-start gap-2"><input type="checkbox" name="confirm" className="mt-1" /><span>The year is final: everything is in, the bank is reconciled and the Corporation Tax is put aside.</span></label>
                  <button className="btn-primary">Close the year</button>
                  <p className="text-xs text-slate-500">Moves the profit to retained profit and locks the books to {fmtDate(r.end)}. These two entries can be made even if the books are already locked (say, by a VAT return), as they don&apos;t change any VAT.</p>
                </form>
              </div>
            )}
            {r.closed && h.role === "OWNER" && (
              <form action={reopenYear} className="mt-3 text-sm"><input type="hidden" name="yearEnd" value={r.end} /><button className="text-xs text-red-600">Reopen this year</button> <span className="text-xs text-slate-500">(takes the closing entry out; the lock date stays)</span></form>
            )}
          </div>
        ))}
        <div className="card max-w-lg">
          <h2 className="mb-3 font-semibold">Company year end</h2>
          {edit ? (
            <ActionForm action={saveYearEnd} className="space-y-3" submit="Save">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Day</label><input name="yearEndDay" type="number" min={1} max={31} className="input" defaultValue={ed} /></div>
                <div><label className="label">Month</label><select name="yearEndMonth" className="input" defaultValue={em}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
              </div>
              <p className="text-xs text-slate-500">Your accounting reference date, as Companies House shows it. {s?.yearEndMonth ? "" : "Not set, so the calendar year is used."}</p>
            </ActionForm>
          ) : <p className="text-sm">{ed} {MONTHS[em - 1]}</p>}
          <p className="mt-3 text-xs text-slate-500">These dates are for a normal year. A company&apos;s first accounts are due 21 months after it was set up. Payroll will come from a separate app.</p>
        </div>
      </div>
    </div>
  );
}
