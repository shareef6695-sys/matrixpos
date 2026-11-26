"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { saveProduct } from "@/lib/server/actions/products";

type P = {
  id?: string; name?: string; sku?: string | null; plu?: string | null; pricePence?: number; costPence?: number | null; vatCode?: string; unit?: string;
  categoryId?: string | null; supplierId?: string | null; minAge?: number | null; reorderLevel?: number | null; reorderQty?: number | null;
  trackStock?: boolean; quickKey?: boolean; active?: boolean; barcodes?: string[];
};

const p2 = (n?: number | null) => (n == null ? "" : (n / 100).toFixed(2));

export function ProductForm({ product = {}, categories, suppliers }: { product?: P; categories: { id: string; name: string }[]; suppliers: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveProduct, undefined);
  const [price, setPrice] = useState(p2(product.pricePence));
  const [cost, setCost] = useState(p2(product.costPence));
  const [vat, setVat] = useState(product.vatCode ?? "STANDARD");
  const rate = vat === "STANDARD" ? 0.2 : vat === "REDUCED" ? 0.05 : 0;
  const ex = parseFloat(price) / (1 + rate);
  const margin = cost && price ? ((ex - parseFloat(cost)) / ex) * 100 : null;

  return (
    <form action={action} className="card max-w-3xl space-y-5">
      {product.id && <input type="hidden" name="id" value={product.id} />}
      <div><label className="label">Name</label><input name="name" className="input" defaultValue={product.name} required /></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="label">Selling price (inc. VAT) £</label><input name="price" className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required /></div>
        <div><label className="label">Cost price (ex. VAT) £</label><input name="cost" className="input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
        <div><label className="label">Margin</label><div className={`input bg-slate-50 ${margin != null && margin < 15 ? "text-red-600" : ""}`}>{margin != null && Number.isFinite(margin) ? `${margin.toFixed(1)}%` : "—"}</div></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="label">VAT</label>
          <select name="vatCode" className="input" value={vat} onChange={(e) => setVat(e.target.value)}>
            <option value="STANDARD">Standard 20%</option><option value="REDUCED">Reduced 5%</option><option value="ZERO">Zero rated 0%</option><option value="EXEMPT">Exempt</option>
          </select>
        </div>
        <div><label className="label">Sold</label>
          <select name="unit" className="input" defaultValue={product.unit ?? "EACH"}><option value="EACH">Each</option><option value="PER_KG">By weight (price per kg)</option></select>
        </div>
        <div><label className="label">Age restriction</label>
          <select name="minAge" className="input" defaultValue={product.minAge ?? ""}><option value="">None</option><option value="16">16+ (e.g. paracetamol, lighters)</option><option value="18">18+ (alcohol, tobacco, knives)</option><option value="21">21+</option></select>
        </div>
      </div>
      <div><label className="label">Barcodes (one per line or comma separated)</label><textarea name="barcodes" rows={2} className="input font-mono" defaultValue={product.barcodes?.join("\n")} /></div>
      <div className="grid gap-4 sm:grid-cols-4">
        <div><label className="label">SKU</label><input name="sku" className="input" defaultValue={product.sku ?? ""} /></div>
        <div><label className="label">PLU</label><input name="plu" className="input" defaultValue={product.plu ?? ""} placeholder="for scale labels" /></div>
        <div><label className="label">Category</label><select name="categoryId" className="input" defaultValue={product.categoryId ?? ""}><option value="">None</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label className="label">Supplier</label><select name="supplierId" className="input" defaultValue={product.supplierId ?? ""}><option value="">None</option>{suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Reorder when stock falls to</label><input name="reorderLevel" type="number" className="input" defaultValue={product.reorderLevel ?? ""} /></div>
        <div><label className="label">Reorder quantity</label><input name="reorderQty" type="number" className="input" defaultValue={product.reorderQty ?? ""} /></div>
      </div>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="trackStock" defaultChecked={product.trackStock ?? true} /> Track stock</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="quickKey" defaultChecked={product.quickKey ?? false} /> Show as quick key on till</label>
        {product.id && <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={product.active ?? true} /> Active</label>}
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2"><button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save product"}</button><Link href="/admin/products" className="btn-secondary">Cancel</Link></div>
    </form>
  );
}
