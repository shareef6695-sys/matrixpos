import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/admin";
import { ActionForm } from "@/components/FormMessage";
import { eraseStaff, saveStaff } from "@/lib/server/actions/admin";

export const metadata = { title: "Staff" };

const ROLE: Record<string, string> = {
  OWNER: "Everything, including settings and billing", MANAGER: "Back office, refunds, reports",
  SUPERVISOR: "Till overrides: voids, discounts, closing the till", CASHIER: "Sell at the till",
};

export default async function Staff() {
  const s = await requireAdmin();
  const [users, stores] = await Promise.all([
    db.user.findMany({ where: { organizationId: s.orgId }, include: { stores: true }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.store.findMany({ where: { organizationId: s.orgId }, orderBy: { name: "asc" } }),
  ]);
  const fields = (u?: (typeof users)[number]) => (
    <>
      {u && <input type="hidden" name="id" value={u.id} />}
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label className="label">Name</label><input name="name" className="input" defaultValue={u?.name} required /></div>
        <div><label className="label">Role</label><select name="role" className="input" defaultValue={u?.role ?? "CASHIER"}>{Object.keys(ROLE).filter((r) => r !== "OWNER" || s.role === "OWNER").map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}</select></div>
        <div><label className="label">Till PIN {u && "(blank = keep)"}</label><input name="pin" className="input" inputMode="numeric" pattern="\d{4,6}" placeholder="4-6 digits" required={!u} /></div>
        <div><label className="label">Email (managers)</label><input name="email" type="email" className="input" defaultValue={u?.email ?? ""} /></div>
        <div className="sm:col-span-2"><label className="label">Back office password {u && "(blank = keep)"}</label><input name="password" type="password" className="input" autoComplete="new-password" /></div>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {stores.map((st) => <label key={st.id} className="flex items-center gap-1"><input type="checkbox" name="stores" value={st.id} defaultChecked={u ? u.stores.some((x) => x.storeId === st.id) : true} /> {st.name}</label>)}
        {u && <label className="flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={u.active} /> Active</label>}
      </div>
    </>
  );
  return (
    <div>
      <PageHeader title="Staff" sub="Everyone signs in at the till with their own PIN, so every sale and override is traceable." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {users.map((u) => (
            <details key={u.id} className={`card ${u.active ? "" : "opacity-60"}`}>
              <summary className="flex cursor-pointer items-center justify-between">
                <span><b>{u.name}</b> <span className="text-sm text-slate-500">{u.email}</span></span>
                <span className="badge bg-slate-100 text-slate-700">{u.role.toLowerCase()}</span>
              </summary>
              <ActionForm action={saveStaff} className="mt-4 space-y-3" submit="Save">{fields(u)}</ActionForm>
              {u.id !== s.userId && (s.role === "OWNER" || (u.role !== "OWNER" && u.role !== "MANAGER")) && (
                <details className="mt-4 border-t border-slate-100 pt-3 text-sm">
                  <summary className="cursor-pointer text-red-700">Erase this person&apos;s personal data</summary>
                  <p className="my-2 text-slate-600">For someone who has left and asked to be forgotten (UK GDPR). Their name, email, password and PIN are removed and they can&apos;t sign in. Their sales and shifts stay in your records as &quot;Former staff member&quot;. This can&apos;t be undone.</p>
                  <ActionForm action={eraseStaff} className="flex flex-wrap items-start gap-2 [&>button]:w-auto [&>button]:bg-red-600" submit="Erase">
                    <input type="hidden" name="id" value={u.id} />
                    <input name="confirm" className="input w-40" placeholder="Type ERASE" aria-label="Type ERASE to confirm" required />
                  </ActionForm>
                </details>
              )}
            </details>
          ))}
        </div>
        <div className="space-y-4">
          <div className="card"><h2 className="mb-3 font-semibold">Add staff member</h2><ActionForm action={saveStaff} className="space-y-3" submit="Add" reset>{fields()}</ActionForm></div>
          <div className="card text-sm"><h2 className="mb-2 font-semibold">Roles</h2><ul className="space-y-1">{Object.entries(ROLE).map(([r, d]) => <li key={r}><b className="capitalize">{r.toLowerCase()}</b>: {d}</li>)}</ul></div>
        </div>
      </div>
    </div>
  );
}
