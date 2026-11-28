import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { autoRenew } from "@/lib/server/hq-contracts";
import { requireHq } from "@/lib/server/hq";
import { contractFormData } from "@/lib/server/hq-contract-form";
import { nextTerm } from "@/lib/server/hq-contracts";
import { ActionForm } from "@/components/FormMessage";
import { ErrorBanner, Pill } from "@/components/hq/ui";
import { ContractFields } from "@/components/hq/ContractFields";
import { contractAction, saveContract } from "@/lib/server/actions/hq-projects";
import { formatMoney } from "@/lib/hq/money";
import { daysLeft, renewalState } from "@/lib/hq/projects";
import { CONTRACT_KIND_LABEL, CONTRACT_STATUS, RENEWAL } from "@/lib/hq/labels";
import { fmtDate, londonDate } from "@/lib/dates";

export const metadata = { title: "Contract" };

function Op({ id, op, label, primary, danger }: { id: string; op: string; label: string; primary?: boolean; danger?: boolean }) {
  return <form action={contractAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={op} /><button className={primary ? "btn-primary" : `btn-secondary ${danger ? "text-red-700" : ""}`}>{label}</button></form>;
}

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const h = await requireHq("contracts.view");
  const { id } = await params;
  const { error } = await searchParams;
  await autoRenew();
  const c = await db.hqContract.findUnique({ where: { id }, include: { client: true } });
  if (!c) notFound();
  const edit = h.can("contracts.edit");
  const today = londonDate();
  const s = renewalState({ status: c.status, endDate: c.endDate ? londonDate(c.endDate) : null, noticeDays: c.noticeDays }, today);
  const recurring = c.recurringId ? await db.hqRecurring.findUnique({ where: { id: c.recurringId } }) : null;
  const data = edit ? await contractFormData() : null;
  const margin = c.costMinor != null && c.valueMinor ? c.valueMinor - c.costMinor : null;
  return (
    <div>
      <Link href="/platform/contracts" className="text-sm text-slate-500">← Contracts</Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{c.title} <Pill s={c.status} map={CONTRACT_STATUS} />{s !== "none" && <> <Pill s={s} map={RENEWAL} /></>}</h1>
          <p className="text-sm text-slate-500"><Link href={`/platform/clients/${c.clientId}`} className="font-semibold text-violet-700">{c.client.name}</Link> · {CONTRACT_KIND_LABEL[c.kind]}{c.vendor ? ` · ${c.vendor}` : ""}{c.reference ? ` · ${c.reference}` : ""}</p>
        </div>
        {edit && (
          <div className="flex flex-wrap gap-2">
            {c.status === "DRAFT" && <Op id={c.id} op="activate" label="Start contract" primary />}
            {c.status !== "CANCELLED" && c.endDate && <Op id={c.id} op="renew" label={`Renew to ${fmtDate(nextTerm(c.endDate, c.renewMonths))}`} primary={s === "due" || s === "overdue"} />}
            {c.status === "ACTIVE" && <Op id={c.id} op="end" label="End" />}
            {c.status === "ACTIVE" && <Op id={c.id} op="cancel" label="Cancel" danger />}
            {(c.status === "ENDED" || c.status === "CANCELLED") && <Op id={c.id} op="activate" label="Reactivate" />}
            {c.status === "DRAFT" && <Op id={c.id} op="delete" label="Delete draft" danger />}
          </div>
        )}
      </div>
      <ErrorBanner error={error} />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <div className="card grid gap-3 text-sm sm:grid-cols-2">
            <div><div className="label">Started</div>{fmtDate(c.startDate)}</div>
            <div><div className="label">Ends</div>{c.endDate ? <>{fmtDate(c.endDate)} {c.status === "ACTIVE" && <span className="text-slate-500">({(() => { const d = daysLeft(londonDate(c.endDate), today); return d < 0 ? `${-d} days ago` : d === 0 ? "today" : `in ${d} days`; })()})</span>}</> : "Rolling, no end date"}</div>
            <div><div className="label">Renewal</div>{c.autoRenew ? `Automatic, ${c.renewMonths} months at a time` : `By hand, ${c.renewMonths} months at a time`}{c.renewedCount ? ` · renewed ${c.renewedCount} time${c.renewedCount === 1 ? "" : "s"}` : ""}</div>
            <div><div className="label">Reminder</div>{c.noticeDays} days before it ends{c.remindedFor ? " · sent" : ""}</div>
            <div><div className="label">Value per term</div>{formatMoney(c.valueMinor, c.currency)}{margin !== null && <span className="text-slate-500"> · margin {formatMoney(margin, c.currency)}</span>}</div>
            <div><div className="label">Billing</div>{recurring ? <Link href={`/platform/recurring/${recurring.id}`} className="text-violet-700">Repeating invoice{recurring.active ? `, next ${fmtDate(recurring.nextDate)}` : " (paused)"}</Link> : <>Not linked. {h.can("invoices.edit") && <Link href={`/platform/recurring/new?client=${c.clientId}`} className="text-violet-700">Set up a repeating invoice</Link>}</>}</div>
          </div>
          {c.terms && <div className="card whitespace-pre-line text-sm"><div className="label">Terms</div>{c.terms}</div>}
          {c.notes && <div className="card whitespace-pre-line text-sm"><div className="label">Notes</div>{c.notes}</div>}
        </div>
        {data && (
          <details className="card h-fit">
            <summary className="cursor-pointer font-semibold">Change the contract</summary>
            <ActionForm action={saveContract} className="mt-3 space-y-4" submit="Save"><ContractFields c={c} {...data} /></ActionForm>
          </details>
        )}
      </div>
    </div>
  );
}
