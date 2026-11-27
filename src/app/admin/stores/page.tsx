import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/admin";
import { saveStore, saveRegister } from "@/lib/server/actions/admin";

export const metadata = { title: "Stores & tills" };

export default async function Stores({ searchParams }: { searchParams: Promise<{ limit?: string }> }) {
  const { limit } = await searchParams;
  const s = await requireAdmin("OWNER");
  const [stores, settings] = await Promise.all([
    db.store.findMany({ where: { organizationId: s.orgId }, include: { registers: { orderBy: { number: "asc" } } }, orderBy: { name: "asc" } }),
    db.orgSettings.findUnique({ where: { organizationId: s.orgId } }),
  ]);
  const storeFields = (st?: (typeof stores)[number]) => (
    <div className="grid gap-2 sm:grid-cols-3">
      {st && <input type="hidden" name="id" value={st.id} />}
      <div className="sm:col-span-2"><label className="label">Name</label><input name="name" className="input" defaultValue={st?.name} required /></div>
      <div><label className="label">Receipt code</label><input name="code" className="input uppercase" defaultValue={st?.code} maxLength={6} required /></div>
      <div className="sm:col-span-2"><label className="label">Address</label><input name="addressLine1" className="input" defaultValue={st?.addressLine1 ?? ""} /></div>
      <div><label className="label">Line 2</label><input name="addressLine2" className="input" defaultValue={st?.addressLine2 ?? ""} /></div>
      <div><label className="label">Town</label><input name="town" className="input" defaultValue={st?.town ?? ""} /></div>
      <div><label className="label">Postcode</label><input name="postcode" className="input" defaultValue={st?.postcode ?? ""} /></div>
      <div><label className="label">Phone</label><input name="phone" className="input" defaultValue={st?.phone ?? ""} /></div>
    </div>
  );
  return (
    <div>
      <PageHeader title="Stores & tills" sub="Each branch has its own stock and tills. Products and offers are shared." />
      {limit && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {limit} <a href="/admin/billing" className="font-semibold underline">See plans</a>
        </div>
      )}
      <div className="space-y-6">
        {stores.map((st) => (
          <div key={st.id} className="card">
            <form action={saveStore} className="space-y-3">{storeFields(st)}<button className="btn-secondary">Save store</button></form>
            <h3 className="mb-2 mt-6 font-semibold">Tills</h3>
            <div className="space-y-2">
              {st.registers.map((r) => (
                <form key={r.id} action={saveRegister} className="grid items-end gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-5">
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="storeId" value={st.id} />
                  <div><label className="label">Name (#{r.number})</label><input name="name" className="input" defaultValue={r.name} /></div>
                  <div><label className="label">Stripe reader id</label><input name="stripeReaderId" className="input" defaultValue={r.stripeReaderId ?? ""} placeholder="tmr_…" disabled={!settings?.enableStripeTerminal} /></div>
                  <div><label className="label">SumUp reader id</label><input name="sumupReaderId" className="input" defaultValue={r.sumupReaderId ?? ""} disabled={!settings?.enableSumUp} /></div>
                  <div><label className="label">Dojo terminal id</label><input name="dojoTerminalId" className="input" defaultValue={r.dojoTerminalId ?? ""} disabled={!settings?.enableDojo} /></div>
                  <button className="btn-secondary">Save</button>
                </form>
              ))}
              <form action={saveRegister}><input type="hidden" name="storeId" value={st.id} /><button className="btn-secondary">+ Add till</button></form>
            </div>
          </div>
        ))}
        <div className="card">
          <h2 className="mb-3 font-semibold">Add a store</h2>
          <form action={saveStore} className="space-y-3">{storeFields()}<button className="btn-primary">Add store</button></form>
        </div>
      </div>
    </div>
  );
}
