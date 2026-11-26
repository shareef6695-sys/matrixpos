import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { formatGBP } from "@/lib/pos/money";
import { VAT_LABELS } from "@/lib/pos/vat";
import { PageHeader, Empty } from "@/components/admin";
import { saveCategory, deleteCategory } from "@/lib/server/actions/products";

export const metadata = { title: "Products" };

export default async function Products({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; saved?: string; inactive?: string }> }) {
  const s = await requireAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: {
        organizationId: s.orgId,
        ...(sp.inactive ? {} : { active: true }),
        ...(sp.cat ? { categoryId: sp.cat } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { plu: q }, { barcodes: { some: { code: q } } }] } : {}),
      },
      include: { category: true, barcodes: true, stockLevels: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
    db.category.findMany({ where: { organizationId: s.orgId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } }),
  ]);

  return (
    <div>
      <PageHeader title="Products" sub={`${products.length} shown`} actions={<>
        <a href="/api/admin/export?type=products" className="btn-secondary">Export CSV</a>
        <Link href="/admin/products/import" className="btn-secondary">Import CSV</Link>
        <Link href="/admin/products/new" className="btn-primary">Add product</Link>
      </>} />
      {sp.saved && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Product saved. Tills pick up changes next time they refresh.</div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <div className="card overflow-x-auto p-0">
          <form className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
            <input name="q" defaultValue={q} placeholder="Search name, SKU, PLU or scan barcode" className="input max-w-sm" />
            <select name="cat" defaultValue={sp.cat ?? ""} className="input max-w-[180px]"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="inactive" defaultChecked={!!sp.inactive} /> Show inactive</label>
            <button className="btn-secondary">Filter</button>
          </form>
          {products.length === 0 ? <div className="p-6"><Empty>No products found. <Link href="/admin/products/new" className="font-semibold text-brand-700">Add one</Link> or import a CSV.</Empty></div> : (
            <table className="table">
              <thead><tr><th>Product</th><th>Barcode</th><th>Category</th><th>VAT</th><th className="text-right">Price</th><th className="text-right">Stock</th></tr></thead>
              <tbody>
                {products.map((p) => {
                  const stock = p.stockLevels.reduce((a, l) => a + l.quantity, 0);
                  return (
                    <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                      <td><Link href={`/admin/products/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.name}</Link>
                        <div className="flex gap-1 text-xs text-slate-400">{p.sku}{p.plu && <span>PLU {p.plu}</span>}{p.minAge && <span className="badge bg-red-100 text-red-700">{p.minAge}+</span>}{p.quickKey && <span className="badge bg-brand-50 text-brand-700">quick key</span>}</div></td>
                      <td className="font-mono text-xs">{p.barcodes[0]?.code ?? "—"}{p.barcodes.length > 1 && ` +${p.barcodes.length - 1}`}</td>
                      <td>{p.category && <span className="badge text-white" style={{ background: p.category.color }}>{p.category.name}</span>}</td>
                      <td className="text-xs">{VAT_LABELS[p.vatCode]}</td>
                      <td className="text-right font-semibold">{formatGBP(p.pricePence)}{p.unit === "PER_KG" && "/kg"}</td>
                      <td className={`text-right ${p.trackStock && stock <= (p.reorderLevel ?? -1) ? "font-semibold text-red-600" : ""}`}>{!p.trackStock ? "—" : p.unit === "PER_KG" ? `${(stock / 1000).toFixed(1)}kg` : stock}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card h-fit">
          <h2 className="mb-3 font-semibold">Categories</h2>
          <ul className="mb-4 space-y-1">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <form action={saveCategory} className="flex flex-1 items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="color" name="color" defaultValue={c.color} className="h-7 w-7 shrink-0 cursor-pointer rounded border-0" />
                  <input name="name" defaultValue={c.name} className="min-w-0 flex-1 rounded border-0 bg-transparent px-1 py-1 hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-brand-500" />
                  <button className="text-xs text-brand-700">Save</button>
                </form>
                <span className="text-xs text-slate-400">{c._count.products}</span>
                <form action={deleteCategory}><input type="hidden" name="id" value={c.id} /><button className="text-xs text-red-500" title="Delete">✕</button></form>
              </li>
            ))}
          </ul>
          <form action={saveCategory} className="flex gap-2">
            <input type="color" name="color" defaultValue="#0d9488" className="h-9 w-9 rounded" />
            <input name="name" placeholder="New category" className="input" required />
            <button className="btn-secondary">Add</button>
          </form>
        </div>
      </div>
    </div>
  );
}
