"use client";
import { useActionState, useState } from "react";
import type { FormState } from "@/lib/server/actions/auth";
import { formatMoney, parseMoney } from "@/lib/hq/money";

export interface AccountOption { id: string; code: string; name: string; type: string; isBank: boolean; currency: string }

function AccountSelect({ accounts, value, onChange, name, required }: { accounts: AccountOption[]; value?: string; onChange?: (v: string) => void; name?: string; required?: boolean }) {
  const groups = [["EXPENSE", "Costs"], ["ASSET", "Things you own"], ["LIABILITY", "Things you owe"], ["EQUITY", "Capital"], ["INCOME", "Income"]] as const;
  return (
    <select className="input" name={name} value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined} required={required} aria-label="Account">
      <option value="">Choose…</option>
      {groups.map(([t, label]) => {
        const list = accounts.filter((a) => a.type === t);
        return list.length ? <optgroup key={t} label={label}>{list.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}{a.isBank && a.currency !== "GBP" ? ` (${a.currency})` : ""}</option>)}</optgroup> : null;
      })}
    </select>
  );
}
export { AccountSelect };

let k = 1;

// ---------------- Bill or expense ----------------

interface BillRow { key: number; description: string; accountId: string; amount: string; taxPct: string }
export interface BillDefaults {
  id?: string; isExpense: boolean; supplierId?: string; payee?: string; reference?: string; date: string; dueDate?: string;
  currency?: string; perGbp?: string; notes?: string; bankAccountId?: string; projectId?: string;
  lines?: { description: string; accountId: string; amount: string; taxPct: string }[];
}

