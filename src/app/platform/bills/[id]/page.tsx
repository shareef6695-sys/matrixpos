import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { accountOptions } from "@/lib/server/hq-forms";
import { ErrorBanner, Pill } from "@/components/hq/ui";
import { ActionForm } from "@/components/FormMessage";
import { deleteBillPayment, payBill, voidBill } from "@/lib/server/actions/hq-books";
import { formatMoney, minorToInput } from "@/lib/hq/money";
import { formatGBP } from "@/lib/pos/money";
import { BILL_STATUS } from "@/lib/hq/labels";
import { fmtDate, londonDate } from "@/lib/dates";

export const metadata = { title: "Bill" };

export default async function BillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const h = await requireHq("accounts.view");
  const edit = h.can("accounts.edit");
  const { id } = await params;
  const { error } = await searchParams;
  const b = await db.hqBill.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, payments: { orderBy: { date: "asc" } }, supplier: true } });
  if (!b) notFound();
  const opts = await accountOptions();
  const name = new Map(opts.all.map((a) => [a.id, `${a.code} ${a.name}`]));
  const banks = opts.banks.filter((x) => x.currency === "GBP" || x.currency === b.currency);
  const left = b.totalMinor - b.paidMinor;
  const canEdit = edit && b.status !== "VOID" && (b.isExpense || !b.payments.length);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/platform/bills" className="text-sm text-slate-500">← Bills and expenses</Link>
          <h1 className="text-2xl font-bold tracking-tight">{b.isExpense ? "Expense" : "Bill"}: {b.payee} <Pill s={b.status} map={BILL_STATUS} /></h1>
          <p className="text-sm text-slate-500">
            {fmtDate(b.date)}{!b.isExpense && ` · due ${fmtDate(b.dueDate)}`}{b.reference && ` · ${b.reference}`}
            {b.supplier && <> · <Link href={`/platform/suppliers#${b.supplier.id}`} className="text-violet-700">{b.supplier.name}</Link></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Link href={`/platform/bills/${b.id}/edit`} className="btn-secondary">Edit</Link>}
          {canEdit && <form action={voidBill}><input type="hidden" name="id" value={b.id} /><button className="btn-secondary text-red-700">Void</button></form>}
        </div>
      </div>
      <ErrorBanner error={error} />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Description</th><th>Account</th><th className="text-right">Amount</th>{b.taxMinor > 0 && <th className="text-right">VAT</th>}</tr></thead>
            <tbody>
              {b.lines.map((l) => <tr key={l.id}><td>{l.description}</td><td className="text-sm">{name.get(l.accountId) ?? "?"}</td><td className="text-right tabular-nums">{formatMoney(l.netMinor, b.currency)}</td>{b.taxMinor > 0 && <td className="text-right tabular-nums">{formatMoney(l.taxMinor, b.currency)}</td>}</tr>)}
              <tr className="font-bold"><td colSpan={2} className="text-right">Total</td><td className="text-right tabular-nums" colSpan={b.taxMinor > 0 ? 2 : 1}>{formatMoney(b.totalMinor, b.currency)}</td></tr>
            </tbody>
          </table>
          {b.currency !== "GBP" && <p className="px-4 pb-3 text-xs text-slate-500">At £1 = {Number(b.perGbp)} {b.currency}.</p>}
          {b.notes && <p className="whitespace-pre-line px-4 pb-4 text-sm text-slate-600">{b.notes}</p>}
        </div>
        <div className="space-y-4">
          <div className="card text-sm">
            <h2 className="mb-2 font-semibold">Payments</h2>
            <ul className="space-y-2">
              {b.payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-2">
                  <span>{fmtDate(p.date)} · {name.get(p.bankAccountId) ?? "Bank"}{p.reference ? ` · ${p.reference}` : ""}{b.currency !== "GBP" && <div className="text-xs text-slate-500">{formatGBP(p.gbpPence)}</div>}</span>
                  <span className="text-right tabular-nums">{formatMoney(p.amountMinor, b.currency)}
                    {edit && !b.isExpense && <form action={deleteBillPayment}><input type="hidden" name="id" value={p.id} /><button className="text-xs text-red-600">Delete</button></form>}</span>
                </li>
              ))}
              {!b.payments.length && <li className="text-slate-500">None yet.</li>}
            </ul>
            {b.status !== "VOID" && <p className="mt-3 border-t border-slate-100 pt-2 font-semibold">Left to pay: {formatMoney(left, b.currency)}</p>}
          </div>
          {edit && (b.status === "OPEN" || b.status === "PARTIAL") && (
            <div className="card">
              <h2 className="mb-3 font-semibold">Record a payment</h2>
              <ActionForm action={payBill} className="space-y-2" submit="Record payment">
                <input type="hidden" name="billId" value={b.id} />
                <label className="label">Amount ({b.currency})</label>
                <input name="amount" className="input" inputMode="decimal" defaultValue={minorToInput(left, b.currency)} required />
                <label className="label">Date paid</label>
                <input name="date" type="date" className="input" defaultValue={londonDate()} required />
                <label className="label">Paid from</label>
                <select name="bankAccountId" className="input">{banks.map((x) => <option key={x.id} value={x.id}>{x.code} {x.name} ({x.currency})</option>)}</select>
                <input name="reference" className="input" placeholder="Reference (optional)" />
                {b.currency !== "GBP" && <input name="perGbp" className="input" inputMode="decimal" placeholder={`£1 = ? ${b.currency} on the day (blank = saved rate)`} />}
              </ActionForm>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
