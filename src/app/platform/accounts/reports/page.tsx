import { Fragment } from "react";
import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { hqBalances } from "@/lib/server/hq-books";
import { tradingBalances } from "@/lib/server/hq-vat";
import { PageHeader } from "@/components/admin";
import { BooksNav } from "@/components/hq/BooksNav";
import { PrintButton } from "@/components/PrintButton";
import { balanceSheet, cashFlow, profitAndLoss, trialBalance, type Balance } from "@/lib/hq/books";
import { formatMoney, toGbpPence } from "@/lib/hq/money";
import { formatGBP } from "@/lib/pos/money";
import { fmtDate, londonDate, londonDayStart } from "@/lib/dates";

export const metadata = { title: "Reports" };

const REPORTS = [["pl", "Profit and loss"], ["bs", "Balance sheet"], ["cf", "Cash flow"], ["tb", "Trial balance"], ["debtors", "Aged debtors"], ["creditors", "Aged creditors"]] as const;
const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
const DAY = 86_400_000;

function Rows({ title, rows, total, totalLabel }: { title?: string; rows: Balance[]; total?: number; totalLabel?: string }) {
  return (
    <>
      {title && <tr><td colSpan={2} className="pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</td></tr>}
      {rows.map((r) => (
        <tr key={r.id}><td className="py-1 pl-3"><Link href={`/platform/accounts/ledger/${r.id}`} className="hover:text-violet-700"><span className="font-mono text-xs text-slate-400">{r.code}</span> {r.name}</Link></td><td className="text-right tabular-nums">{formatGBP(r.balance)}</td></tr>
      ))}
      {total !== undefined && <tr className="font-semibold"><td className="border-t border-slate-200 py-1">{totalLabel}</td><td className="border-t border-slate-200 text-right tabular-nums">{formatGBP(total)}</td></tr>}
    </>
  );
}

const Total = ({ label, n, big }: { label: string; n: number; big?: boolean }) => (
  <tr className={big ? "text-base font-bold" : "font-semibold"}><td className="border-t-2 border-slate-300 py-2">{label}</td><td className="border-t-2 border-slate-300 text-right tabular-nums">{formatGBP(n)}</td></tr>
);

async function Aged({ kind }: { kind: "debtors" | "creditors" }) {
  const now = Date.now();
  const docs = kind === "debtors"
    ? (await db.hqInvoice.findMany({ where: { status: { in: ["SENT", "PARTIAL"] } }, include: { client: { select: { name: true } } } })).map((i) => ({ who: i.client.name, href: `/platform/invoices/${i.id}`, ref: i.number, due: i.dueDate, left: i.totalMinor - i.paidMinor, currency: i.currency, rate: Number(i.perGbp) }))
    : (await db.hqBill.findMany({ where: { status: { in: ["OPEN", "PARTIAL"] } } })).map((b) => ({ who: b.payee, href: `/platform/bills/${b.id}`, ref: b.reference ?? "", due: b.dueDate, left: b.totalMinor - b.paidMinor, currency: b.currency, rate: Number(b.perGbp) }));
  const cols = ["Not due", "1–30 days", "31–60 days", "61–90 days", "Over 90"] as const;
  const bucket = (due: Date) => { const late = Math.floor((now - due.getTime()) / DAY); return late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4; };
  const byWho = new Map<string, number[]>();
  for (const d of docs) {
    const row = byWho.get(d.who) ?? [0, 0, 0, 0, 0];
    row[bucket(d.due)] += toGbpPence(d.left, d.currency, d.rate);
    byWho.set(d.who, row);
  }
  const totals = cols.map((_, i) => [...byWho.values()].reduce((n, r) => n + r[i], 0));
  return (
    <>
      <table className="table">
        <thead><tr><th>{kind === "debtors" ? "Client" : "Supplier"}</th>{cols.map((c) => <th key={c} className="text-right">{c}</th>)}<th className="text-right">Total</th></tr></thead>
        <tbody>
          {[...byWho].sort((a, b) => a[0].localeCompare(b[0])).map(([who, r]) => (
            <tr key={who}><td>{who}</td>{r.map((n, i) => <td key={i} className="text-right tabular-nums">{n ? formatGBP(n) : ""}</td>)}<td className="text-right font-semibold tabular-nums">{formatGBP(r.reduce((a, b) => a + b, 0))}</td></tr>
          ))}
          <tr className="font-bold">{["Total", ...totals.map(formatGBP), formatGBP(totals.reduce((a, b) => a + b, 0))].map((v, i) => <td key={i} className={i ? "text-right tabular-nums" : ""}>{v}</td>)}</tr>
        </tbody>
      </table>
      <h3 className="mb-2 mt-6 text-sm font-semibold">Each {kind === "debtors" ? "invoice" : "bill"}</h3>
      <table className="table text-sm">
        <tbody>
          {docs.sort((a, b) => a.due.getTime() - b.due.getTime()).map((d) => (
            <tr key={d.href}><td><Link href={d.href} className="text-violet-700">{d.ref || "(no reference)"}</Link></td><td>{d.who}</td><td>Due {fmtDate(d.due)}</td><td className="text-right tabular-nums">{formatMoney(d.left, d.currency)}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ r?: string; from?: string; to?: string }> }) {
  await requireHq("accounts.view");
  const sp = await searchParams;
  const r = REPORTS.some(([k]) => k === sp.r) ? sp.r! : "pl";
  const today = londonDate();
  const from = ok(sp.from) ?? `${today.slice(0, 4)}-01-01`;
  const to = ok(sp.to) ?? today;
  const gte = londonDayStart(from), lt = new Date(londonDayStart(to).getTime() + DAY);
  const pointInTime = r === "bs" || r === "tb";
  const title = REPORTS.find(([k]) => k === r)![1];
  let body: React.ReactNode;
  if (r === "pl") {
    const p = profitAndLoss(await tradingBalances({ gte, lt }));
    // Corporation Tax is shown below the profit before tax, not as an overhead.
    const ct = p.overheads.find((a) => a.key === "CT_EXPENSE");
    const overheads = p.overheads.filter((a) => a !== ct);
    const before = p.netProfit + (ct?.balance ?? 0);
    body = (
      <table className="w-full text-sm"><tbody>
        <Rows title="Income" rows={p.income} total={p.totalIncome} totalLabel="Total income" />
        {p.cos.length > 0 && <Rows title="Cost of sales" rows={p.cos} total={p.totalCos} totalLabel="Total cost of sales" />}
        <Total label="Gross profit" n={p.grossProfit} />
        <Rows title="Overheads" rows={overheads} total={p.totalOverheads - (ct?.balance ?? 0)} totalLabel="Total overheads" />
        <Total label="Profit before tax" n={before} big />
        {ct && <><Rows rows={[ct]} /><Total label="Profit after tax" n={p.netProfit} big /></>}
      </tbody></table>
    );
  } else if (r === "bs") {
    const b = balanceSheet(await hqBalances({ lt }));
    body = (
      <table className="w-full text-sm"><tbody>
        <Rows title="Assets" rows={b.assets} total={b.totalAssets} totalLabel="Total assets" />
        <Rows title="Liabilities" rows={b.liabilities} total={b.totalLiabilities} totalLabel="Total liabilities" />
        <Total label="Net assets" n={b.netAssets} big />
        <Rows title="Capital and reserves" rows={b.equity} />
        <tr><td className="py-1 pl-3">Profit not yet moved to retained profit</td><td className="text-right tabular-nums">{formatGBP(b.profit)}</td></tr>
        <Total label="Total capital and reserves" n={b.totalEquity} big />
        {b.netAssets !== b.totalEquity && <tr><td colSpan={2} className="pt-3 text-xs text-red-700">These don&apos;t agree, which shouldn&apos;t happen. Please report it.</td></tr>}
      </tbody></table>
    );
  } else if (r === "tb") {
    const t = trialBalance(await hqBalances({ lt }));
    body = (
      <table className="table text-sm">
        <thead><tr><th>Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
        <tbody>
          {t.rows.map((x) => <tr key={x.id}><td><span className="font-mono text-xs text-slate-400">{x.code}</span> {x.name}</td><td className="text-right tabular-nums">{x.dr ? formatGBP(x.dr) : ""}</td><td className="text-right tabular-nums">{x.cr ? formatGBP(x.cr) : ""}</td></tr>)}
          <tr className="font-bold"><td>Total</td><td className="text-right tabular-nums">{formatGBP(t.totalDr)}</td><td className="text-right tabular-nums">{formatGBP(t.totalCr)}</td></tr>
        </tbody>
      </table>
    );
  } else if (r === "cf") {
    const [accounts, journals, opening, closing] = await Promise.all([
      db.hqAccount.findMany(),
      db.hqJournal.findMany({ where: { date: { gte, lt } }, include: { lines: true } }),
      hqBalances({ lt: gte }), hqBalances({ lt }),
    ]);
    const c = cashFlow(journals.map((j) => ({ lines: j.lines.map((l) => ({ accountId: l.accountId, debit: l.debitPence, credit: l.creditPence })) })), new Map(accounts.map((a) => [a.id, a])));
    const cash = (b: Balance[]) => b.filter((a) => a.isBank).reduce((n, a) => n + a.balance, 0);
    body = (
      <table className="w-full text-sm"><tbody>
        <tr><td className="py-1">Cash at the start</td><td className="text-right tabular-nums">{formatGBP(cash(opening))}</td></tr>
        {(["Operating", "Investing", "Financing"] as const).map((s) => (
          <Fragment key={s}>
            <tr><td colSpan={2} className="pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{s}</td></tr>
            {c.rows.filter((x) => x.section === s).map((x) => <tr key={x.id}><td className="py-1 pl-3"><span className="font-mono text-xs text-slate-400">{x.code}</span> {x.name}</td><td className="text-right tabular-nums">{formatGBP(x.amount)}</td></tr>)}
          </Fragment>
        ))}
        <Total label="Net change in cash" n={c.net} />
        <Total label="Cash at the end" n={cash(closing)} big />
        <tr><td colSpan={2} className="pt-2 text-xs text-slate-500">Bank accounts in other currencies are counted in GBP at the rate of each entry.</td></tr>
      </tbody></table>
    );
  } else body = <Aged kind={r as "debtors" | "creditors"} />;
  return (
    <div>
      <PageHeader title="Reports" sub="All amounts in GBP. Print, or save as PDF, for your accountant." actions={<PrintButton />} />
      <BooksNav current="/platform/accounts/reports" />
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        {REPORTS.map(([k, label]) => <Link key={k} href={`/platform/accounts/reports?r=${k}&from=${from}&to=${to}`} className={`badge px-3 py-1.5 text-sm ${r === k ? "bg-slate-800 text-white" : "bg-white ring-1 ring-slate-200"}`}>{label}</Link>)}
      </div>
      {r !== "debtors" && r !== "creditors" && (
        <form className="mb-4 flex flex-wrap items-end gap-2 text-sm print:hidden">
          <input type="hidden" name="r" value={r} />
          {!pointInTime && <div><label className="label">From</label><input type="date" name="from" className="input" defaultValue={from} /></div>}
          <div><label className="label">{pointInTime ? "As at" : "To"}</label><input type="date" name="to" className="input" defaultValue={to} /></div>
          <button className="btn-secondary">Show</button>
        </form>
      )}
      <div className="card max-w-4xl overflow-x-auto">
        <h2 className="text-lg font-bold">Matrix Infotech Ltd · {title}</h2>
        <p className="mb-4 text-sm text-slate-500">{r === "debtors" || r === "creditors" ? `As at ${fmtDate(new Date())}` : pointInTime ? `As at ${fmtDate(londonDayStart(to))}` : `${fmtDate(gte)} to ${fmtDate(londonDayStart(to))}`}</p>
        {body}
      </div>
    </div>
  );
}
