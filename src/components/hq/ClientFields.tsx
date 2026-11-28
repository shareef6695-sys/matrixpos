import type { HqClient } from "@prisma/client";

/** The client form fields, shared by "add client" and the client's own page. */
export function ClientFields({ c, list, staff }: { c?: HqClient; list: string[]; staff: { id: string; name: string }[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="sm:col-span-2"><label className="label">Name</label><input name="name" className="input" defaultValue={c?.name} required /></div>
      <div><label className="label">Type</label><select name="isCompany" className="input" defaultValue={c && !c.isCompany ? "person" : "company"}><option value="company">Company</option><option value="person">Person</option></select></div>
      <div><label className="label">Looked after by</label><select name="ownerId" className="input" defaultValue={c?.ownerId ?? ""}><option value="">Nobody yet</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div><label className="label">Email (invoices go here)</label><input name="email" type="email" className="input" defaultValue={c?.email ?? ""} /></div>
      <div><label className="label">Phone</label><input name="phone" className="input" defaultValue={c?.phone ?? ""} /></div>
      <div className="sm:col-span-2"><label className="label">Website</label><input name="website" className="input" defaultValue={c?.website ?? ""} /></div>
      <div><label className="label">Address</label><input name="addressLine1" className="input" defaultValue={c?.addressLine1 ?? ""} /></div>
      <div><label className="label">Address line 2</label><input name="addressLine2" className="input" defaultValue={c?.addressLine2 ?? ""} /></div>
      <div><label className="label">Town or city</label><input name="town" className="input" defaultValue={c?.town ?? ""} /></div>
      <div><label className="label">Postcode</label><input name="postcode" className="input" defaultValue={c?.postcode ?? ""} /></div>
      <div><label className="label">Country</label><input name="country" className="input" defaultValue={c?.country ?? "United Kingdom"} /></div>
      <div><label className="label">Currency</label><select name="currency" className="input" defaultValue={c?.currency ?? "GBP"}>{list.map((x) => <option key={x}>{x}</option>)}</select></div>
      <div><label className="label">Payment terms (days)</label><input name="paymentDays" className="input" inputMode="numeric" defaultValue={c?.paymentDays ?? 14} /></div>
      <div><label className="label">VAT / tax number</label><input name="vatNumber" className="input" defaultValue={c?.vatNumber ?? ""} /></div>
      <div><label className="label">Company number</label><input name="companyNo" className="input" defaultValue={c?.companyNo ?? ""} /></div>
      <div className="sm:col-span-2"><label className="label">Notes (only HQ sees these)</label><textarea name="notes" className="input min-h-16" defaultValue={c?.notes ?? ""} /></div>
      {c && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="archived" defaultChecked={c.archived} /> Archived</label>}
    </div>
  );
}
