import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { balances, profitAndLoss, balanceSheet, vatReturn, catchUpSales, type AccountBalance } from "@/lib/server/accounting";
import { PageHeader } from "@/components/admin";
import { formatGBP } from "@/lib/pos/money";
import { londonDate, londonRange, addDays, londonDayStart } from "@/lib/dates";
import { AccountsTabs } from "../Tabs";
import { PrintButton } from "../../sales/[id]/PrintButton";

export const metadata = { title: "Financial reports" };

const TYPES = [["pl", "Profit and loss"], ["bs", "Balance sheet"], ["tb", "Trial balance"], ["vat", "VAT return"]] as const;

function quarter(today: string) {
  const [y, m] = today.split("-").map(Number);
  const qs = Math.floor((m - 1) / 3) * 3 + 1;
  const start = `${y}-${String(qs).padStart(2, "0")}-01`;
  const endMonth = qs + 3 > 12 ? `${y + 1}-01-01` : `${y}-${String(qs + 3).padStart(2, "0")}-01`;
  return [start, addDays(endMonth, -1)] as const;
}

export default async function FinancialReports({ searchParams }: { searchParams: Promise<{ type?: string; from?: string; to?: string }> }) {
  const s = await requireAdmin();
  const sp = await searchParams;
  await catchUpSales(s.orgId);
  const type = TYPES.some(([t]) => t === sp.type) ? sp.type! : "pl";
  const today = londonDate();
  const [qFrom, qTo] = quarter(today);
  const from = sp.from || (type === "vat" ? qFrom : today.slice(0, 8) + "01");
  const to = sp.to || (type === "vat" ? qTo : today);
  const range = londonRange(from, to);
  const link = (t: string) => `/admin/accounts/reports?type=${t}&from=${from}&to=${to}`;

  return (
    <div>
      <PageHeader title={TYPES.find(([t]) => t === type)![1]} sub={type === "bs" || type === "tb" ? `As at ${to}` : `${from} to ${to}`} actions={<PrintButton />} />
      <AccountsTabs current="/admin/accounts/reports" />
      <div className="no-print mb-4 flex flex-wrap items-end gap-2">
        {TYPES.map(([t, l]) => <Link key={t} href={link(t)} className={t === type ? "btn-primary" : "btn-secondary"}>{l}</Link>)}
        <form className="ml-auto flex items-end gap-2">
          <input type="hidden" name="type" value={type} />
          {type !== "bs" && type !== "tb" && <div><label className="label">From</label><input type="date" name="from" defaultValue={from} className="input" /></div>}
          <div><label className="label">{type === "bs" || type === "tb" ? "As at" : "To"}</label><input type="date" name="to" defaultValue={to} className="input" /></div>
          <button className="btn-secondary">Run</button>
        </form>
      </div>
      <div className="print-area card max-w-3xl">
        {type === "pl" && <PL orgId={s.orgId} range={range} />}
        {type === "bs" && <BS orgId={s.orgId} asAt={londonDayStart(addDays(to, 1))} />}
        {type === "tb" && <TB orgId={s.orgId} asAt={londonDayStart(addDays(to, 1))} />}
        {type === "vat" && <VAT orgId={s.orgId} range={range} />}
      </div>
    </div>
  );
}

const Row = ({ l, v, bold, indent, href }: { l: string; v: number; bold?: boolean; indent?: boolean; href?: string }) => (
  <tr className={bold ? "font-semibold" : ""}><td className={indent ? "pl-6" : ""}>{href ? <Link className="text-brand-700" href={href}>{l}</Link> : l}</td><td className="text-right tabular-nums">{formatGBP(v)}</td></tr>
);
const acctRows = (list: AccountBalance[]) => list.map((a) => <Row key={a.id} l={`${a.code} ${a.name}`} v={a.balance} indent href={`/admin/accounts/journals?account=${a.id}`} />);

async function PL({ orgId, range }: { orgId: string; range: { gte: Date; lt: Date } }) {
  const p = await profitAndLoss(orgId, range);
  return (
    <table className="table"><tbody>
      <tr><td colSpan={2} className="font-bold">Income</td></tr>{acctRows(p.income)}<Row l="Total income" v={p.totalIncome} bold />
      <tr><td colSpan={2} className="pt-4 font-bold">Cost of sales</td></tr>{acctRows(p.cos)}<Row l="Total cost of sales" v={p.totalCos} bold />
      <Row l={`Gross profit${p.totalIncome ? ` (${((p.grossProfit / p.totalIncome) * 100).toFixed(1)}% margin)` : ""}`} v={p.grossProfit} bold />
      <tr><td colSpan={2} className="pt-4 font-bold">Overheads</td></tr>{acctRows(p.overheads)}<Row l="Total overheads" v={p.totalOverheads} bold />
      <tr className="text-lg font-bold"><td>Net profit</td><td className={`text-right ${p.netProfit < 0 ? "text-red-600" : "text-emerald-700"}`}>{formatGBP(p.netProfit)}</td></tr>
    </tbody></table>
  );
}

