import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { salesReport, lowStock } from "@/lib/server/reports";
import { londonDate, addDays, fmtDateTime } from "@/lib/dates";
import { formatGBP } from "@/lib/pos/money";
import { PageHeader, Stat } from "@/components/admin";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string; denied?: string }> }) {
  const s = await requireAdmin();
  const sp = await searchParams;
  const today = londonDate();
  const hour = parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(new Date()), 10);
  const [todayR, weekR, low, recent, counts] = await Promise.all([
    salesReport(s.orgId, today, today),
    salesReport(s.orgId, addDays(today, -6), today),
    lowStock(s.orgId),
    db.sale.findMany({ where: { organizationId: s.orgId }, orderBy: { createdAt: "desc" }, take: 8, include: { store: { select: { name: true } }, user: { select: { name: true } } } }),
    Promise.all([db.product.count({ where: { organizationId: s.orgId } }), db.user.count({ where: { organizationId: s.orgId } }), db.register.count({ where: { store: { organizationId: s.orgId } } })]),
  ]);
  const max = Math.max(1, ...weekR.byDay.map((d) => d.gross));
  const [productCount, staffCount] = counts;

  return (
    <div>
      <PageHeader title={`Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${s.name.split(" ")[0]}`} sub={`Today, ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" })}`}
        actions={<Link href="/till" className="btn-primary">Open till</Link>} />

      {sp.denied && <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Only the business owner can open that page.</div>}
      {(sp.welcome || productCount < 3) && (
        <div className="card mb-6 border-brand-100 bg-brand-50">
          <h2 className="font-bold text-brand-900">Get your shop ready</h2>
          <ol className="mt-2 grid gap-2 text-sm text-brand-900 sm:grid-cols-2 lg:grid-cols-4">
            <li><Link className="underline" href="/admin/products">1. Add or import products</Link> {productCount >= 3 && "✓"}</li>
            <li><Link className="underline" href="/admin/staff">2. Add staff and PINs</Link> {staffCount > 1 && "✓"}</li>
            <li><Link className="underline" href="/admin/settings">3. Switch on the features you need</Link></li>
            <li><Link className="underline" href="/till">4. Set up this device as a till</Link></li>
          </ol>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Takings today" value={formatGBP(todayR.net)} sub={`${todayR.count} sales`} />
        <Stat label="Average basket" value={formatGBP(todayR.avgBasket)} />
        <Stat label="VAT collected today" value={formatGBP(todayR.vat)} />
        <Stat label="Last 7 days" value={formatGBP(weekR.net)} sub={`${weekR.count} sales`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-4 font-semibold">Takings, last 7 days</h2>
          <div className="flex h-48 items-end gap-2">
            {weekR.byDay.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div className="text-[10px] tabular-nums text-slate-500">{d.gross ? formatGBP(d.gross).replace(/\.\d\d$/, "") : ""}</div>
                <div className="w-full rounded-t-md bg-brand-600" style={{ height: `${(d.gross / max) * 150}px`, minHeight: 2 }} />
                <div className="text-xs text-slate-500">{new Date(d.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short" })}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Low stock</h2><Link className="text-sm text-brand-700" href="/admin/stock?low=1">View all</Link></div>
          {low.length === 0 ? <p className="text-sm text-slate-500">Everything is above its reorder level.</p> : (
            <ul className="space-y-2 text-sm">
              {low.slice(0, 8).map((r) => (
                <li key={`${r.storeId}${r.productId}`} className="flex justify-between gap-2"><span className="truncate">{r.product.name} <span className="text-xs text-slate-400">{r.store.name}</span></span><span className="font-semibold text-red-600">{r.product.unit === "PER_KG" ? `${(r.quantity / 1000).toFixed(1)}kg` : r.quantity}</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Best sellers today</h2>
          {todayR.topProducts.length === 0 ? <p className="text-sm text-slate-500">No sales yet today.</p> : (
            <table className="table"><tbody>{todayR.topProducts.slice(0, 6).map((p) => <tr key={p.name}><td>{p.name}</td><td className="text-right text-slate-500">{p.weighed ? `${(p.qty / 1000).toFixed(2)}kg` : p.qty}</td><td className="text-right font-semibold">{formatGBP(p.revenue)}</td></tr>)}</tbody></table>
          )}
        </div>
        <div className="card">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Recent sales</h2><Link className="text-sm text-brand-700" href="/admin/sales">View all</Link></div>
          {recent.length === 0 ? <p className="text-sm text-slate-500">No sales yet.</p> : (
            <table className="table"><tbody>{recent.map((r) => (
              <tr key={r.id}><td><Link className="font-medium text-brand-700" href={`/admin/sales/${r.id}`}>{r.receiptNo}</Link><div className="text-xs text-slate-400">{fmtDateTime(r.createdAt)} · {r.store.name} · {r.user.name}</div></td>
                <td className="text-right font-semibold">{r.kind === "REFUND" && <span className="badge mr-2 bg-red-100 text-red-700">Refund</span>}{formatGBP(r.totalPence)}</td></tr>
            ))}</tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}
