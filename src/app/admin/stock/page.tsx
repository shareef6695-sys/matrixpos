import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader, StoreTabs } from "@/components/admin";
import { ActionForm } from "@/components/FormMessage";
import { adjustStock } from "@/lib/server/actions/admin";
import { formatGBP } from "@/lib/pos/money";

export const metadata = { title: "Stock" };

export default async function Stock({ searchParams }: { searchParams: Promise<{ store?: string; low?: string; q?: string }> }) {
  const s = await requireAdmin();
  const sp = await searchParams;
  const stores = await db.store.findMany({ where: { organizationId: s.orgId }, orderBy: { name: "asc" } });
  const storeId = sp.store && stores.some((x) => x.id === sp.store) ? sp.store : stores[0]?.id;
  const products = await db.product.findMany({
    where: { organizationId: s.orgId, active: true, trackStock: true, ...(sp.q ? { name: { contains: sp.q, mode: "insensitive" } } : {}) },
    include: { stockLevels: { where: { storeId } }, supplier: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  const rows = products.map((p) => ({ p, qty: p.stockLevels[0]?.quantity ?? 0 })).filter((r) => !sp.low || r.qty <= (r.p.reorderLevel ?? 0));
  const value = rows.reduce((a, r) => a + (r.p.costPence ?? 0) * (r.p.unit === "PER_KG" ? r.qty / 1000 : r.qty), 0);
  const fmt = (p: { unit: string }, q: number) => (p.unit === "PER_KG" ? `${(q / 1000).toFixed(2)}kg` : String(q));

  return (
    <div>
      <PageHeader title="Stock" sub={`Stock value at cost: ${formatGBP(Math.round(value))}`} actions={<Link href="/admin/purchasing" className="btn-secondary">Reorder</Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {stores.map((x) => <Link key={x.id} href={`/admin/stock?store=${x.id}${sp.low ? "&low=1" : ""}`} className={`badge px-3 py-1.5 text-sm ${x.id === storeId ? "bg-brand-700 text-white" : "bg-white ring-1 ring-slate-200"}`}>{x.name}</Link>)}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="card overflow-x-auto p-0">
          <form className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
            <input type="hidden" name="store" value={storeId} />
            <input name="q" defaultValue={sp.q} placeholder="Search" className="input max-w-xs" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="low" value="1" defaultChecked={!!sp.low} /> Low stock only</label>
            <button className="btn-secondary">Filter</button>
          </form>
          <table className="table">
            <thead><tr><th>Product</th><th>Supplier</th><th className="text-right">Reorder at</th><th className="text-right">In stock</th></tr></thead>
            <tbody>{rows.map(({ p, qty }) => (
              <tr key={p.id}>
                <td><Link href={`/admin/products/${p.id}`} className="font-medium text-brand-700">{p.name}</Link></td>
                <td className="text-slate-500">{p.supplier?.name ?? "—"}</td>
                <td className="text-right text-slate-500">{p.reorderLevel != null ? fmt(p, p.reorderLevel) : "—"}</td>
                <td className={`text-right font-semibold ${qty <= (p.reorderLevel ?? -Infinity) ? "text-red-600" : ""}`}>{fmt(p, qty)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="card h-fit">
          <h2 className="mb-3 font-semibold">Adjust stock</h2>
          <ActionForm action={adjustStock} className="space-y-3" submit="Record">
            <input type="hidden" name="storeId" value={storeId} />
            <div><label className="label">Product</label><select name="productId" className="input" required>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label className="label">Type</label>
              <select name="type" className="input">
                <option value="ADJUSTMENT">Stock count / correction</option><option value="RECEIVED">Delivery received</option><option value="WASTE">Waste, damaged or out of date</option>
                {stores.length > 1 && <option value="TRANSFER_OUT">Transfer to another store</option>}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Quantity</label><input name="quantity" className="input" inputMode="decimal" required /></div>
              <div><label className="label">Count mode</label><select name="mode" className="input"><option value="set">Set to</option><option value="add">Add / remove</option></select></div>
            </div>
            {stores.length > 1 && <div><label className="label">Transfer to</label><select name="toStoreId" className="input"><option value="">—</option>{stores.filter((x) => x.id !== storeId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>}
            <div><label className="label">Note</label><input name="note" className="input" /></div>
            <p className="text-xs text-slate-500">Weighed items are in kg.</p>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
