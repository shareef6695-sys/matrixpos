import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { appUrl } from "@/lib/server/email";
import { billTo } from "@/lib/server/hq-docs";
import { HqDocument } from "@/components/hq/HqDocument";
import { ErrorBanner, Pill } from "@/components/hq/ui";
import { ActionForm } from "@/components/FormMessage";
import { PrintButton } from "@/components/PrintButton";
import { invoiceAction, recordPayment, deletePayment } from "@/lib/server/actions/hq-sales";
import { createCreditNote } from "@/lib/server/actions/hq-books";
import { accountOptions } from "@/lib/server/hq-forms";
import { formatMoney, minorToInput } from "@/lib/hq/money";
import { formatGBP } from "@/lib/pos/money";
import { INVOICE_STATUS, PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/hq/labels";
import { fmtDate, fmtDateTime, londonDate } from "@/lib/dates";

export const metadata = { title: "Invoice" };

function Op({ id, op, label, primary, danger }: { id: string; op: string; label: string; primary?: boolean; danger?: boolean }) {
  return (
    <form action={invoiceAction}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={op} />
      <button className={primary ? "btn-primary" : danger ? "btn-secondary text-red-700" : "btn-secondary"}>{label}</button>
    </form>
  );
}

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const h = await requireHq("invoices.view");
  const { id } = await params;
  const { error } = await searchParams;
  const inv = await db.hqInvoice.findUnique({ where: { id }, include: { client: { include: { contacts: true } }, lines: { orderBy: { position: "asc" } }, payments: { orderBy: { date: "asc" } }, creditNotes: { orderBy: { date: "asc" } }, quote: { select: { id: true, number: true } } } });
  if (!inv) notFound();
  const edit = h.can("invoices.edit");
  const pay = h.can("payments.edit");
  const left = inv.totalMinor - inv.paidMinor;
  const link = `${await appUrl()}/i/${inv.publicToken}`;
  const banks = pay ? (await accountOptions()).banks.filter((b) => b.currency === "GBP" || b.currency === inv.currency) : [];
  // A draft shows the client's details as they are now; once sent, as they were on the day.
  const to = inv.status === "DRAFT" ? billTo(inv.client) : inv;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link href="/platform/invoices" className="text-sm text-slate-500">← Invoices</Link>
          <h1 className="text-2xl font-bold tracking-tight">Invoice {inv.number} <Pill s={inv.status} map={INVOICE_STATUS} /></h1>
          <p className="text-sm text-slate-500">
            For <Link href={`/platform/clients/${inv.clientId}`} className="font-semibold text-violet-700">{inv.client.name}</Link>
            {inv.quote && <> · from quote <Link href={`/platform/quotes/${inv.quote.id}`} className="font-semibold text-violet-700">{inv.quote.number}</Link></>}
            {inv.sentAt && ` · sent ${fmtDateTime(inv.sentAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {edit && (inv.status === "DRAFT" || inv.status === "SENT") && !inv.payments.length && <Link href={`/platform/invoices/${inv.id}/edit`} className="btn-secondary">Edit</Link>}
          {edit && inv.status !== "VOID" && <Op id={inv.id} op="send" label={inv.status === "DRAFT" ? `Email to ${to.billToEmail ?? "client"}` : inv.status === "PAID" ? "Email receipt" : "Email again"} primary />}
          {edit && inv.status === "DRAFT" && <Op id={inv.id} op="mark-sent" label="Mark as sent" />}
          <PrintButton />
          {edit && inv.status !== "VOID" && inv.status !== "DRAFT" && !inv.payments.length && <Op id={inv.id} op="void" label="Void" danger />}
          {edit && inv.status === "DRAFT" && <Op id={inv.id} op="delete" label="Delete draft" danger />}
        </div>
      </div>
      <ErrorBanner error={error} />
      {inv.status !== "DRAFT" && (
        <div className="mb-4 rounded-lg bg-white p-3 text-sm ring-1 ring-slate-200 print:hidden">
          <label className="label">The client&apos;s link (view, print or save as PDF)</label>
          <input className="input font-mono text-xs" readOnly value={link} />
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <HqDocument d={{
          kind: "invoice", number: inv.number, title: inv.title, status: inv.status, currency: inv.currency, issueDate: inv.issueDate, endDate: inv.dueDate,
          subtotalMinor: inv.subtotalMinor, discountMinor: inv.discountMinor, taxMinor: inv.taxMinor, totalMinor: inv.totalMinor, paidMinor: inv.paidMinor,
          notes: inv.notes, terms: inv.terms, billToName: to.billToName ?? inv.client.name, billToAddress: to.billToAddress, billToEmail: to.billToEmail, billToVatNumber: to.billToVatNumber, lines: inv.lines,
        }} />
        <div className="space-y-4 print:hidden">
          <div className="card text-sm">
            <h2 className="mb-2 font-semibold">Payments</h2>
            {inv.currency !== "GBP" && <p className="mb-2 text-xs text-slate-500">Invoiced at £1 = {Number(inv.perGbp)} {inv.currency}.</p>}
            <ul className="space-y-2">
              {inv.payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-2">
                  <span>{fmtDate(p.date)} · {p.creditNoteId ? "Credit note" : PAYMENT_METHOD_LABEL[p.method as keyof typeof PAYMENT_METHOD_LABEL] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}
                    {inv.currency !== "GBP" && <div className="text-xs text-slate-500">{formatGBP(p.gbpPence)} at {Number(p.perGbp)}</div>}</span>
                  <span className="text-right tabular-nums">{formatMoney(p.amountMinor, inv.currency)}
                    {pay && !p.creditNoteId && <form action={deletePayment}><input type="hidden" name="id" value={p.id} /><button className="text-xs text-red-600">Delete</button></form>}</span>
                </li>
              ))}
              {!inv.payments.length && <li className="text-slate-500">None yet.</li>}
            </ul>
            {inv.status !== "VOID" && <p className="mt-3 border-t border-slate-100 pt-2 font-semibold">Left to pay: {formatMoney(left, inv.currency)}</p>}
          </div>
          {pay && (inv.status === "SENT" || inv.status === "PARTIAL") && (
            <div className="card">
              <h2 className="mb-3 font-semibold">Record a payment</h2>
              <ActionForm action={recordPayment} className="space-y-2" submit="Record payment">
                <input type="hidden" name="invoiceId" value={inv.id} />
                <label className="label">Amount ({inv.currency})</label>
                <input name="amount" className="input" inputMode="decimal" defaultValue={minorToInput(left, inv.currency)} required />
                <label className="label">Date received</label>
                <input name="date" type="date" className="input" defaultValue={londonDate()} required />
                <select name="method" className="input" defaultValue="BANK">{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}</select>
                <label className="label">Paid into</label>
                <select name="bankAccountId" className="input">{banks.map((b) => <option key={b.id} value={b.id}>{b.code} {b.name} ({b.currency})</option>)}</select>
                <input name="reference" className="input" placeholder="Reference (optional)" />
                {inv.currency !== "GBP" && <input name="perGbp" className="input" inputMode="decimal" placeholder={`£1 = ? ${inv.currency} on the day (blank = saved rate)`} />}
              </ActionForm>
            </div>
          )}
          {inv.creditNotes.length > 0 && (
            <div className="card text-sm">
              <h2 className="mb-2 font-semibold">Credit notes</h2>
              <ul className="space-y-1">
                {inv.creditNotes.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <Link href={`/platform/credit-notes/${c.id}`} className="font-mono text-xs font-semibold text-violet-700">{c.number}</Link>
                    <span className="tabular-nums">{c.status === "VOID" ? "Void" : formatMoney(c.totalMinor, inv.currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {edit && (inv.status === "SENT" || inv.status === "PARTIAL") && (
            <details className="card">
              <summary className="cursor-pointer font-semibold">Issue a credit note</summary>
              <p className="my-2 text-xs text-slate-500">Reduces what the client owes on this invoice, for a discount agreed later, a cancelled part of the work or a mistake.</p>
              <ActionForm action={createCreditNote} className="space-y-2" submit="Issue credit note">
                <input type="hidden" name="invoiceId" value={inv.id} />
                <label className="label">Amount to credit ({inv.currency})</label>
                <input name="amount" className="input" inputMode="decimal" defaultValue={minorToInput(left, inv.currency)} required />
                <label className="label">Date</label>
                <input name="date" type="date" className="input" defaultValue={londonDate()} required />
                <input name="reason" className="input" placeholder="Reason (shown on the credit note)" />
              </ActionForm>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
