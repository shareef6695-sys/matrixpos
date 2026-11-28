"use client";
import { useActionState, useMemo, useState } from "react";
import type { FormState } from "@/lib/server/actions/auth";
import { documentTotals, formatMoney, minorToInput, parseMoney } from "@/lib/hq/money";

export interface FormItem { id: string; name: string; description: string | null; currency: string; priceMinor: number; unit: string }
export interface FormClient { id: string; name: string; currency: string; paymentDays: number }
interface Row { key: number; itemId: string | null; description: string; quantity: string; unit: string; discountPct: string; taxPct: string }

export interface DocumentDefaults {
  id?: string; clientId?: string; leadId?: string; title?: string; currency?: string; perGbp?: string;
  issueDate: string; endDate?: string; notes?: string; terms?: string;
  lines?: { itemId: string | null; description: string; quantity: string; unit: string; discountPct: string; taxPct: string }[];
}

let nextKey = 1;
const blank = (): Row => ({ key: nextKey++, itemId: null, description: "", quantity: "1", unit: "", discountPct: "", taxPct: "" });

/** The quote / invoice editor. Totals here are a preview only: the server works every amount out again. */
export function DocumentForm({ kind, action, clients, items, currencies, rates, chargeVat, defaults }: {
  kind: "quote" | "invoice";
  action: (s: FormState, f: FormData) => Promise<FormState>;
  clients: FormClient[]; items: FormItem[]; currencies: string[]; rates: Record<string, number>; chargeVat: boolean;
  defaults: DocumentDefaults;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  const firstClient = clients.find((c) => c.id === defaults.clientId);
  const [clientId, setClientId] = useState(defaults.clientId ?? "");
  const [currency, setCurrency] = useState(defaults.currency ?? firstClient?.currency ?? "GBP");
  const [rows, setRows] = useState<Row[]>(() => (defaults.lines?.length ? defaults.lines.map((l) => ({ ...l, key: nextKey++ })) : [blank()]));

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const pickItem = (key: number, id: string) => {
    const it = items.find((i) => i.id === id);
    if (!it) return update(key, { itemId: null });
    // Prices in another currency are converted with the latest rate, as a starting point to edit.
    const price = it.currency === currency ? it.priceMinor : rates[it.currency] && rates[currency]
      ? Math.round(((it.priceMinor / 100) / rates[it.currency]) * rates[currency] * 100) : it.priceMinor;
    update(key, { itemId: it.id, description: it.description ? `${it.name}\n${it.description}` : it.name, unit: minorToInput(price, currency) });
  };

  const totals = useMemo(() => {
    const ok = rows.filter((r) => r.description.trim()).map((r) => ({
      description: r.description, quantity: Number(r.quantity) || 0, unitMinor: parseMoney(r.unit, currency) ?? 0,
      discountPct: Number(r.discountPct) || 0, taxPct: chargeVat ? Number(r.taxPct) || 0 : 0,
    }));
    return documentTotals(ok);
  }, [rows, currency, chargeVat]);

  const json = JSON.stringify(rows.map(({ itemId, description, quantity, unit, discountPct, taxPct }) => ({ itemId, description, quantity, unit, discountPct, taxPct: chargeVat ? taxPct : "0" })));
  const needsRate = currency !== "GBP";

  return (
    <form action={run} className="space-y-6">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {defaults.leadId && <input type="hidden" name="leadId" value={defaults.leadId} />}
      <input type="hidden" name="lines" value={json} />
      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label">Client</label>
          <select name="clientId" className="input" value={clientId} required onChange={(e) => {
            setClientId(e.target.value);
            const c = clients.find((x) => x.id === e.target.value);
            if (c && !defaults.id) setCurrency(c.currency);
          }}>
            <option value="">Choose a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2"><label className="label">Title (optional)</label><input name="title" className="input" defaultValue={defaults.title} placeholder="e.g. Booking app, phase 1" /></div>
        <div><label className="label">{kind === "quote" ? "Quote date" : "Invoice date"}</label><input type="date" name="issueDate" className="input" defaultValue={defaults.issueDate} required /></div>
        <div><label className="label">{kind === "quote" ? "Valid until" : "Due date"} (blank = {kind === "quote" ? "30 days" : "client's terms"})</label><input type="date" name={kind === "quote" ? "expiryDate" : "dueDate"} className="input" defaultValue={defaults.endDate} /></div>
        <div>
          <label className="label">Currency</label>
          <select name="currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{needsRate ? `£1 = ? ${currency}` : "Exchange rate"}</label>
          {needsRate
            ? <input name="perGbp" className="input" inputMode="decimal" defaultValue={defaults.perGbp} placeholder={rates[currency] ? `${rates[currency]} (latest saved)` : "Type a rate"} />
            : <input className="input bg-slate-50" value="Base currency" readOnly />}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table min-w-[720px]">
          <thead><tr><th className="w-[45%]">Item and description</th><th className="w-20 text-right">Qty</th><th className="w-32 text-right">Price ({currency})</th><th className="w-20 text-right">Disc %</th>{chargeVat && <th className="w-20 text-right">VAT %</th>}<th className="w-28 text-right">Amount</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const amount = documentTotals([{ description: "x", quantity: Number(r.quantity) || 0, unitMinor: parseMoney(r.unit, currency) ?? 0, discountPct: Number(r.discountPct) || 0, taxPct: 0 }]).totalMinor;
              return (
                <tr key={r.key} className="align-top">
                  <td>
                    <select className="input mb-1 text-xs" value={r.itemId ?? ""} onChange={(e) => pickItem(r.key, e.target.value)} aria-label="Catalogue item">
                      <option value="">Custom line (not from the catalogue)</option>
                      {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    <textarea className="input min-h-16" value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} placeholder="Description" aria-label="Description" />
                  </td>
                  <td><input className="input text-right" inputMode="decimal" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} aria-label="Quantity" /></td>
                  <td><input className="input text-right" inputMode="decimal" value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} placeholder="0.00" aria-label="Price" /></td>
                  <td><input className="input text-right" inputMode="decimal" value={r.discountPct} onChange={(e) => update(r.key, { discountPct: e.target.value })} placeholder="0" aria-label="Discount percent" /></td>
                  {chargeVat && <td><input className="input text-right" inputMode="decimal" value={r.taxPct} onChange={(e) => update(r.key, { taxPct: e.target.value })} placeholder="20" aria-label="VAT percent" /></td>}
                  <td className="pt-4 text-right tabular-nums">{formatMoney(amount, currency)}</td>
                  <td className="pt-3"><button type="button" className="text-xs text-red-600" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blank()]))}>Remove</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-start justify-between gap-4 border-t border-slate-100 p-4">
          <button type="button" className="btn-secondary" onClick={() => setRows((rs) => [...rs, blank()])}>Add line</button>
          <table className="text-sm tabular-nums">
            <tbody>
              {totals.discountMinor > 0 && <tr><td className="pr-6 text-right text-slate-500">Discount</td><td className="text-right">-{formatMoney(totals.discountMinor, currency)}</td></tr>}
              {totals.taxMinor > 0 && <tr><td className="pr-6 text-right text-slate-500">VAT</td><td className="text-right">{formatMoney(totals.taxMinor, currency)}</td></tr>}
              <tr className="text-base font-bold"><td className="pr-6 text-right">Total</td><td className="text-right">{formatMoney(totals.totalMinor, currency)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card grid gap-3 sm:grid-cols-2">
        <div><label className="label">Notes to the client</label><textarea name="notes" className="input min-h-24" defaultValue={defaults.notes} /></div>
        <div><label className="label">Terms</label><textarea name="terms" className="input min-h-24" defaultValue={defaults.terms} /></div>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : defaults.id ? "Save changes" : `Create ${kind}`}</button>
    </form>
  );
}
