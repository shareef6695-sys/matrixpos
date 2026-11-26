"use client";
import { useActionState, useState } from "react";
import { saveBill } from "@/lib/server/actions/accounts";
import { parseGBP, formatGBP } from "@/lib/pos/money";

type Opt = { id: string; label: string };

export function BillForm({ today, accounts, payFrom, suppliers, prefill }: {
  today: string; accounts: (Opt & { stock: boolean })[]; payFrom: Opt[]; suppliers: { id: string; name: string }[];
  prefill?: { supplierId: string; reference: string; amount: string; purchaseOrderId: string };
}) {
  const [state, action, pending] = useActionState(saveBill, undefined);
  const [amount, setAmount] = useState(prefill?.amount ?? "");
  const [incl, setIncl] = useState(prefill ? "net" : "gross");
  const [vat, setVat] = useState("STANDARD");
  const rate = vat === "STANDARD" ? 0.2 : vat === "REDUCED" ? 0.05 : 0;
  const a = parseGBP(amount) ?? 0;
  const net = incl === "net" ? a : Math.round(a / (1 + rate));
  const total = incl === "net" ? Math.round(a * (1 + rate)) : a;
  const stockId = accounts.find((x) => x.stock)?.id;

  return (
    <form action={action} key={state?.ok} className="card h-fit space-y-3">
      <h2 className="font-semibold">Add a bill or expense</h2>
      {prefill && <input type="hidden" name="purchaseOrderId" value={prefill.purchaseOrderId} />}
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">Supplier</label><select name="supplierId" className="input" defaultValue={prefill?.supplierId ?? ""}><option value="">Other</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className="label">Or payee</label><input name="payee" className="input" placeholder="e.g. British Gas" /></div>
      </div>
      <div><label className="label">What for</label><select name="accountId" className="input" defaultValue={prefill ? stockId : ""} required><option value="" disabled>Choose…</option>{accounts.map((x) => <option key={x.id} value={x.id}>{x.stock ? "Stock bought for resale" : x.label}</option>)}</select></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">Date</label><input type="date" name="date" defaultValue={today} className="input" /></div>
        <div><label className="label">Invoice no.</label><input name="reference" className="input" defaultValue={prefill?.reference} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1"><label className="label">Amount £</label><input name="amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
        <div><label className="label">Amount is</label><select name="amountIncludes" className="input" value={incl} onChange={(e) => setIncl(e.target.value)}><option value="gross">inc. VAT</option><option value="net">ex. VAT</option></select></div>
        <div><label className="label">VAT</label><select name="vatCode" className="input" value={vat} onChange={(e) => setVat(e.target.value)}><option value="STANDARD">20%</option><option value="REDUCED">5%</option><option value="ZERO">0%</option><option value="EXEMPT">Exempt / none</option></select></div>
      </div>
      <details className="text-sm"><summary className="cursor-pointer text-slate-500">VAT on the invoice is different?</summary><input name="vatOverride" className="input mt-2" placeholder="Exact VAT amount from the invoice" /></details>
      {a > 0 && <p className="rounded-lg bg-slate-50 p-2 text-sm">Net {formatGBP(net)} + VAT {formatGBP(total - net)} = <b>{formatGBP(total)}</b></p>}
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">Paid?</label><select name="paidFromId" className="input"><option value="">Not yet (owed to supplier)</option>{payFrom.map((p) => <option key={p.id} value={p.id}>Paid from {p.label}</option>)}</select></div>
        <div><label className="label">Due date</label><input type="date" name="dueDate" className="input" /></div>
      </div>
      <input name="notes" className="input" placeholder="Notes (optional)" />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}
