import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ensureChart } from "@/lib/server/accounting";
import { PageHeader } from "@/components/admin";
import { formatGBP } from "@/lib/pos/money";
import { fmtDate, londonDate } from "@/lib/dates";
import { AccountsTabs } from "../Tabs";
import { BillForm } from "./BillForm";

export const metadata = { title: "Bills & expenses" };

export default async function Bills({ searchParams }: { searchParams: Promise<{ show?: string; po?: string }> }) {
  const s = await requireAdmin();
  const sp = await searchParams;
  await ensureChart(s.orgId);
  const [accounts, suppliers, bills, po] = await Promise.all([
    db.ledgerAccount.findMany({ where: { organizationId: s.orgId, archived: false }, orderBy: { code: "asc" } }),
    db.supplier.findMany({ where: { organizationId: s.orgId }, orderBy: { name: "asc" } }),
    db.bill.findMany({ where: { organizationId: s.orgId, ...(sp.show === "unpaid" ? { paidAt: null } : {}) }, orderBy: { date: "desc" }, take: 200 }),
    sp.po ? db.purchaseOrder.findFirst({ where: { id: sp.po, organizationId: s.orgId }, include: { lines: true, supplier: true } }) : null,
  ]);
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const spendTo = accounts.filter((a) => a.type === "EXPENSE" || a.systemKey === "STOCK" || (a.type === "ASSET" && !a.isBank && !a.systemKey));
  const prefill = po ? { supplierId: po.supplierId, reference: po.reference, amount: (po.lines.reduce((a, l) => a + (l.costPence ?? 0) * l.receivedQty, 0) / 100).toFixed(2), purchaseOrderId: po.id } : undefined;

  return (
    <div>
      <PageHeader title="Bills & expenses" sub="Supplier invoices, rent, utilities and anything else the business pays for. VAT you pay is reclaimed on your VAT return." />
      <AccountsTabs current="/admin/accounts/bills" />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="card overflow-x-auto p-0">
          <div className="flex gap-2 border-b border-slate-100 p-3 text-sm">
            <a href="/admin/accounts/bills" className={`badge px-3 py-1 ${sp.show !== "unpaid" ? "bg-brand-700 text-white" : "ring-1 ring-slate-200"}`}>All</a>
            <a href="/admin/accounts/bills?show=unpaid" className={`badge px-3 py-1 ${sp.show === "unpaid" ? "bg-brand-700 text-white" : "ring-1 ring-slate-200"}`}>Unpaid</a>
          </div>
          <table className="table">
            <thead><tr><th>Date</th><th>From</th><th>For</th><th className="text-right">Net</th><th className="text-right">VAT</th><th className="text-right">Total</th><th>Status</th></tr></thead>
            <tbody>{bills.map((b) => (
              <tr key={b.id}>
                <td>{fmtDate(b.date)}</td><td><b>{b.payee}</b>{b.reference && <div className="text-xs text-slate-400">#{b.reference}</div>}</td>
                <td className="text-xs">{names.get(b.accountId)}</td>
                <td className="text-right">{formatGBP(b.netPence)}</td><td className="text-right">{formatGBP(b.vatPence)}</td><td className="text-right font-semibold">{formatGBP(b.grossPence)}</td>
                <td>{b.paidAt ? <span className="badge bg-emerald-100 text-emerald-800">Paid {fmtDate(b.paidAt)}</span> : <span className="badge bg-amber-100 text-amber-800">Unpaid</span>}</td>
              </tr>
            ))}</tbody>
          </table>
          {bills.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No bills yet.</p>}
        </div>
        <BillForm today={londonDate()} prefill={prefill}
          accounts={spendTo.map((a) => ({ id: a.id, label: `${a.code} ${a.name}`, stock: a.systemKey === "STOCK" }))}
          payFrom={accounts.filter((a) => a.isBank).map((a) => ({ id: a.id, label: a.name }))}
          suppliers={suppliers.map((x) => ({ id: x.id, name: x.name }))} />
      </div>
    </div>
  );
}