async function BS({ orgId, asAt }: { orgId: string; asAt: Date }) {
  const b = await balanceSheet(orgId, asAt);
  return (
    <table className="table"><tbody>
      <tr><td colSpan={2} className="font-bold">Assets</td></tr>{acctRows(b.assets)}<Row l="Total assets" v={b.totalAssets} bold />
      <tr><td colSpan={2} className="pt-4 font-bold">Liabilities</td></tr>{acctRows(b.liabilities)}<Row l="Total liabilities" v={b.totalLiabilities} bold />
      <Row l="Net assets" v={b.netAssets} bold />
      <tr><td colSpan={2} className="pt-4 font-bold">Capital and reserves</td></tr>{acctRows(b.equity)}<Row l="Profit to date" v={b.profit} indent />
      <Row l="Total capital" v={b.totalEquity} bold />
      {b.netAssets !== b.totalEquity && <tr><td colSpan={2} className="text-red-600">Out of balance by {formatGBP(b.netAssets - b.totalEquity)}</td></tr>}
    </tbody></table>
  );
}

async function TB({ orgId, asAt }: { orgId: string; asAt: Date }) {
  const b = (await balances(orgId, { lt: asAt })).filter((a) => a.debit || a.credit);
  const net = b.map((a) => ({ ...a, dr: Math.max(0, a.debit - a.credit), cr: Math.max(0, a.credit - a.debit) }));
  const d = net.reduce((x, a) => x + a.dr, 0), c = net.reduce((x, a) => x + a.cr, 0);
  return (
    <table className="table">
      <thead><tr><th>Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
      <tbody>
        {net.map((a) => <tr key={a.id}><td><Link className="text-brand-700" href={`/admin/accounts/journals?account=${a.id}`}>{a.code} {a.name}</Link></td><td className="text-right">{a.dr ? formatGBP(a.dr) : ""}</td><td className="text-right">{a.cr ? formatGBP(a.cr) : ""}</td></tr>)}
        <tr className="font-bold"><td>Totals</td><td className="text-right">{formatGBP(d)}</td><td className={`text-right ${d !== c ? "text-red-600" : ""}`}>{formatGBP(c)}</td></tr>
      </tbody>
    </table>
  );
}

async function VAT({ orgId, range }: { orgId: string; range: { gte: Date; lt: Date } }) {
  const v = await vatReturn(orgId, range);
  const rows: [string, string, string][] = [
    ["1", "VAT due on sales and other outputs", formatGBP(v.box1)],
    ["2", "VAT due on acquisitions from the EU (Northern Ireland only)", formatGBP(v.box2)],
    ["3", "Total VAT due (box 1 + box 2)", formatGBP(v.box3)],
    ["4", "VAT reclaimed on purchases and other inputs", formatGBP(v.box4)],
    ["5", v.box5 >= 0 ? "Net VAT to pay to HMRC" : "Net VAT to reclaim from HMRC", formatGBP(Math.abs(v.box5))],
    ["6", "Total value of sales excluding VAT (whole £)", `£${v.box6.toLocaleString("en-GB")}`],
    ["7", "Total value of purchases excluding VAT (whole £)", `£${v.box7.toLocaleString("en-GB")}`],
    ["8", "Supplies of goods to the EU (Northern Ireland only)", "£0"],
    ["9", "Acquisitions of goods from the EU (Northern Ireland only)", "£0"],
  ];
  return (
    <>
      <table className="table">
        <thead><tr><th>Box</th><th>Description</th><th className="text-right">Amount</th></tr></thead>
        <tbody>{rows.map(([b, d, a]) => <tr key={b} className={b === "5" ? "font-bold" : ""}><td>{b}</td><td>{d}</td><td className="text-right tabular-nums">{a}</td></tr>)}</tbody>
      </table>
      <p className="mt-4 text-xs text-slate-500">
        Worked out from your MatrixPOS ledger on standard VAT accounting. Box 7 counts bills and expenses entered under Accounts. Submit through
        HMRC-recognised Making Tax Digital software or bridging software, or give these figures to your accountant. If you use the Flat Rate Scheme, cash accounting or a retail scheme, your return will be calculated differently.
      </p>
    </>
  );
}
