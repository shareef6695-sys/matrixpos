import type { HqLead } from "@prisma/client";
import { LEAD_STAGES, LEAD_STAGE_LABEL } from "@/lib/hq/labels";
import { minorToInput } from "@/lib/hq/money";
import { londonDate } from "@/lib/dates";

export function LeadFields({ l, list, staff }: { l?: HqLead; list: string[]; staff: { id: string; name: string }[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {l && <input type="hidden" name="id" value={l.id} />}
      <div className="sm:col-span-2"><label className="label">What they want</label><input name="title" className="input" defaultValue={l?.title} placeholder="e.g. Booking app for a dental clinic" required /></div>
      <div><label className="label">Company</label><input name="company" className="input" defaultValue={l?.company ?? ""} /></div>
      <div><label className="label">Contact name</label><input name="contactName" className="input" defaultValue={l?.contactName ?? ""} /></div>
      <div><label className="label">Email</label><input name="email" type="email" className="input" defaultValue={l?.email ?? ""} /></div>
      <div><label className="label">Phone</label><input name="phone" className="input" defaultValue={l?.phone ?? ""} /></div>
      <div><label className="label">Came from</label><input name="source" className="input" list="lead-sources" defaultValue={l?.source ?? ""} />
        <datalist id="lead-sources">{["Website", "WhatsApp", "Referral", "LinkedIn", "Google", "Phone call", "Existing client", "Event"].map((s) => <option key={s} value={s} />)}</datalist></div>
      <div><label className="label">Stage</label><select name="stage" className="input" defaultValue={l?.stage ?? "NEW"}>{LEAD_STAGES.map((s) => <option key={s} value={s}>{LEAD_STAGE_LABEL[s]}</option>)}</select></div>
      <div><label className="label">Currency</label><select name="currency" className="input" defaultValue={l?.currency ?? "GBP"}>{list.map((c) => <option key={c}>{c}</option>)}</select></div>
      <div><label className="label">Expected value</label><input name="value" className="input" inputMode="decimal" defaultValue={l ? minorToInput(l.valueMinor, l.currency) : ""} /></div>
      <div><label className="label">Expected to close</label><input name="expectedClose" type="date" className="input" defaultValue={l?.expectedClose ? londonDate(l.expectedClose) : ""} /></div>
      <div><label className="label">Looked after by</label><select name="ownerId" className="input" defaultValue={l?.ownerId ?? ""}><option value="">Me</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      {l?.stage === "LOST" && <div className="sm:col-span-2"><label className="label">Why it was lost</label><input name="lostReason" className="input" defaultValue={l.lostReason ?? ""} /></div>}
      <div className="sm:col-span-2"><label className="label">Notes</label><textarea name="notes" className="input min-h-16" defaultValue={l?.notes ?? ""} /></div>
    </div>
  );
}
