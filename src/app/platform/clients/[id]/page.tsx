import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { hqPeople } from "@/lib/server/hq-people";
import { PageHeader } from "@/components/admin";
import { ActionForm } from "@/components/FormMessage";
import { ClientFields } from "@/components/hq/ClientFields";
import { Timeline } from "@/components/hq/Timeline";
import { Pill } from "@/components/hq/ui";
import { saveClient, saveContact } from "@/lib/server/actions/hq-crm";
import { currencies, formatMoney } from "@/lib/hq/money";
import { INVOICE_STATUS, QUOTE_STATUS, LEAD_STAGE_LABEL } from "@/lib/hq/labels";
import { fmtDate } from "@/lib/dates";

export const metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const h = await requireHq("clients.view");
  const { id } = await params;
  const c = await db.hqClient.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      quotes: { orderBy: { issueDate: "desc" }, take: 50 },
      invoices: { orderBy: { issueDate: "desc" }, take: 100 },
      leads: { orderBy: { createdAt: "desc" } },
      notesLog: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!c) notFound();
  const people = await hqPeople();
  const edit = h.can("clients.edit");
  const owed = new Map<string, number>();
  for (const i of c.invoices) if (i.status === "SENT" || i.status === "PARTIAL") owed.set(i.currency, (owed.get(i.currency) ?? 0) + i.totalMinor - i.paidMinor);
  return (
    <div>
      <PageHeader
        title={c.name}
        sub={[c.email, c.phone, c.archived ? "Archived" : null].filter(Boolean).join(" · ")}
        actions={<>
          {h.can("quotes.edit") && <Link href={`/platform/quotes/new?client=${c.id}`} className="btn-secondary">New quote</Link>}
          {h.can("invoices.edit") && <Link href={`/platform/invoices/new?client=${c.id}`} className="btn-primary">New invoice</Link>}
        </>}
      />
      {owed.size > 0 && <p className="mb-4 text-sm">Owes you: <b>{[...owed].map(([cur, n]) => formatMoney(n, cur)).join(" + ")}</b></p>}
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          {h.can("invoices.view") && (
            <div className="card overflow-x-auto p-0">
              <h2 className="p-4 font-semibold">Invoices</h2>
              <table className="table">
                <thead><tr><th>Number</th><th>Date</th><th>Due</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Left to pay</th></tr></thead>
                <tbody>
                  {c.invoices.map((i) => <tr key={i.id}><td><Link href={`/platform/invoices/${i.id}`} className="font-mono text-xs font-semibold text-violet-700">{i.number}</Link></td><td>{fmtDate(i.issueDate)}</td><td>{fmtDate(i.dueDate)}</td><td><Pill s={i.status} map={INVOICE_STATUS} /></td><td className="text-right tabular-nums">{formatMoney(i.totalMinor, i.currency)}</td><td className="text-right tabular-nums">{i.status === "VOID" ? "" : formatMoney(i.totalMinor - i.paidMinor, i.currency)}</td></tr>)}
                  {!c.invoices.length && <tr><td colSpan={6} className="text-center text-slate-500">No invoices yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {h.can("quotes.view") && (
            <div className="card overflow-x-auto p-0">
              <h2 className="p-4 font-semibold">Quotes</h2>
              <table className="table">
                <thead><tr><th>Number</th><th>Title</th><th>Date</th><th>Status</th><th className="text-right">Total</th></tr></thead>
                <tbody>
                  {c.quotes.map((q) => <tr key={q.id}><td><Link href={`/platform/quotes/${q.id}`} className="font-mono text-xs font-semibold text-violet-700">{q.number}</Link></td><td>{q.title}</td><td>{fmtDate(q.issueDate)}</td><td><Pill s={q.status} map={QUOTE_STATUS} /></td><td className="text-right tabular-nums">{formatMoney(q.totalMinor, q.currency)}</td></tr>)}
                  {!c.quotes.length && <tr><td colSpan={5} className="text-center text-slate-500">No quotes yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {h.can("leads.view") && c.leads.length > 0 && (
            <div className="card">
              <h2 className="mb-2 font-semibold">Leads</h2>
              <ul className="text-sm">{c.leads.map((l) => <li key={l.id}><Link className="font-semibold text-violet-700" href={`/platform/leads/${l.id}`}>{l.title}</Link> · {LEAD_STAGE_LABEL[l.stage]}</li>)}</ul>
            </div>
          )}
          <Timeline notes={c.notesLog} clientId={c.id} canEdit={edit} />
        </div>
        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-3 font-semibold">Contacts</h2>
            <ul className="space-y-3 text-sm">
              {c.contacts.map((p) => (
                <li key={p.id}>
                  <details>
                    <summary className="cursor-pointer"><b>{p.name}</b>{p.isPrimary && <span className="badge ml-1 bg-violet-100 text-violet-800">Main</span>} <span className="text-slate-500">{p.jobTitle}</span><div className="text-xs text-slate-500">{[p.email, p.phone].filter(Boolean).join(" · ")}</div></summary>
                    {edit && (
                      <form action={saveContact} className="mt-2 space-y-2">
                        <input type="hidden" name="clientId" value={c.id} /><input type="hidden" name="id" value={p.id} />
                        <input name="name" className="input" defaultValue={p.name} required />
                        <input name="jobTitle" className="input" defaultValue={p.jobTitle ?? ""} placeholder="Job title" />
                        <input name="email" type="email" className="input" defaultValue={p.email ?? ""} placeholder="Email" />
                        <input name="phone" className="input" defaultValue={p.phone ?? ""} placeholder="Phone" />
                        <label className="flex items-center gap-2"><input type="checkbox" name="isPrimary" defaultChecked={p.isPrimary} /> Main contact</label>
                        <div className="flex gap-2"><button className="btn-secondary">Save</button><button name="op" value="delete" className="text-xs text-red-600">Remove</button></div>
                      </form>
                    )}
                  </details>
                </li>
              ))}
              {!c.contacts.length && <li className="text-slate-500">No contacts yet.</li>}
            </ul>
            {edit && (
              <details className="mt-4 border-t border-slate-100 pt-3 text-sm">
                <summary className="cursor-pointer font-semibold text-violet-700">Add a contact</summary>
                <form action={saveContact} className="mt-2 space-y-2">
                  <input type="hidden" name="clientId" value={c.id} />
                  <input name="name" className="input" placeholder="Name" required />
                  <input name="jobTitle" className="input" placeholder="Job title" />
                  <input name="email" type="email" className="input" placeholder="Email" />
                  <input name="phone" className="input" placeholder="Phone" />
                  <label className="flex items-center gap-2"><input type="checkbox" name="isPrimary" /> Main contact</label>
                  <button className="btn-secondary">Add</button>
                </form>
              </details>
            )}
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">Details</h2>
            {edit
              ? <ActionForm action={saveClient} className="space-y-3" submit="Save"><ClientFields c={c} list={currencies()} staff={people} /></ActionForm>
              : <dl className="space-y-1 text-sm"><div>{[c.addressLine1, c.addressLine2, c.town, c.postcode, c.country].filter(Boolean).join(", ")}</div><div>Currency: {c.currency} · Terms: {c.paymentDays} days</div>{c.vatNumber && <div>VAT: {c.vatNumber}</div>}{c.notes && <div className="whitespace-pre-line text-slate-600">{c.notes}</div>}</dl>}
          </div>
        </div>
      </div>
    </div>
  );
}
