import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { hqPeople } from "@/lib/server/hq-people";
import { PageHeader } from "@/components/admin";
import { ActionForm } from "@/components/FormMessage";
import { LeadFields } from "@/components/hq/LeadFields";
import { saveLead, moveLead } from "@/lib/server/actions/hq-crm";
import { currencies, formatMoney } from "@/lib/hq/money";
import { LEAD_STAGES, LEAD_STAGE_LABEL } from "@/lib/hq/labels";
import { fmtDate } from "@/lib/dates";

export const metadata = { title: "Leads" };

export default async function Leads({ searchParams }: { searchParams: Promise<{ closed?: string }> }) {
  const h = await requireHq("leads.view");
  const { closed } = await searchParams;
  const showClosed = closed === "1";
  const [leads, people] = await Promise.all([
    db.hqLead.findMany({ where: showClosed ? {} : { OR: [{ stage: { notIn: ["WON", "LOST"] } }, { updatedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }] }, orderBy: { updatedAt: "desc" }, take: 500 }),
    hqPeople(),
  ]);
  const names = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const edit = h.can("leads.edit");
  return (
    <div>
      <PageHeader title="Leads" sub="Enquiries on their way to becoming clients. Won and lost leads drop off the board after 30 days." actions={<Link href={showClosed ? "/platform/leads" : "/platform/leads?closed=1"} className="btn-secondary">{showClosed ? "Hide old won and lost" : "Show all won and lost"}</Link>} />
      <div className="mb-6 flex gap-3 overflow-x-auto pb-2">
        {LEAD_STAGES.map((s) => {
          const col = leads.filter((l) => l.stage === s);
          return (
            <div key={s} className="w-64 shrink-0">
              <div className="mb-2 flex justify-between text-sm font-semibold"><span>{LEAD_STAGE_LABEL[s]}</span><span className="text-slate-500">{col.length}</span></div>
              <div className="space-y-2">
                {col.map((l) => (
                  <div key={l.id} className="card p-3 text-sm">
                    <Link href={`/platform/leads/${l.id}`} className="font-semibold text-violet-700">{l.title}</Link>
                    <div className="text-xs text-slate-500">{[l.company, l.contactName].filter(Boolean).join(" · ")}</div>
                    <div className="mt-1 flex justify-between text-xs"><span className="tabular-nums">{l.valueMinor ? formatMoney(l.valueMinor, l.currency) : ""}</span><span className="text-slate-500">{l.expectedClose ? fmtDate(l.expectedClose) : ""}</span></div>
                    {l.ownerId && names[l.ownerId] && <div className="text-xs text-slate-500">{names[l.ownerId]}</div>}
                    {edit && (
                      <form action={moveLead} className="mt-2 flex gap-1">
                        <input type="hidden" name="id" value={l.id} />
                        <select name="stage" className="input py-1 text-xs" defaultValue={l.stage} aria-label="Move to stage">{LEAD_STAGES.map((x) => <option key={x} value={x}>{LEAD_STAGE_LABEL[x]}</option>)}</select>
                        <button className="btn-secondary px-2 py-1 text-xs">Move</button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {edit && (
        <div className="card max-w-2xl">
          <h2 className="mb-3 font-semibold">Add a lead</h2>
          <ActionForm action={saveLead} className="space-y-3" submit="Add lead" reset><LeadFields list={currencies()} staff={people} /></ActionForm>
        </div>
      )}
    </div>
  );
}
