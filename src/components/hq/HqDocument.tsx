import { fmtDate } from "@/lib/dates";
import { seller } from "@/lib/legal";
import { formatMoney } from "@/lib/hq/money";

export interface DocLine { id: string; description: string; quantity: unknown; unitMinor: number; discountPct: unknown; taxPct: unknown; amountMinor: number }
export interface DocData {
  kind: "quote" | "invoice" | "credit";
  /** A credit note: the invoice it is against. */
  against?: string;
  number: string; title: string | null; status: string; currency: string;
  issueDate: Date; endDate: Date | null;
  subtotalMinor: number; discountMinor: number; taxMinor: number; totalMinor: number; paidMinor?: number;
  notes: string | null; terms: string | null;
  billToName: string; billToAddress: string | null; billToEmail: string | null; billToVatNumber: string | null;
  lines: DocLine[];
}

const qty = (q: unknown) => Number(q).toLocaleString("en-GB", { maximumFractionDigits: 3 });

/** A printable A4 quote or invoice. Print → Save as PDF downloads it. */
export function HqDocument({ d }: { d: DocData }) {
  const s = seller();
  const paid = d.kind === "invoice" && d.status === "PAID";
  const due = d.totalMinor - (d.paidMinor ?? 0);
  const anyDiscount = d.lines.some((l) => Number(l.discountPct) > 0);
  const anyTax = d.lines.some((l) => Number(l.taxPct) > 0);
  const heading = d.kind === "credit" ? (d.status === "VOID" ? "Credit note (cancelled)" : "Credit note") : d.kind === "quote" ? "Quote" : paid ? "Receipt" : d.status === "VOID" ? "Invoice (cancelled)" : "Invoice";
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-slate-800 shadow-sm ring-1 ring-slate-200 print:max-w-none print:p-0 print:shadow-none print:ring-0">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="text-2xl font-bold tracking-tight text-violet-800">{s.name}</div>
          {s.address.map((l) => <div key={l}>{l}</div>)}
          {s.email && <div>{s.email}</div>}
          {s.companyNumber && <div>Registered in England and Wales, company no. {s.companyNumber}</div>}
          {s.vatNumber && <div>VAT no. {s.vatNumber}</div>}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-tight">{heading}</div>
          <div className="mt-1 font-mono">{d.number}</div>
          <div className="mt-3">Date: {fmtDate(d.issueDate)}</div>
          {d.against && <div>Against invoice: <span className="font-mono">{d.against}</span></div>}
          {d.endDate && <div>{d.kind === "quote" ? "Valid until" : "Due"}: {fmtDate(d.endDate)}</div>}
        </div>
      </div>

      <div className="mt-8">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{d.kind === "quote" ? "Prepared for" : d.kind === "credit" ? "Credited to" : "Bill to"}</div>
        <div className="mt-1 font-semibold">{d.billToName}</div>
        {d.billToAddress && <div>{d.billToAddress}</div>}
        {d.billToEmail && <div>{d.billToEmail}</div>}
        {d.billToVatNumber && <div>VAT no. {d.billToVatNumber}</div>}
      </div>
      {d.title && <div className="mt-6 text-base font-semibold">{d.title}</div>}

      <table className="mt-6 w-full">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2">Description</th><th className="py-2 pl-4 text-right">Qty</th><th className="py-2 pl-4 text-right">Price</th>
            {anyDiscount && <th className="py-2 pl-4 text-right">Discount</th>}
            {anyTax && <th className="py-2 pl-4 text-right">VAT</th>}
            <th className="py-2 pl-4 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l) => (
            <tr key={l.id} className="border-b border-slate-100 align-top">
              <td className="whitespace-pre-line py-3 pr-3">{l.description}</td>
              <td className="whitespace-nowrap py-3 pl-4 text-right tabular-nums">{qty(l.quantity)}</td>
              <td className="whitespace-nowrap py-3 pl-4 text-right tabular-nums">{formatMoney(l.unitMinor, d.currency)}</td>
              {anyDiscount && <td className="whitespace-nowrap py-3 pl-4 text-right tabular-nums">{Number(l.discountPct) ? `${Number(l.discountPct)}%` : ""}</td>}
              {anyTax && <td className="whitespace-nowrap py-3 pl-4 text-right tabular-nums">{Number(l.taxPct)}%</td>}
              <td className="whitespace-nowrap py-3 pl-4 text-right tabular-nums">{formatMoney(l.amountMinor, d.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="ml-auto mt-3 tabular-nums">
        <tbody>
          {d.discountMinor > 0 && <>
            <tr><td className="pr-6 text-right">Subtotal</td><td className="text-right">{formatMoney(d.subtotalMinor, d.currency)}</td></tr>
            <tr><td className="pr-6 text-right">Discount</td><td className="text-right">-{formatMoney(d.discountMinor, d.currency)}</td></tr>
          </>}
          {d.taxMinor > 0 && <tr><td className="pr-6 text-right">VAT</td><td className="text-right">{formatMoney(d.taxMinor, d.currency)}</td></tr>}
          <tr className="text-base font-bold"><td className="pr-6 pt-2 text-right">{d.kind === "credit" ? "Total credited" : "Total"} ({d.currency})</td><td className="pt-2 text-right">{formatMoney(d.totalMinor, d.currency)}</td></tr>
          {d.kind === "invoice" && (d.paidMinor ?? 0) > 0 && <>
            <tr><td className="pr-6 text-right">Paid</td><td className="text-right">-{formatMoney(d.paidMinor!, d.currency)}</td></tr>
            <tr className="font-bold"><td className="pr-6 text-right">Left to pay</td><td className="text-right">{formatMoney(due, d.currency)}</td></tr>
          </>}
        </tbody>
      </table>

      {!d.taxMinor && !s.chargeVat && <p className="mt-6 text-xs text-slate-500">{s.name} is not registered for VAT, so no VAT is charged.</p>}
      {d.notes && <div className="mt-6 whitespace-pre-line">{d.notes}</div>}
      {d.kind === "invoice" && due > 0 && d.status !== "VOID" && s.bank.length > 0 && (
        <div className="mt-8 rounded-lg bg-slate-50 p-4 print:border print:border-slate-300">
          <div className="font-semibold">How to pay</div>
          <p className="mt-1">By bank transfer, using <b>{d.number}</b> as the reference.</p>
          <div className="mt-2">{s.bank.map((l) => <div key={l}>{l}</div>)}</div>
        </div>
      )}
      {d.terms && <div className="mt-6 whitespace-pre-line text-xs text-slate-600"><div className="font-semibold">Terms</div>{d.terms}</div>}
    </div>
  );
}

