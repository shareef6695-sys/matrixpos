import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/admin";
import { updatePurchaseOrder, poSave, poSend, poReceive, poCancel } from "@/lib/server/actions/admin";
import { formatGBP } from "@/lib/pos/money";
import { fmtDate } from "@/lib/dates";

export const metadata = { title: "Purchase order" };

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireAdmin();
  const { id } = await params;
  const po = await db.purchaseOrder.findFirst({
    where: { id, organizationId: s.orgId },
    include: { supplier: true, store: true, lines: { include: { product: { include: { stockLevels: true } } }, orderBy: { product: { name: "asc" } } } },
  });
  if (!po) notFound();
  const org = await db.organization.findUnique({ where: { id: s.orgId } });
  const products = await db.product.findMany({ where: { organizationId: s.orgId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const editable = po.status === "DRAFT" || po.status === "SENT";
  const receivable = po.status === "SENT" || po.status === "PARTIAL" || po.status === "DRAFT";
  const total = po.lines.reduce((a, l) => a + (l.costPence ?? 0) * l.quantity, 0);
  const mail = po.supplier.email
    ? `mailto:${po.supplier.email}?subject=${encodeURIComponent(`Order ${po.reference} from ${org?.name}`)}&body=${encodeURIComponent(
        `Hello,\n\nPlease supply the following for delivery to ${po.store.name}${po.supplier.accountNo ? ` (account ${po.supplier.accountNo})` : ""}:\n\n` +
        po.lines.map((l) => `${l.quantity} x ${l.product.name}`).join("\n") + `\n\nThank you,\n${org?.name}`)}`
    : null;

  return (
    <div>
      <PageHeader title={`${po.reference} · ${po.supplier.name}`} sub={`${po.status.toLowerCase()} · deliver to ${po.store.name} · created ${fmtDate(po.createdAt)}`}
        actions={mail ? <a href={mail} className="btn-secondary">Email to supplier</a> : undefined} />
      <form action={updatePurchaseOrder} className="card overflow-x-auto p-0">
        <input type="hidden" name="id" value={po.id} />
        <table className="table">
          <thead><tr><th>Product</th><th className="text-right">In stock</th><th className="text-right">Order qty</th><th className="text-right">Cost each</th><th className="text-right">Received</th>{receivable && <th className="text-right">Receive now</th>}</tr></thead>
          <tbody>{po.lines.map((l) => {
            const stock = l.product.stockLevels.find((x) => x.storeId === po.storeId)?.quantity ?? 0;
            return (
              <tr key={l.id}>
                <td>{l.product.name}</td>
                <td className="text-right text-slate-500">{l.product.unit === "PER_KG" ? `${(stock / 1000).toFixed(1)}kg` : stock}</td>
                <td className="text-right">{editable ? <input name={`qty_${l.id}`} type="number" defaultValue={l.quantity} className="input w-20 text-right" /> : l.quantity}</td>
                <td className="text-right">{editable ? <input name={`cost_${l.id}`} defaultValue={l.costPence != null ? (l.costPence / 100).toFixed(2) : ""} className="input w-24 text-right" /> : l.costPence != null ? formatGBP(l.costPence) : "—"}</td>
                <td className="text-right">{l.receivedQty}</td>
                {receivable && <td className="text-right"><input name={`recv_${l.id}`} type="number" min={0} defaultValue={Math.max(0, l.quantity - l.receivedQty)} className="input w-20 text-right" /></td>}
              </tr>
            );
          })}</tbody>
          <tfoot><tr><td colSpan={3} className="text-right font-semibold">Total cost (ex. VAT)</td><td className="text-right font-bold">{formatGBP(total)}</td><td colSpan={2} /></tr></tfoot>
        </table>
        <div className="space-y-3 p-4">
          <textarea name="notes" className="input" placeholder="Notes" defaultValue={po.notes ?? ""} disabled={!editable} />
          <div className="flex flex-wrap gap-2">
            {editable && <button formAction={poSave} className="btn-secondary">Save changes</button>}
            {po.status === "DRAFT" && <button formAction={poSend} className="btn-secondary">Mark as sent</button>}
            {receivable && <><button formAction={poReceive} className="btn-primary">Book in delivery</button><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="updateCost" /> Update product cost prices</label></>}
            {editable && <button formAction={poCancel} className="btn-danger ml-auto">Cancel order</button>}
          </div>
        </div>
      </form>
      {editable && (
        <form action={updatePurchaseOrder} className="card mt-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={po.id} />
          <input type="hidden" name="op" value="addLine" />
          <div className="min-w-60 flex-1"><label className="label">Add product</label><select name="productId" className="input">{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label className="label">Qty</label><input name="quantity" type="number" defaultValue={12} className="input w-24" /></div>
          <button className="btn-secondary">Add line</button>
        </form>
      )}
    </div>
  );
}
