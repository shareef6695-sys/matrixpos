import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { PageHeader } from "@/components/admin";
import { ActionForm } from "@/components/FormMessage";
import { saveSupplier } from "@/lib/server/actions/hq-books";
import { currencies, formatMoney } from "@/lib/hq/money";
import type { HqSupplier } from "@prisma/client";

export const metadata = { title: "Suppliers" };

function Fields({ s, list }: { s?: HqSupplier; list: string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="sm:col-span-2"><label className="label">Name</label><input name="name" className="input" defaultValue={s?.name} required /></div>
      <div><label className="label">Email</label><input name="email" type="email" className="input" defaultValue={s?.email ?? ""} /></div>
      <div><label className="label">Phone</label><input name="phone" className="input" defaultValue={s?.phone ?? ""} /></div>
      <div><label className="label">Currency</label><select name="currency" className="input" defaultValue={s?.currency ?? "GBP"}>{list.map((c) => <option key={c}>{c}</option>)}</select></div>
      <div><label className="label">VAT number</label><input name="vatNumber" className="input" defaultValue={s?.vatNumber ?? ""} /></div>
      <div className="sm:col-span-2"><label className="label">Address</label><textarea name="address" className="input min-h-12" defaultValue={s?.address ?? ""} /></div>
      <div className="sm:col-span-2"><label className="label">Notes</label><textarea name="notes" className="input min-h-12" defaultValue={s?.notes ?? ""} /></div>
      {s && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="archived" defaultChecked={s.archived} /> Archived</label>}
    </div>
  );
}

export default async function Suppliers() {
  const h = await requireHq("accounts.view");
  const edit = h.can("accounts.edit");
  const suppliers = await db.hqSupplier.findMany({ orderBy: [{ archived: "asc" }, { name: "asc" }], include: { bills: { where: { status: { in: ["OPEN", "PARTIAL"] } }, select: { totalMinor: true, paidMinor: true, currency: true } } } });
  const list = currencies();
  return (
    <div>
      <PageHeader title="Suppliers" sub="Who you buy from: software vendors, freelancers, hosting, your accountant." actions={<Link href="/platform/bills" className="btn-secondary">Bills and expenses</Link>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-2">
          {suppliers.map((s) => {
            const owed = s.bills.reduce((n, b) => n + b.totalMinor - b.paidMinor, 0);
            return (
              <details key={s.id} id={s.id} className={`card ${s.archived ? "opacity-60" : ""}`}>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span><b>{s.name}</b> <span className="text-xs text-slate-500">{s.currency}</span></span>
                  <span className="flex items-center gap-3 text-sm">
                    {owed > 0 && <span className="tabular-nums text-amber-700">Owed {formatMoney(owed, s.bills[0].currency)}</span>}
                    {edit && <Link href={`/platform/bills/new?supplier=${s.id}`} className="text-violet-700">Add bill</Link>}
                  </span>
                </summary>
                {edit && <ActionForm action={saveSupplier} className="mt-3 space-y-3" submit="Save"><Fields s={s} list={list} /></ActionForm>}
              </details>
            );
          })}
          {!suppliers.length && <p className="text-sm text-slate-500">No suppliers yet.</p>}
        </div>
        {edit && <div className="card h-fit"><h2 className="mb-3 font-semibold">Add a supplier</h2><ActionForm action={saveSupplier} className="space-y-3" submit="Add supplier" reset><Fields list={list} /></ActionForm></div>}
      </div>
    </div>
  );
}
