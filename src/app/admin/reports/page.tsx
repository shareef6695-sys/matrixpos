import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { salesReport } from "@/lib/server/reports";
import { PageHeader, Stat, StoreTabs } from "@/components/admin";
import { formatGBP } from "@/lib/pos/money";
import { londonDate, addDays, londonRange, fmtDateTime } from "@/lib/dates";
import { PrintButton } from "../sales/[id]/PrintButton";

export const metadata = { title: "Reports" };

const METHOD: Record<string, string> = { CASH: "Cash", CARD_MANUAL: "Card (keyed)", STRIPE_TERMINAL: "Stripe Terminal", SUMUP: "SumUp", DOJO: "Dojo", VOUCHER: "Voucher" };

function quarterStart(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; store?: string }> }) {
  const s = await requireAdmin();
  const sp = await searchParams;
  const today = londonDate();
  const from = sp.from || addDays(today, -29);
  const to = sp.to || today;
  const stores = await db.store.findMany({ where: { organizationId: s.orgId }, orderBy: { name: "asc" } });
  const [r, zs] = await Promise.all([
    salesReport(s.orgId, from, to, sp.store),
    db.shift.findMany({ where: { store: { organizationId: s.orgId }, ...(sp.store ? { storeId: sp.store } : {}), closedAt: londonRange(from, to) }, include: { register: { include: { store: true } }, user: true }, orderBy: { closedAt: "desc" }, take: 50 }),
  ]);
  const maxDay = Math.max(1, ...r.byDay.map((d) => d.gross));
  const maxHour = Math.max(1, ...r.byHour);
  const presets: [string, string, string][] = [
    ["Today", today, today], ["Last 7 days", addDays(today, -6), today], ["Last 30 days", addDays(today, -29), today],
    ["This VAT quarter", quarterStart(today), today], ["This month", today.slice(0, 8) + "01", today],
  ];
  const q = (f: string, t: string) => `?from=${f}&to=${t}${sp.store ? `&store=${sp.store}` : ""}`;

  return (
    <div>
      <PageHeader title="Reports" sub={`${from} to ${to}`} actions={<><PrintButton /><a className="btn-secondary" href={`/api/admin/export?type=sales&from=${from}&to=${to}`}>Export sales CSV</a></>} />
      <StoreTabs stores={stores} current={sp.store} base="/admin/reports" extra={`from=${from}&to=${to}`} />
      <div className="no-print mb-4 flex flex-wrap items-end gap-2">
        {presets.map(([l, f, t]) => <a key={l} href={q(f, t)} className="btn-secondary">{l}</a>)}
        <form className="flex items-end gap-2">
          {sp.store && <input type="hidden" name="store" value={sp.store} />}
          <input type="date" name="from" defaultValue={from} className="input" /><input type="date" name="to" defaultValue={to} className="input" /><button className="btn-primary">Run</button>
        </form>
      </div>

      <div className="print-area space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="Gross sales" value={formatGBP(r.gross)} sub={`${r.count} transactions`} />
          <Stat label="Refunds" value={formatGBP(r.refunds)} />
          <Stat label="Net takings" value={formatGBP(r.net)} />
          <Stat label="Average basket" value={formatGBP(r.avgBasket)} />
          <Stat label="Promotions given" value={formatGBP(r.discounts)} />
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">VAT summary <span className="text-sm font-normal text-slate-500">(for your VAT return, box 1 is output VAT)</span></h2>
          <table className="table">
            <thead><tr><th>Rate</th><th className="text-right">Sales inc. VAT</th><th className="text-right">Net</th><th className="text-right">VAT</th></tr></thead>
            <tbody>
              {r.vatBands.map((v) => <tr key={v.code}><td>{v.code === "EXEMPT" ? "Exempt" : `${v.code.toLowerCase()} ${v.rate / 100}%`}</td><td className="text-right">{formatGBP(v.gross)}</td><td className="text-right">{formatGBP(v.net)}</td><td className="text-right">{formatGBP(v.vat)}</td></tr>)}
              <tr className="font-bold"><td>Total</td><td className="text-right">{formatGBP(r.vatBands.reduce((a, v) => a + v.gross, 0))}</td><td className="text-right">{formatGBP(r.vatBands.reduce((a, v) => a + v.net, 0))}</td><td className="text-right">{formatGBP(r.vat)}</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">If you use a VAT retail scheme or the Flat Rate Scheme, your accountant may calculate the return differently.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card">
            <h2 className="mb-3 font-semibold">Takings by day</h2>
            <div className="flex h-40 items-end gap-[2px]">{r.byDay.map((d) => <div key={d.day} title={`${d.day}: ${formatGBP(d.gross)}`} className="flex-1 rounded-t bg-brand-600" style={{ height: `${(d.gross / maxDay) * 100}%`, minHeight: 1 }} />)}</div>
            <div className="mt-1 flex justify-between text-xs text-slate-400"><span>{from}</span><span>{to}</span></div>
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">Busiest hours</h2>
            <div className="flex h-40 items-end gap-[2px]">{r.byHour.map((v, h) => <div key={h} title={`${h}:00 ${formatGBP(v)}`} className="flex-1 rounded-t bg-sky-500" style={{ height: `${(v / maxHour) * 100}%`, minHeight: 1 }} />)}</div>
            <div className="mt-1 flex justify-between text-xs text-slate-400"><span>00:00</span><span>12:00</span><span>23:00</span></div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card">
            <h2 className="mb-3 font-semibold">Payment methods</h2>
            <table className="table"><tbody>{Object.entries(r.byMethod).map(([m, v]) => <tr key={m}><td>{METHOD[m] ?? m}</td><td className="text-right font-semibold">{formatGBP(v)}</td></tr>)}</tbody></table>
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">By store</h2>
            <table className="table"><tbody>{Object.entries(r.byStore).map(([m, v]) => <tr key={m}><td>{m}</td><td className="text-right font-semibold">{formatGBP(v)}</td></tr>)}</tbody></table>
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">Best sellers</h2>
            <table className="table"><tbody>{r.topProducts.map((p) => <tr key={p.name}><td className="truncate">{p.name}</td><td className="text-right text-slate-500">{p.weighed ? `${(p.qty / 1000).toFixed(1)}kg` : p.qty}</td><td className="text-right font-semibold">{formatGBP(p.revenue)}</td></tr>)}</tbody></table>
          </div>
        </div>

        <div className="card overflow-x-auto">
          <h2 className="mb-3 font-semibold">Till closes (Z reports)</h2>
          <table className="table">
            <thead><tr><th>Z#</th><th>Closed</th><th>Till</th><th>By</th><th className="text-right">Expected cash</th><th className="text-right">Counted</th><th className="text-right">Over / short</th></tr></thead>
            <tbody>{zs.map((z) => {
              const diff = (z.countedCashPence ?? 0) - (z.expectedCashPence ?? 0);
              return <tr key={z.id}><td>{z.zNumber}</td><td>{z.closedAt && fmtDateTime(z.closedAt)}</td><td>{z.register.store.name} · {z.register.name}</td><td>{z.user.name}</td><td className="text-right">{formatGBP(z.expectedCashPence ?? 0)}</td><td className="text-right">{formatGBP(z.countedCashPence ?? 0)}</td><td className={`text-right font-semibold ${diff < 0 ? "text-red-600" : diff > 0 ? "text-amber-600" : "text-emerald-700"}`}>{formatGBP(diff)}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
