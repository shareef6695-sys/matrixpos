import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader, Empty } from "@/components/admin";
import { saveSupplier, createPurchaseOrder } from "@/lib/server/actions/admin";
import { fmtDate } from "@/lib/dates";

export const metadata = { title: "Suppliers & orders" };

const STATUS: Record<string, string> = { DRAFT: "bg-slate-100 text-slate-700", SENT: "bg-sky-100 text-sky-800", PARTIAL: "bg-amber-100 text-amber-800", RECEIVED: "bg-emerald-100 text-emerald-800", CANCELLED: "bg-red-100 text-red-700" };

export default async function Purchasing() {
  const s = await requireAdmin();
  const [suppliers, stores, orders] = await Promise.all([
    db.supplier.findMany({ where: { organizationId: s.orgId }, include: { _count: { select: { products: true } } }, orderBy: { name: "asc" } }),
    db.store.findMany({ where: { organizationId: s.orgId }, orderBy: { name: "asc" } }),
    db.purchaseOrder.findMany({ where: { organizationId: s.orgId }, include: { supplier: true, store: true, _count: { select: { lines: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return (
    <div>
      <PageHeader title="Suppliers & purchase orders" />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-3 font-semibold">Create a purchase order</h2>
            {suppliers.length === 0 ? <p className="text-sm text-slate-500">Add a supplier first.</p> : (
              <form action={createPurchaseOrder} className="flex flex-wrap items-end gap-3">
                <div><label className="label">Supplier</label><select name="supplierId" className="input">{suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
                <div><label className="label">Deliver to</label><select name="storeId" className="input">{stores.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
                <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="all" /> Include all their products (not just low stock)</label>
                <button className="btn-primary">Create order</button>
              </form>
            )}
          </div>
          <div className="card overflow-x-auto p-0">
            {orders.length === 0 ? <div className="p-6"><Empty>No purchase orders yet.</Empty></div> : (
              <table className="table">
                <thead><tr><th>Ref</th><th>Supplier</th><th>Store</th><th>Lines</th><th>Created</th><th>Status</th></tr></thead>
                <tbody>{orders.map((o) => (
                  <tr key={o.id}><td><Link href={`/admin/purchasing/${o.id}`} className="font-medium text-brand-700">{o.reference}</Link></td><td>{o.supplier.name}</td><td>{o.store.name}</td><td>{o._count.lines}</td><td>{fmtDate(o.createdAt)}</td><td><span className={`badge ${STATUS[o.status]}`}>{o.status.toLowerCase()}</span></td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-3 font-semibold">Add supplier</h2>
            <form action={saveSupplier} className="space-y-2">
              <input name="name" className="input" placeholder="Name, e.g. Booker" required />
              <input name="contactName" className="input" placeholder="Contact" />
              <input name="email" type="email" className="input" placeholder="Orders email" />
              <input name="phone" className="input" placeholder="Phone" />
              <input name="accountNo" className="input" placeholder="Your account number" />
              <button className="btn-primary">Add supplier</button>
            </form>
          </div>
          {suppliers.map((x) => (
            <details key={x.id} className="card">
              <summary className="cursor-pointer font-medium">{x.name} <span className="text-xs text-slate-400">{x._count.products} products</span></summary>
              <form action={saveSupplier} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={x.id} />
                <input name="name" className="input" defaultValue={x.name} />
                <input name="contactName" className="input" defaultValue={x.contactName ?? ""} placeholder="Contact" />
                <input name="email" className="input" defaultValue={x.email ?? ""} placeholder="Email" />
                <input name="phone" className="input" defaultValue={x.phone ?? ""} placeholder="Phone" />
                <input name="accountNo" className="input" defaultValue={x.accountNo ?? ""} placeholder="Account no." />
                <button className="btn-secondary">Save</button>
              </form>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
