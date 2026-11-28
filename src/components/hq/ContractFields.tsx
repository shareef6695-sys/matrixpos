import type { HqContract } from "@prisma/client";
import { minorToInput } from "@/lib/hq/money";
import { CONTRACT_KIND_LABEL } from "@/lib/hq/labels";
import { londonDate } from "@/lib/dates";

export function ContractFields({ c, clients, currencies, recurring, defaultClient, today }: {
  c?: HqContract; clients: { id: string; name: string }[]; currencies: string[];
  recurring: { id: string; clientId: string; label: string }[]; defaultClient?: string; today: string;
}) {
  const d = (x: Date | null | undefined) => (x ? londonDate(x) : "");
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="sm:col-span-2"><label className="label">Title</label><input name="title" className="input" defaultValue={c?.title} required placeholder="e.g. Website care plan, Microsoft 365 licences" /></div>
      <div><label className="label">Client</label><select name="clientId" className="input" defaultValue={c?.clientId ?? defaultClient ?? ""} required><option value="">Choose…</option>{clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      <div><label className="label">Type</label><select name="kind" className="input" defaultValue={c?.kind ?? "SERVICE"}>{Object.entries(CONTRACT_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label className="label">Starts</label><input name="startDate" type="date" className="input" defaultValue={d(c?.startDate) || today} required /></div>
      <div><label className="label">Ends (blank = rolling)</label><input name="endDate" type="date" className="input" defaultValue={d(c?.endDate)} /></div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="autoRenew" defaultChecked={c?.autoRenew} /> Renews automatically when it ends</label>
      <div><label className="label">Each renewal is for (months)</label><input name="renewMonths" className="input" inputMode="numeric" defaultValue={c?.renewMonths ?? 12} /></div>
      <div><label className="label">Remind me (days before it ends)</label><input name="noticeDays" className="input" inputMode="numeric" defaultValue={c?.noticeDays ?? 30} /></div>
      <div><label className="label">Currency</label><select name="currency" className="input" defaultValue={c?.currency ?? "GBP"}>{currencies.map((x) => <option key={x}>{x}</option>)}</select></div>
      <div><label className="label">Value per term</label><input name="value" className="input" inputMode="decimal" defaultValue={c?.valueMinor ? minorToInput(c.valueMinor, c.currency) : ""} placeholder="0.00" /></div>
      <div><label className="label">Your cost per term</label><input name="cost" className="input" inputMode="decimal" defaultValue={c?.costMinor != null ? minorToInput(c.costMinor, c.currency) : ""} placeholder="For resold licences" /></div>
      <div><label className="label">Vendor</label><input name="vendor" className="input" defaultValue={c?.vendor ?? ""} placeholder="e.g. Microsoft, Shopify" /></div>
      <div><label className="label">Licence or order number</label><input name="reference" className="input" defaultValue={c?.reference ?? ""} /></div>
      <div><label className="label">Billed by repeating invoice</label><select name="recurringId" className="input" defaultValue={c?.recurringId ?? ""}><option value="">None</option>{recurring.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
      <div className="sm:col-span-2"><label className="label">Terms</label><textarea name="terms" className="input min-h-20" defaultValue={c?.terms ?? ""} placeholder="What's included, response times, cancellation" /></div>
      <div className="sm:col-span-2"><label className="label">Notes (only you see these)</label><textarea name="notes" className="input min-h-12" defaultValue={c?.notes ?? ""} /></div>
      {!c && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="draft" /> Save as a draft (not started yet)</label>}
    </div>
  );
}
