import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { PageHeader, Stat } from "@/components/admin";
import { Pill, Tabs } from "@/components/hq/ui";
import { formatMoney, toGbpPence } from "@/lib/hq/money";
import { formatGBP } from "@/lib/pos/money";
import { BILL_STATUS } from "@/lib/hq/labels";
import { fmtDate } from "@/lib/dates";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Bills and expenses" };

const TABS: [string, string][] = [["all", "All"], ["unpaid", "Unpaid bills"], ["expenses", "Expenses"], ["PAID", "Paid"], ["VOID", "Void"]];
const DAY = 86_400_000;

export default async function Bills({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const h = await requireHq("accounts.view");
  const { f = "all" } = await searchParams;
  const where: Prisma.HqBillWhereInput =
    f === "unpaid" ? { status: { in: ["OPEN", "PARTIAL"] } } : f === "expenses" ? { isExpense: true, status: { not: "VOID" } }
    : f === "PAID" || f === "VOID" ? { status: f } : {};
  const [bills, open] = await Promise.all([
    db.hqBill.findMany({ where, orderBy: { date: "desc" }, take: 500 }),
    db.hqBill.findMany({ where: { status: { in: ["OPEN", "PARTIAL"] } }, select: { totalMinor: true, paidMinor: true, currency: true, perGbp: true, dueDate: true } }),
  ]);
  const now = Date.now();
  const owed = open.reduce((n, b) => n + toGbpPence(b.totalMinor - b.paidMinor, b.currency, Number(b.perGbp)), 0);
  const late = open.filter((b) => b.dueDate.getTime() + DAY < now).reduce((n, b) => n + toGbpPence(b.totalMinor - b.paidMinor, b.currency, Number(b.perGbp)), 0);
  return (
    <div>
      <PageHeader title="Bills and expenses" sub="A bill is something you'll pay later. An expense is something already paid (a card payment or a receipt)."
        actions={h.can("accounts.edit") ? <><Link href="/platform/bills/new?expense=1" className="btn-primary">Add expense</Link><Link href="/platform/bills/new" className="btn-secondary">Add bill</Link><Link href="/platform/suppliers" className="btn-secondary">Suppliers</Link></> : null} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2"><Stat label="You owe suppliers" value={formatGBP(owed)} /><Stat label="Overdue" value={formatGBP(late)} /></div>
      <Tabs base="/platform/bills" current={TABS.some(([k]) => k === f) ? f : "all"} tabs={TABS} />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Date</th><th>Paid to</th><th>Reference</th><th>Due</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Left to pay</th></tr></thead>
          <tbody>
            {bills.map((b) => (
              <tr key={b.id}>
                <td>{fmtDate(b.date)}</td>
                <td><Link href={`/platform/bills/${b.id}`} className="font-semibold text-violet-700">{b.payee}</Link>{b.isExpense && <span className="badge ml-1 bg-slate-100 text-slate-600">Expense</span>}</td>
                <td className="text-xs">{b.reference}</td>
                <td className={(b.status === "OPEN" || b.status === "PARTIAL") && b.dueDate.getTime() + DAY < now ? "font-semibold text-red-700" : ""}>{b.isExpense ? "" : fmtDate(b.dueDate)}</td>
                <td><Pill s={b.status} map={BILL_STATUS} /></td>
                <td className="text-right tabular-nums">{formatMoney(b.totalMinor, b.currency)}</td>
                <td className="text-right tabular-nums">{b.status === "OPEN" || b.status === "PARTIAL" ? formatMoney(b.totalMinor - b.paidMinor, b.currency) : ""}</td>
              </tr>
            ))}
            {!bills.length && <tr><td colSpan={7} className="text-center text-slate-500">Nothing here yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
