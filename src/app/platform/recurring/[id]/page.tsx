import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { documentFormData, ymd } from "@/lib/server/hq-forms";
import { DocumentForm } from "@/components/hq/DocumentForm";
import { RecurringFields } from "@/components/hq/RecurringFields";
import { ErrorBanner, Pill } from "@/components/hq/ui";
import { recurringAction, saveRecurring } from "@/lib/server/actions/hq-books";
import { formatMoney } from "@/lib/hq/money";
import { FREQUENCY_LABEL, INVOICE_STATUS } from "@/lib/hq/labels";
import { fmtDate } from "@/lib/dates";

export const metadata = { title: "Repeating invoice" };

function Op({ id, op, label, danger }: { id: string; op: string; label: string; danger?: boolean }) {
  return <form action={recurringAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={op} /><button className={`btn-secondary ${danger ? "text-red-700" : ""}`}>{label}</button></form>;
}

type Typed = { itemId?: string | null; description?: string; quantity?: string | number; unit?: string | number; discountPct?: string | number; taxPct?: string | number };

export default async function RecurringPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const h = await requireHq("invoices.view");
  const { id } = await params;
  const { error } = await searchParams;
  const r = await db.hqRecurring.findUnique({ where: { id }, include: { client: true, invoices: { orderBy: { issueDate: "desc" }, take: 50 } } });
  if (!r) notFound();
  const edit = h.can("invoices.edit");
  const data = edit ? await documentFormData() : null;
  const lines = (Array.isArray(r.lines) ? (r.lines as Typed[]) : []).map((l) => ({
    itemId: l.itemId ?? null, description: String(l.description ?? ""), quantity: String(l.quantity ?? "1"), unit: String(l.unit ?? ""), discountPct: String(l.discountPct ?? ""), taxPct: String(l.taxPct ?? ""),
  }));
  return (
    <div>
      <Link href="/platform/recurring" className="text-sm text-slate-500">← Repeating invoices</Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{r.client.name}{r.title ? `: ${r.title}` : ""}</h1>
          <p className="text-sm text-slate-500">{FREQUENCY_LABEL[r.frequency]} · {r.active ? `next on ${fmtDate(r.nextDate)}` : "paused"}{r.endDate && ` · until ${fmtDate(r.endDate)}`} · {r.autoSend ? "emailed automatically" : "saved as drafts"}</p>
        </div>
        {edit && (
          <div className="flex flex-wrap gap-2">
            {r.active && <Op id={r.id} op="run" label="Make any due now" />}
            <Op id={r.id} op={r.active ? "pause" : "resume"} label={r.active ? "Pause" : "Resume"} />
            <Op id={r.id} op="delete" label="Delete" danger />
          </div>
        )}
      </div>
      <ErrorBanner error={error} />
      <div className="card mb-6 overflow-x-auto p-0">
        <h2 className="px-4 pt-4 font-semibold">Invoices made</h2>
        <table className="table">
          <tbody>
            {r.invoices.map((i) => <tr key={i.id}><td><Link href={`/platform/invoices/${i.id}`} className="font-mono text-xs font-semibold text-violet-700">{i.number}</Link></td><td>{fmtDate(i.issueDate)}</td><td><Pill s={i.status} map={INVOICE_STATUS} /></td><td className="text-right tabular-nums">{formatMoney(i.totalMinor, i.currency)}</td></tr>)}
            {!r.invoices.length && <tr><td className="text-slate-500">None yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && (
        <details className="mb-6">
          <summary className="mb-3 cursor-pointer font-semibold">Change the repeating invoice</summary>
          <DocumentForm kind="recurring" action={saveRecurring} {...data}
            defaults={{ id: r.id, clientId: r.clientId, title: r.title ?? undefined, currency: r.currency, issueDate: ymd(r.nextDate)!, notes: r.notes ?? undefined, terms: r.terms ?? undefined, lines }}
            extra={<RecurringFields frequency={r.frequency} endDate={ymd(r.endDate)} autoSend={r.autoSend} />} />
        </details>
      )}
    </div>
  );
}