export function BillForm({ action, defaults, suppliers, accounts, banks, currencies, chargeVat, projects = [] }: {
  projects?: { id: string; name: string }[];
  action: (s: FormState, f: FormData) => Promise<FormState>;
  defaults: BillDefaults;
  suppliers: { id: string; name: string; currency: string }[];
  accounts: AccountOption[]; banks: AccountOption[]; currencies: string[]; chargeVat: boolean;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  const [currency, setCurrency] = useState(defaults.currency ?? "GBP");
  const [rows, setRows] = useState<BillRow[]>(() => (defaults.lines?.length ? defaults.lines : [{ description: "", accountId: "", amount: "", taxPct: "" }]).map((l) => ({ ...l, key: k++ })));
  const set = (key: number, p: Partial<BillRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const net = rows.reduce((n, r) => n + (parseMoney(r.amount, currency) ?? 0), 0);
  const tax = chargeVat ? rows.reduce((n, r) => n + Math.round(((parseMoney(r.amount, currency) ?? 0) * (Number(r.taxPct) || 0)) / 100), 0) : 0;
  const e = defaults.isExpense;
  return (
    <form action={run} className="space-y-6">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <input type="hidden" name="isExpense" value={String(e)} />
      <input type="hidden" name="lines" value={JSON.stringify(rows.map(({ description, accountId, amount, taxPct }) => ({ description, accountId, amount, taxPct: chargeVat ? taxPct : "0" })))} />
      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label">Supplier</label>
          <select name="supplierId" className="input" defaultValue={defaults.supplierId ?? ""} onChange={(ev) => { const s = suppliers.find((x) => x.id === ev.target.value); if (s && !defaults.id) setCurrency(s.currency); }}>
            <option value="">{e ? "None (type who below)" : "Choose or type below…"}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2"><label className="label">Paid to (as on the {e ? "receipt" : "bill"})</label><input name="payee" className="input" defaultValue={defaults.payee} placeholder="e.g. GitHub, Amazon Web Services" /></div>
        <div><label className="label">{e ? "Date paid" : "Bill date"}</label><input type="date" name="date" className="input" defaultValue={defaults.date} required /></div>
        {!e && <div><label className="label">Due date</label><input type="date" name="dueDate" className="input" defaultValue={defaults.dueDate} /></div>}
        <div><label className="label">Their reference</label><input name="reference" className="input" defaultValue={defaults.reference} placeholder="Invoice or receipt number" /></div>
        <div><label className="label">Currency</label><select name="currency" className="input" value={currency} onChange={(ev) => setCurrency(ev.target.value)}>{currencies.map((c) => <option key={c}>{c}</option>)}</select></div>
        {currency !== "GBP" && <div><label className="label">£1 = ? {currency}</label><input name="perGbp" className="input" inputMode="decimal" defaultValue={defaults.perGbp} placeholder="Blank = saved rate" /></div>}
        {projects.length > 0 && (
          <div className="sm:col-span-2">
            <label className="label">For a project (optional)</label>
            <select name="projectId" className="input" defaultValue={defaults.projectId ?? ""}><option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </div>
        )}
        {e && (
          <div className="sm:col-span-2">
            <label className="label">Paid from</label>
            <select name="bankAccountId" className="input" defaultValue={defaults.bankAccountId ?? banks[0]?.id}>{banks.map((b) => <option key={b.id} value={b.id}>{b.code} {b.name} ({b.currency})</option>)}</select>
          </div>
        )}
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table min-w-[640px]">
          <thead><tr><th>Description</th><th className="w-72">What it was for</th><th className="w-32 text-right">Amount{chargeVat ? " (before VAT)" : ""}</th>{chargeVat && <th className="w-20 text-right">VAT %</th>}<th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td><input className="input" value={r.description} onChange={(ev) => set(r.key, { description: ev.target.value })} placeholder="e.g. Team plan, November" aria-label="Description" /></td>
                <td><AccountSelect accounts={accounts} value={r.accountId} onChange={(v) => set(r.key, { accountId: v })} /></td>
                <td><input className="input text-right" inputMode="decimal" value={r.amount} onChange={(ev) => set(r.key, { amount: ev.target.value })} placeholder="0.00" aria-label="Amount" /></td>
                {chargeVat && <td><input className="input text-right" inputMode="decimal" value={r.taxPct} onChange={(ev) => set(r.key, { taxPct: ev.target.value })} placeholder="20" aria-label="VAT percent" /></td>}
                <td><button type="button" className="text-xs text-red-600" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 p-4">
          <button type="button" className="btn-secondary" onClick={() => setRows((rs) => [...rs, { key: k++, description: "", accountId: rs.at(-1)?.accountId ?? "", amount: "", taxPct: "" }])}>Add line</button>
          <div className="text-right text-sm tabular-nums">
            {tax > 0 && <div className="text-slate-500">VAT {formatMoney(tax, currency)}</div>}
            <div className="text-base font-bold">Total {formatMoney(net + tax, currency)}</div>
          </div>
        </div>
      </div>
      <div className="card"><label className="label">Notes (only you see these)</label><textarea name="notes" className="input min-h-16" defaultValue={defaults.notes} /></div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : defaults.id ? "Save changes" : e ? "Save expense" : "Save bill"}</button>
    </form>
  );
}

// ---------------- Manual journal ----------------

interface JRow { key: number; accountId: string; debit: string; credit: string; description: string }

export function JournalForm({ action, accounts, today }: { action: (s: FormState, f: FormData) => Promise<FormState>; accounts: AccountOption[]; today: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  const blank = (): JRow => ({ key: k++, accountId: "", debit: "", credit: "", description: "" });
  const [rows, setRows] = useState<JRow[]>(() => [blank(), blank()]);
  const set = (key: number, p: Partial<JRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const d = rows.reduce((n, r) => n + (parseMoney(r.debit, "GBP") ?? 0), 0);
  const c = rows.reduce((n, r) => n + (parseMoney(r.credit, "GBP") ?? 0), 0);
  // Cleared after a successful post, ready for the next one.
  const [done, setDone] = useState<string | undefined>();
  if (state?.ok && state.ok !== done) { setDone(state.ok); setRows([blank(), blank()]); }
  return (
    <form action={run} className="space-y-4">
      <input type="hidden" name="lines" value={JSON.stringify(rows.map(({ accountId, debit, credit, description }) => ({ accountId, debit, credit, description })))} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label">Date</label><input type="date" name="date" className="input" defaultValue={today} required /></div>
        <div><label className="label">Reference</label><input name="reference" className="input" placeholder="Optional" /></div>
        <div><label className="label">What it's for</label><input name="memo" className="input" placeholder="e.g. Opening balances" /></div>
      </div>
      <div className="overflow-x-auto">
        <table className="table min-w-[640px]">
          <thead><tr><th className="w-72">Account</th><th>Description</th><th className="w-32 text-right">Debit £</th><th className="w-32 text-right">Credit £</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td><AccountSelect accounts={accounts.filter((a) => !a.isBank || a.currency === "GBP")} value={r.accountId} onChange={(v) => set(r.key, { accountId: v })} /></td>
                <td><input className="input" value={r.description} onChange={(e) => set(r.key, { description: e.target.value })} aria-label="Description" /></td>
                <td><input className="input text-right" inputMode="decimal" value={r.debit} onChange={(e) => set(r.key, { debit: e.target.value, credit: e.target.value ? "" : r.credit })} aria-label="Debit" /></td>
                <td><input className="input text-right" inputMode="decimal" value={r.credit} onChange={(e) => set(r.key, { credit: e.target.value, debit: e.target.value ? "" : r.debit })} aria-label="Credit" /></td>
                <td><button type="button" className="text-xs text-red-600" onClick={() => setRows((rs) => (rs.length > 2 ? rs.filter((x) => x.key !== r.key) : rs))}>Remove</button></td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td><button type="button" className="btn-secondary" onClick={() => setRows((rs) => [...rs, blank()])}>Add line</button></td>
              <td className="text-right">{d === c ? (d ? "Balanced" : "") : <span className="text-red-700">Out by {formatMoney(Math.abs(d - c), "GBP")}</span>}</td>
              <td className="text-right tabular-nums">{formatMoney(d, "GBP")}</td><td className="text-right tabular-nums">{formatMoney(c, "GBP")}</td><td />
            </tr>
          </tbody>
        </table>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn-primary" disabled={pending || d !== c || !d}>{pending ? "Posting…" : "Post journal"}</button>
    </form>
  );
}
