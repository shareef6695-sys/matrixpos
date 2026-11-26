"use client";
import { useActionState, useState } from "react";
import { moveMoney, manualJournal } from "@/lib/server/actions/accounts";
import { parseGBP, formatGBP } from "@/lib/pos/money";

type Opt = { id: string; label: string };

export function MoveMoneyForm({ today, presets, accounts }: { today: string; presets: { label: string; from: string; to: string }[]; accounts: Opt[] }) {
  const [state, action, pending] = useActionState(moveMoney, undefined);
  const [p, setP] = useState(0);
  const preset = presets[p];
  return (
    <form action={action} className="card h-fit space-y-3" key={`${p}-${state?.ok ?? ""}`}>
      <h2 className="font-semibold">Move money</h2>
      <div><label className="label">What happened</label>
        <select className="input" value={p} onChange={(e) => setP(Number(e.target.value))}>{presets.map((x, i) => <option key={x.label} value={i}>{x.label}</option>)}</select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">From</label><select name="fromId" className="input" defaultValue={preset.from}><option value="">Choose…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
        <div><label className="label">To</label><select name="toId" className="input" defaultValue={preset.to}><option value="">Choose…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className="label">Amount £</label><input name="amount" className="input" inputMode="decimal" required /></div>
        <div><label className="label">Date</label><input type="date" name="date" className="input" defaultValue={today} /></div>
        <div><label className="label">Reference</label><input name="reference" className="input" /></div>
      </div>
      <input name="memo" className="input" placeholder="Description (optional)" defaultValue={preset.from ? preset.label : ""} />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn-primary" disabled={pending}>Record</button>
    </form>
  );
}

export function JournalForm({ today, accounts }: { today: string; accounts: Opt[] }) {
  const [state, action, pending] = useActionState(manualJournal, undefined);
  const [rows, setRows] = useState(Array.from({ length: 4 }, () => ({ dr: "", cr: "" })));
  const d = rows.reduce((a, r) => a + (parseGBP(r.dr) ?? 0), 0);
  const c = rows.reduce((a, r) => a + (parseGBP(r.cr) ?? 0), 0);
  return (
    <form action={action} className="card h-fit space-y-3" key={state?.ok}>
      <h2 className="font-semibold">Manual journal <span className="text-sm font-normal text-slate-500">(opening balances and corrections)</span></h2>
      <div className="grid grid-cols-2 gap-2">
        <input type="date" name="date" className="input" defaultValue={today} />
        <input name="reference" className="input" placeholder="Reference" />
      </div>
      <input name="memo" className="input" placeholder="Description, e.g. Opening balances" />
      <table className="table">
        <thead><tr><th>Account</th><th className="w-24">Debit £</th><th className="w-24">Credit £</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><select name={`acct_${i}`} className="input"><option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></td>
              <td><input name={`dr_${i}`} className="input" inputMode="decimal" value={r.dr} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, dr: e.target.value } : x)))} /></td>
              <td><input name={`cr_${i}`} className="input" inputMode="decimal" value={r.cr} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, cr: e.target.value } : x)))} /></td>
            </tr>
          ))}
          <tr className="font-semibold"><td className="text-right">Totals</td><td>{formatGBP(d)}</td><td className={d !== c ? "text-red-600" : ""}>{formatGBP(c)}</td></tr>
        </tbody>
      </table>
      <div className="flex gap-2">
        {rows.length < 12 && <button type="button" className="btn-secondary" onClick={() => setRows([...rows, { dr: "", cr: "" }])}>Add line</button>}
        <button className="btn-primary" disabled={pending || d !== c || d === 0}>Post journal</button>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}
