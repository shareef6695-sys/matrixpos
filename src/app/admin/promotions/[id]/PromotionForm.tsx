"use client";
import { useActionState, useState } from "react";
import { savePromotion } from "@/lib/server/actions/admin";
import { formatGBP } from "@/lib/pos/money";

type Prod = { id: string; name: string; price: number; category: string };
type Promo = { id: string; name: string; type: string; quantity: number | null; freeQuantity: number | null; pricePence: number | null; percentOff: number | null; active: boolean; startsAt: string; endsAt: string; items: { productId: string; group: number }[] };

export function PromotionForm({ promo, products, weighed }: { promo: Promo | null; products: Prod[]; weighed: Prod[] }) {
  const [state, action, pending] = useActionState(savePromotion, undefined);
  const [type, setType] = useState(promo?.type ?? "MULTIBUY_PRICE");
  const [filter, setFilter] = useState("");
  const groups = type === "MEAL_DEAL" ? [1, 2, 3] : [1];
  const groupNames = ["Main", "Snack", "Drink"];
  const selected = new Map(promo?.items.map((i) => [i.productId, i.group]) ?? []);
  const list = type === "PERCENT_OFF" ? [...products, ...weighed] : products;
  const shown = (p: Prod) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()) || p.category.toLowerCase().includes(filter.toLowerCase());

  return (
    <form action={action} className="card max-w-4xl space-y-5">
      {promo && <input type="hidden" name="id" value={promo.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Type</label>
          <select name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="MULTIBUY_PRICE">Multibuy (e.g. 3 for £2)</option><option value="BUY_X_GET_Y">Buy X get Y free (e.g. BOGOF)</option>
            <option value="PERCENT_OFF">Percentage off</option><option value="MEAL_DEAL">Meal deal</option>
          </select>
        </div>
        <div><label className="label">Name on receipt</label><input name="name" className="input" defaultValue={promo?.name} placeholder="e.g. Any 3 for £2" required /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {(type === "MULTIBUY_PRICE" || type === "BUY_X_GET_Y") && <div><label className="label">{type === "BUY_X_GET_Y" ? "Buy" : "Quantity"}</label><input name="quantity" type="number" min={1} className="input" defaultValue={promo?.quantity ?? (type === "BUY_X_GET_Y" ? 1 : 3)} /></div>}
        {type === "BUY_X_GET_Y" && <div><label className="label">Get free</label><input name="freeQuantity" type="number" min={1} className="input" defaultValue={promo?.freeQuantity ?? 1} /></div>}
        {(type === "MULTIBUY_PRICE" || type === "MEAL_DEAL") && <div><label className="label">Deal price £</label><input name="price" className="input" inputMode="decimal" defaultValue={promo?.pricePence != null ? (promo.pricePence / 100).toFixed(2) : ""} /></div>}
        {type === "PERCENT_OFF" && <div><label className="label">% off</label><input name="percentOff" type="number" min={1} max={100} className="input" defaultValue={promo?.percentOff ?? 10} /></div>}
        <div><label className="label">Starts</label><input name="startsAt" type="date" className="input" defaultValue={promo?.startsAt} /></div>
        <div><label className="label">Ends</label><input name="endsAt" type="date" className="input" defaultValue={promo?.endsAt} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={promo?.active ?? true} /> Active</label>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="label mb-0">Products {type === "MEAL_DEAL" && "(tick the group for each product)"}</label>
          <input className="input max-w-xs" placeholder="Filter products" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200">
          <table className="table">
            <thead className="sticky top-0 bg-white"><tr><th>Product</th><th>Price</th>{groups.map((g) => <th key={g} className="text-center">{type === "MEAL_DEAL" ? groupNames[g - 1] : "Include"}</th>)}</tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={shown(p) ? "" : "hidden"}><td>{p.name} <span className="text-xs text-slate-400">{p.category}</span></td><td>{formatGBP(p.price)}</td>
                  {groups.map((g) => <td key={g} className="text-center"><input type="checkbox" name={`group${g}`} value={p.id} defaultChecked={selected.get(p.id) === g} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save offer"}</button>
    </form>
  );
}
