import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { PageHeader } from "@/components/admin";
import { ActionForm } from "@/components/FormMessage";
import { saveItem, loadStarterCatalogue } from "@/lib/server/actions/hq-crm";
import { currencies, formatMoney, minorToInput } from "@/lib/hq/money";
import { ITEM_KIND_LABEL } from "@/lib/hq/labels";
import type { HqItem } from "@prisma/client";

export const metadata = { title: "Catalogue" };

function Fields({ i, list }: { i?: HqItem; list: string[] }) {
  return (
    <>
      {i && <input type="hidden" name="id" value={i.id} />}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">Name</label><input name="name" className="input" defaultValue={i?.name} required /></div>
        <div><label className="label">Type</label><select name="kind" className="input" defaultValue={i?.kind ?? "SERVICE"}>{Object.entries(ITEM_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label">Code (optional)</label><input name="sku" className="input" defaultValue={i?.sku ?? ""} /></div>
        <div><label className="label">Currency</label><select name="currency" className="input" defaultValue={i?.currency ?? "GBP"}>{list.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className="label">Price per</label><select name="unit" className="input" defaultValue={i?.unit ?? "each"}>{["each", "hour", "day", "week", "month", "year", "user", "licence"].map((u) => <option key={u}>{u}</option>)}</select></div>
        <div><label className="label">Price</label><input name="price" className="input" inputMode="decimal" defaultValue={i ? minorToInput(i.priceMinor, i.currency) : ""} placeholder="0.00" /></div>
        <div><label className="label">Your cost (optional)</label><input name="cost" className="input" inputMode="decimal" defaultValue={i?.costMinor != null ? minorToInput(i.costMinor, i.currency) : ""} /></div>
        <div><label className="label">Vendor (third-party)</label><input name="vendor" className="input" defaultValue={i?.vendor ?? ""} /></div>
        <div><label className="label">Web page</label><input name="url" className="input" defaultValue={i?.url ?? ""} placeholder="https://" /></div>
        <div className="sm:col-span-2"><label className="label">Description (goes on quotes and invoices)</label><textarea name="description" className="input min-h-16" defaultValue={i?.description ?? ""} /></div>
        {i && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={i.active} /> For sale</label>}
      </div>
    </>
  );
}

export default async function Catalogue() {
  const h = await requireHq("catalogue.view");
  const edit = h.can("catalogue.edit");
  const items = await db.hqItem.findMany({ orderBy: [{ active: "desc" }, { kind: "asc" }, { name: "asc" }] });
  const list = currencies();
  return (
    <div>
      <PageHeader title="Catalogue" sub="Everything you sell: custom builds, services, subscriptions and third-party apps. Pick these on quotes and invoices." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-2">
          {items.map((i) => (
            <details key={i.id} className={`card ${i.active ? "" : "opacity-60"}`}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span><b>{i.name}</b> {i.sku && <span className="font-mono text-xs text-slate-500">{i.sku}</span>} <span className="badge bg-slate-100 text-slate-700">{ITEM_KIND_LABEL[i.kind]}</span>{!i.active && <span className="badge ml-1 bg-slate-200">Not for sale</span>}</span>
                <span className="tabular-nums">{i.priceMinor ? `${formatMoney(i.priceMinor, i.currency)} / ${i.unit}` : "Quoted"}</span>
              </summary>
              {i.description && <p className="mt-2 text-sm text-slate-600">{i.description}</p>}
              {edit && <ActionForm action={saveItem} className="mt-4 space-y-3" submit="Save"><Fields i={i} list={list} /></ActionForm>}
            </details>
          ))}
          {!items.length && (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              <p>Nothing in the catalogue yet.</p>
              {edit && <form action={loadStarterCatalogue} className="mt-3"><button className="btn-primary">Add the services from matrixinfo.co.uk and the POS plans</button></form>}
            </div>
          )}
        </div>
        {edit && (
          <div className="space-y-4">
            <div className="card h-fit">
              <h2 className="mb-3 font-semibold">Add an item</h2>
              <ActionForm action={saveItem} className="space-y-3" submit="Add" reset><Fields list={list} /></ActionForm>
            </div>
            {items.length > 0 && (
              <form action={loadStarterCatalogue} className="card text-sm">
                <p className="mb-2 text-slate-600">Add anything from your website&apos;s services and the MatrixPOS plans that isn&apos;t here yet (matched by code).</p>
                <button className="btn-secondary">Add missing website services</button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
