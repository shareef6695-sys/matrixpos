import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/admin";
import { fmtDateTime } from "@/lib/dates";
import { ProductForm } from "../ProductForm";

export const metadata = { title: "Edit product" };

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireAdmin();
  const { id } = await params;
  const [p, categories, suppliers, movements] = await Promise.all([
    db.product.findFirst({ where: { id, organizationId: s.orgId }, include: { barcodes: true, stockLevels: { include: { store: true } } } }),
    db.category.findMany({ where: { organizationId: s.orgId }, orderBy: { name: "asc" } }),
    db.supplier.findMany({ where: { organizationId: s.orgId }, orderBy: { name: "asc" } }),
    db.stockMovement.findMany({ where: { productId: id, store: { organizationId: s.orgId } }, orderBy: { createdAt: "desc" }, take: 15, include: { store: { select: { name: true } } } }),
  ]);
  if (!p) notFound();
  return (
    <div>
      <PageHeader title={p.name} />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <ProductForm product={{ ...p, barcodes: p.barcodes.map((b) => b.code) }} categories={categories} suppliers={suppliers} />
        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-2 font-semibold">Stock by store</h2>
            <ul className="text-sm">{p.stockLevels.map((l) => <li key={l.storeId} className="flex justify-between py-1"><span>{l.store.name}</span><b>{p.unit === "PER_KG" ? `${(l.quantity / 1000).toFixed(2)}kg` : l.quantity}</b></li>)}</ul>
          </div>
          <div className="card">
            <h2 className="mb-2 font-semibold">Recent stock movements</h2>
            <ul className="space-y-1 text-xs">{movements.map((m) => <li key={m.id} className="flex justify-between"><span>{fmtDateTime(m.createdAt)} · {m.type.toLowerCase()} · {m.store.name}</span><b className={m.quantity < 0 ? "text-red-600" : "text-emerald-700"}>{m.quantity > 0 ? "+" : ""}{m.quantity}</b></li>)}</ul>
          </div>
        </div>
      </div>
    </div>
  );
}
