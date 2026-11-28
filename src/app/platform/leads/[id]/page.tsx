import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { hqPeople } from "@/lib/server/hq-people";
import { PageHeader } from "@/components/admin";
import { ActionForm } from "@/components/FormMessage";
import { LeadFields } from "@/components/hq/LeadFields";
import { Timeline } from "@/components/hq/Timeline";
import { saveLead, convertLead } from "@/lib/server/actions/hq-crm";
import { currencies, formatMoney } from "@/lib/hq/money";
import { LEAD_STAGE_LABEL } from "@/lib/hq/labels";

export const metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const h = await requireHq("leads.view");
  const { id } = await params;
  const l = await db.hqLead.findUnique({ where: { id }, include: { client: true, notesLog: { orderBy: { createdAt: "desc" }, take: 100 } } });
  if (!l) notFound();
  const [people, clients] = await Promise.all([hqPeople(), db.hqClient.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  const edit = h.can("leads.edit");
  return (
    <div>
      <PageHeader title={l.title} sub={`${LEAD_STAGE_LABEL[l.stage]}${l.valueMinor ? ` · ${formatMoney(l.valueMinor, l.currency)}` : ""}${l.company ? ` · ${l.company}` : ""}`} actions={<Link href="/platform/leads" className="btn-secondary">Back to leads</Link>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          {edit && h.can("clients.edit") && (
            <div className="card">
              {l.client ? (
                <p className="text-sm">Client: <Link href={`/platform/clients/${l.client.id}`} className="font-semibold text-violet-700">{l.client.name}</Link></p>
              ) : <p className="mb-2 text-sm text-slate-600">Ready to quote? Make them a client (or link an existing one) and start a quote.</p>}
              <form action={convertLead} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="id" value={l.id} />
                {!l.client && <select name="clientId" className="input w-auto" defaultValue=""><option value="">Create a new client from this lead</option>{clients.map((c) => <option key={c.id} value={c.id}>Link to {c.name}</option>)}</select>}
                <button className="btn-primary">{l.client ? "Start a quote" : "Make client and start a quote"}</button>
              </form>
            </div>
          )}
          <Timeline notes={l.notesLog} leadId={l.id} canEdit={edit} />
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold">Details</h2>
          {edit
            ? <ActionForm action={saveLead} className="space-y-3" submit="Save"><LeadFields l={l} list={currencies()} staff={people} /></ActionForm>
            : <dl className="space-y-1 text-sm"><div>{[l.contactName, l.email, l.phone].filter(Boolean).join(" · ")}</div><div>Came from: {l.source ?? "not recorded"}</div>{l.notes && <div className="whitespace-pre-line text-slate-600">{l.notes}</div>}</dl>}
        </div>
      </div>
    </div>
  );
}
