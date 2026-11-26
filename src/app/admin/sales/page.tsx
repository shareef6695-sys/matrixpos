import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader, StoreTabs, Empty } from "@/components/admin";
import { formatGBP } from "@/lib/pos/money";
import { londonDate, londonRange, fmtDateTime } from "@/lib/dates";

export const metadata = { title: "Sales" };

export default async function Sales({ searchParams }: { searchParams: Promise<{ store?: string; from?: string; to?: string; q?: string }> }) {
  const s = await requireAdmin();
  const sp = await searchParams;
  const from = sp.from || londonDate();
  const to = sp.to || from;
  const stores = await db.store.findMany({ where: { organizationId: s.orgId }, orderBy: { name: "asc" } });
  const sales = await db.sale.findMany({
    where: { organizationId: s.orgId, ...(sp.store ? { storeId: sp.store } : {}), ...(sp.q ? { receiptNo: { contains: sp.q.toUpperCase() } } : { createdAt: londonRange(from, to) }) },
    include: { store: { select: { name: true } }, user: { select: { name: true } }, payments: { select: { method: true } } },
    orderBy: { createdAt: "desc" }, take: 500,
  });
  const total = sales.filter((x) => x.status === "COMPLETED").reduce((a, x) => a + x.totalPence, 0);
  return (
    <div>
      <PageHeader title="Sales" sub={`${sales.length} transactions · ${formatGBP(total)}`} actions={<a className="btn-secondary" href={`/api/admin/export?type=sales&from=${from}&to=${to}`}>Export CSV</a>} />
      <StoreTabs stores={stores} current={sp.store} base="/admin/sales" extra={`from=${from}&to=${to}`} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        {sp.store && <input type="hidden" name="store" value={sp.store} />}
        <div><label className="label">From</label><input type="date" name="from" defaultValue={from} className="input" /></div>
        <div><label className="label">To</label><input type="date" name="to" defaultValue={to} className="input" /></div>
        <div><label className="label">Receipt no.</label><input name="q" defaultValue={sp.q} className="input" placeholder="LDN1-1-000123" /></div>
        <button className="btn-secondary">Show</button>
      </form>
      <div className="card overflow-x-auto p-0">
        {sales.length === 0 ? <div className="p-6"><Empty>No sales in this period.</Empty></div> : (
          <table className="table">
            <thead><tr><th>Receipt</th><th>Time</th><th>Store</th><th>Cashier</th><th>Paid by</th><th className="text-right">Total</th></tr></thead>
            <tbody>{sales.map((x) => (
              <tr key={x.id} className={x.status === "VOIDED" ? "opacity-50 line-through" : ""}>
                <td><Link href={`/admin/sales/${x.id}`} className="font-mono text-brand-700">{x.receiptNo}</Link>{x.kind === "REFUND" && <span className="badge ml-2 bg-red-100 text-red-700">Refund</span>}</td>
                <td>{fmtDateTime(x.createdAt)}</td><td>{x.store.name}</td><td>{x.user.name}</td>
                <td className="text-xs">{[...new Set(x.payments.map((p) => p.method.replace("_", " ").toLowerCase()))].join(", ")}</td>
                <td className="text-right font-semibold">{formatGBP(x.totalPence)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
