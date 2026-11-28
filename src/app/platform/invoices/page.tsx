import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { PageHeader, Stat } from "@/components/admin";
import { Pill, Tabs } from "@/components/hq/ui";
import { formatMoney, toGbpPence } from "@/lib/hq/money";
import { formatGBP } from "@/lib/pos/money";
import { INVOICE_STATUS } from "@/lib/hq/labels";
import { fmtDate } from "@/lib/dates";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Invoices" };

const TABS: [string, string][] = [["all", "All"], ["DRAFT", "Drafts"], ["unpaid", "Unpaid"], ["overdue", "Overdue"], ["PAID", "Paid"], ["VOID", "Void"]];
const DAY = 86_400_000;

export default async function Invoices({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const h = await requireHq("invoices.view");
  const { f = "all" } = await searchParams;
  const now = new Date();
  const where: Prisma.HqInvoiceWhereInput =
    f === "unpaid" ? { status: { in: ["SENT", "PARTIAL"] } }
    : f === "overdue" ? { status: { in: ["SENT", "PARTIAL"] }, dueDate: { lt: new Date(now.getTime() - DAY) } }
    : f === "DRAFT" || f === "PAID" || f === "VOID" ? { status: f } : {};
  const [invoices, open] = await Promise.all([
    db.hqInvoice.findMany({ where, include: { client: { select: { name: true } } }, orderBy: { issueDate: "desc" }, take: 500 }),
    db.hqInvoice.findMany({ where: { status: { in: ["SENT", "PARTIAL"] } }, select: { totalMinor: true, paidMinor: true, currency: true, perGbp: true, dueDate: true } }),
  ]);
  // Aged debts, in GBP at each invoice's own rate.
  const buckets = [["Not due yet", -Infinity, 0], ["1 to 30 days late", 1, 30], ["31 to 60 days late", 31, 60], ["Over 60 days late", 61, Infinity]] as const;
  const aged = buckets.map(([label, lo, hi]) => ({
    label,
    n: open.filter((i) => { const late = Math.floor((now.getTime() - i.dueDate.getTime()) / DAY); return late >= lo && late <= hi; })
      .reduce((s, i) => s + toGbpPence(i.totalMinor - i.paidMinor, i.currency, Number(i.perGbp)), 0),
  }));
  return (
    <div>
      <PageHeader title="Invoices" sub="Invoice numbers follow your MPI format and are shared with the MatrixPOS subscription invoices." actions={h.can("invoices.edit") ? <Link href="/platform/invoices/new" className="btn-primary">New invoice</Link> : null} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{aged.map((a) => <Stat key={a.label} label={a.label} value={formatGBP(a.n)} />)}</div>
      <Tabs base="/platform/invoices" current={TABS.some(([k]) => k === f) ? f : "all"} tabs={TABS} />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Number</th><th>Client</th><th>Date</th><th>Due</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Left to pay</th></tr></thead>
          <tbody>
            {invoices.map((i) => {
              const late = (i.status === "SENT" || i.status === "PARTIAL") && i.dueDate.getTime() + DAY < now.getTime();
              return (
                <tr key={i.id}>
                  <td><Link href={`/platform/invoices/${i.id}`} className="font-mono text-xs font-semibold text-violet-700">{i.number}</Link></td>
                  <td>{i.client.name}</td><td>{fmtDate(i.issueDate)}</td><td className={late ? "font-semibold text-red-700" : ""}>{fmtDate(i.dueDate)}</td>
                  <td><Pill s={i.status} map={INVOICE_STATUS} /></td>
                  <td className="text-right tabular-nums">{formatMoney(i.totalMinor, i.currency)}</td>
                  <td className="text-right tabular-nums">{i.status === "VOID" || i.status === "DRAFT" ? "" : formatMoney(i.totalMinor - i.paidMinor, i.currency)}</td>
                </tr>
              );
            })}
            {!invoices.length && <tr><td colSpan={7} className="text-center text-slate-500">No invoices here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
