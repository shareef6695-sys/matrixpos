import type { HqProject } from "@prisma/client";
import { minorToInput } from "@/lib/hq/money";
import { BILLING_LABEL, PROJECT_STATUS } from "@/lib/hq/labels";
import { londonDate } from "@/lib/dates";

export function ProjectFields({ p, clients, people, currencies, defaultClient, money = true }: {
  /** false for staff who can't see prices: the amounts are kept as they are. */
  money?: boolean;
  p?: HqProject; clients: { id: string; name: string }[]; people: { id: string; name: string }[]; currencies: string[]; defaultClient?: string;
}) {
  const d = (x: Date | null | undefined) => (x ? londonDate(x) : "");
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="sm:col-span-2"><label className="label">Project name</label><input name="name" className="input" defaultValue={p?.name} required placeholder="e.g. Booking app" /></div>
      <div><label className="label">Client</label><select name="clientId" className="input" defaultValue={p?.clientId ?? defaultClient ?? ""}><option value="">Internal (no client)</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label className="label">In charge</label><select name="managerId" className="input" defaultValue={p?.managerId ?? ""}><option value="">Nobody yet</option>{people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      <div><label className="label">Status</label><select name="status" className="input" defaultValue={p?.status ?? "ACTIVE"}>{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
      <div><label className="label">Billing</label><select name="billing" className="input" defaultValue={p?.billing ?? "FIXED"}>{Object.entries(BILLING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      {money ? <>
        <div><label className="label">Currency</label><select name="currency" className="input" defaultValue={p?.currency ?? "GBP"}>{currencies.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className="label">Price or budget</label><input name="budget" className="input" inputMode="decimal" defaultValue={p?.budgetMinor ? minorToInput(p.budgetMinor, p.currency) : ""} placeholder="0.00" /></div>
        <div><label className="label">Hourly rate</label><input name="rate" className="input" inputMode="decimal" defaultValue={p?.rateMinor ? minorToInput(p.rateMinor, p.currency) : ""} placeholder="For hourly work" /></div>
      </> : <>
        <input type="hidden" name="currency" value={p?.currency ?? "GBP"} />
        <input type="hidden" name="budget" value={p?.budgetMinor ? minorToInput(p.budgetMinor, p.currency) : ""} />
        <input type="hidden" name="rate" value={p?.rateMinor ? minorToInput(p.rateMinor, p.currency) : ""} />
      </>}
      <div><label className="label">Budgeted hours</label><input name="budgetHours" className="input" inputMode="decimal" defaultValue={p?.budgetHours != null ? String(Number(p.budgetHours)) : ""} /></div>
      <div><label className="label">Start</label><input name="startDate" type="date" className="input" defaultValue={d(p?.startDate)} /></div>
      <div><label className="label">Due</label><input name="dueDate" type="date" className="input" defaultValue={d(p?.dueDate)} /></div>
      <div className="sm:col-span-2"><label className="label">Description</label><textarea name="description" className="input min-h-16" defaultValue={p?.description ?? ""} /></div>
    </div>
  );
}
