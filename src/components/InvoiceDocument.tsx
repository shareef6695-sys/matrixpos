import type { SubscriptionInvoice } from "@prisma/client";
import { Logo } from "./Logo";
import { formatGBP } from "@/lib/pos/money";
import { fmtDate } from "@/lib/dates";
import { seller } from "@/lib/legal";

/** A printable A4 invoice. Use the browser's Print → Save as PDF to download it. */
export function InvoiceDocument({ inv }: { inv: SubscriptionInvoice }) {
  const s = seller();
  const paid = inv.status === "PAID";
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-slate-800 shadow-sm ring-1 ring-slate-200 print:max-w-none print:p-0 print:shadow-none print:ring-0">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <Logo className="text-2xl" />
          <div className="mt-3 font-semibold">{s.name}</div>
          {s.address.map((l) => <div key={l}>{l}</div>)}
          {s.email && <div>{s.email}</div>}
          {s.companyNumber && <div>Registered in England and Wales, company no. {s.companyNumber}</div>}
          {s.vatNumber && <div>VAT no. {s.vatNumber}</div>}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-tight">{paid ? "Receipt" : inv.status === "VOID" ? "Invoice (cancelled)" : "Invoice"}</div>
          <div className="mt-1 font-mono">{inv.number}</div>
          <div className="mt-3">Date: {fmtDate(inv.issuedAt)}</div>
          {!paid && inv.dueAt && inv.status === "OPEN" && <div>Due: {fmtDate(inv.dueAt)}</div>}
          {paid && inv.paidAt && <div>Paid: {fmtDate(inv.paidAt)}{inv.method === "CARD" ? " by card" : " by bank transfer"}</div>}
          <div className={`mt-2 inline-block rounded px-2 py-0.5 text-xs font-bold ${paid ? "bg-emerald-100 text-emerald-800" : inv.status === "VOID" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-800"}`}>
            {paid ? "PAID" : inv.status === "VOID" ? "VOID" : "UNPAID"}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</div>
        <div className="mt-1 font-semibold">{inv.billToName}</div>
        {inv.billToAddress && <div>{inv.billToAddress}</div>}
        {inv.billToEmail && <div>{inv.billToEmail}</div>}
        {inv.billToVatNumber && <div>VAT no. {inv.billToVatNumber}</div>}
      </div>

      <table className="mt-8 w-full">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2">Description</th><th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-100">
            <td className="py-3">
              {inv.description}
              {inv.periodStart && inv.periodEnd && <div className="text-xs text-slate-500">{fmtDate(inv.periodStart)} to {fmtDate(inv.periodEnd)}</div>}
            </td>
            <td className="py-3 text-right tabular-nums">{formatGBP(inv.netPence)}</td>
          </tr>
        </tbody>
        <tfoot className="tabular-nums">
          <tr><td className="pt-3 text-right">Subtotal</td><td className="pt-3 text-right">{formatGBP(inv.netPence)}</td></tr>
          {inv.vatPence > 0 && <tr><td className="text-right">VAT at 20%</td><td className="text-right">{formatGBP(inv.vatPence)}</td></tr>}
          <tr className="text-base font-bold"><td className="pt-2 text-right">Total</td><td className="pt-2 text-right">{formatGBP(inv.totalPence)}</td></tr>
        </tfoot>
      </table>

      {!inv.vatPence && <p className="mt-6 text-xs text-slate-500">{s.name} is not registered for VAT, so no VAT has been charged.</p>}
      {inv.status === "OPEN" && inv.method === "BANK" && s.bank.length > 0 && (
        <div className="mt-8 rounded-lg bg-slate-50 p-4 print:border print:border-slate-300">
          <div className="font-semibold">How to pay</div>
          <p className="mt-1">By bank transfer, using <b>{inv.number}</b> as the reference.</p>
          <div className="mt-2">{s.bank.map((l) => <div key={l}>{l}</div>)}</div>
        </div>
      )}
      <p className="mt-10 text-center text-xs text-slate-500">Thank you for using MatrixPOS.</p>
    </div>
  );
}
