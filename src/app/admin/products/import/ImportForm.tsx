"use client";
import { useActionState } from "react";
import { importProducts } from "@/lib/server/actions/products";

export function ImportForm({ stores }: { stores: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(importProducts, undefined);
  return (
    <form action={action} className="card space-y-4">
      <div><label className="label">CSV file</label><input type="file" name="file" accept=".csv,text/csv" className="input" required /></div>
      <div><label className="label">Put stock quantities into</label><select name="storeId" className="input"><option value="">Don&apos;t import stock</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.ok}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Importing…" : "Import"}</button>
    </form>
  );
}
