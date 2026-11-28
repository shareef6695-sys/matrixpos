import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { appUrl } from "@/lib/server/email";
import { billTo } from "@/lib/server/hq-docs";
import { HqDocument } from "@/components/hq/HqDocument";
import { ErrorBanner, Pill } from "@/components/hq/ui";
import { PrintButton } from "@/components/PrintButton";
import { quoteAction, quoteToInvoice } from "@/lib/server/actions/hq-sales";
import { QUOTE_STATUS } from "@/lib/hq/labels";
import { fmtDateTime } from "@/lib/dates";

export const metadata = { title: "Quote" };

function Op({ id, op, label, primary, confirm }: { id: string; op: string; label: string; primary?: boolean; confirm?: boolean }) {
  return (
    <form action={quoteAction}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={op} />
      <button className={primary ? "btn-primary" : confirm ? "btn-secondary text-red-700" : "btn-secondary"}>{label}</button>
    </form>
  );
}

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const h = await requireHq("quotes.view");
  const { id } = await params;
  const { error } = await searchParams;
  const q = await db.hqQuote.findUnique({ where: { id }, include: { client: { include: { contacts: true } }, lines: { orderBy: { position: "asc" } }, invoice: { select: { id: true, number: true } } } });
  if (!q) notFound();
  const edit = h.can("quotes.edit");
  const link = `${await appUrl()}/q/${q.publicToken}`;
  const to = billTo(q.client);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link href="/platform/quotes" className="text-sm text-slate-500">← Quotes</Link>
          <h1 className="text-2xl font-bold tracking-tight">Quote {q.number} <Pill s={q.status} map={QUOTE_STATUS} /></h1>
          <p className="text-sm text-slate-500">
            For <Link href={`/platform/clients/${q.clientId}`} className="font-semibold text-violet-700">{q.client.name}</Link>
            {q.sentAt && ` · sent ${fmtDateTime(q.sentAt)}`}{q.respondedAt && ` · answered ${fmtDateTime(q.respondedAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {edit && (q.status === "DRAFT" || q.status === "SENT") && <Link href={`/platform/quotes/${q.id}/edit`} className="btn-secondary">Edit</Link>}
          {edit && (q.status === "DRAFT" || q.status === "SENT") && <Op id={q.id} op="send" label={q.status === "DRAFT" ? `Email to ${to.billToEmail ?? "client"}` : "Email again"} primary />}
          {edit && q.status === "DRAFT" && <Op id={q.id} op="mark-sent" label="Mark as sent" />}
          {edit && q.status === "SENT" && <><Op id={q.id} op="accepted" label="Mark accepted" /><Op id={q.id} op="declined" label="Mark declined" /></>}
          {edit && (q.status === "ACCEPTED" || q.status === "DECLINED") && <Op id={q.id} op="reopen" label="Reopen" />}
          {h.can("invoices.edit") && (q.status === "ACCEPTED" || q.status === "SENT") && !q.invoice && (
            <form action={quoteToInvoice}><input type="hidden" name="id" value={q.id} /><button className="btn-primary">Turn into invoice</button></form>
          )}
          {q.invoice && <Link href={`/platform/invoices/${q.invoice.id}`} className="btn-secondary">Invoice {q.invoice.number}</Link>}
          <PrintButton />
          {edit && q.status === "DRAFT" && <Op id={q.id} op="delete" label="Delete draft" confirm />}
        </div>
      </div>
      <ErrorBanner error={error} />
      {q.status !== "DRAFT" && (
        <div className="mb-4 rounded-lg bg-white p-3 text-sm ring-1 ring-slate-200 print:hidden">
          <label className="label">The client&apos;s link (view, print, accept or decline)</label>
          <input className="input font-mono text-xs" readOnly value={link} />
        </div>
      )}
      <HqDocument d={{
        kind: "quote", number: q.number, title: q.title, status: q.status, currency: q.currency, issueDate: q.issueDate, endDate: q.expiryDate,
        subtotalMinor: q.subtotalMinor, discountMinor: q.discountMinor, taxMinor: q.taxMinor, totalMinor: q.totalMinor, notes: q.notes, terms: q.terms,
        billToName: to.billToName, billToAddress: to.billToAddress, billToEmail: to.billToEmail, billToVatNumber: to.billToVatNumber, lines: q.lines,
      }} />
    </div>
  );
}
