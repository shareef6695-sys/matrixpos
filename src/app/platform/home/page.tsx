import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireHq, latestRates } from "@/lib/server/hq";
import { PageHeader, Stat } from "@/components/admin";
import { formatMoney, toGbpPence } from "@/lib/hq/money";
import { formatGBP } from "@/lib/pos/money";
import { LEAD_STAGES, LEAD_STAGE_LABEL, INVOICE_STATUS } from "@/lib/hq/labels";
import { fmtDate, londonDate, londonDayStart } from "@/lib/dates";
import { Pill } from "@/components/hq/ui";
import { fmtMinutes, renewalState } from "@/lib/hq/projects";

export const dynamic = "force-dynamic";

export default async function HqHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const h = await requireHq();
  const { denied } = await searchParams;
  if (!h.can("dashboard.view")) {
    return (
      <div>
        <PageHeader title={`Welcome, ${h.name}`} sub="Use the menu for the parts of Matrix HQ you have access to." />
        {h.can("time.log") && <p className="mb-4 text-sm"><Link href="/platform/time" className="btn-primary">My time and tasks</Link></p>}
        {denied && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Your role doesn&apos;t include that page. Ask the owner if you need it.</p>}
      </div>
    );
  }
  const today = londonDate();
  const monthStart = londonDayStart(`${today.slice(0, 7)}-01`);
  const yearAgo = londonDayStart(`${Number(today.slice(0, 4)) - 1}-${today.slice(5, 7)}-01`);
  const [open, payments, leads, quotes, recent, rates, work] = await Promise.all([
    db.hqInvoice.findMany({ where: { status: { in: ["SENT", "PARTIAL"] } }, include: { client: { select: { name: true } } }, orderBy: { dueDate: "asc" } }),
    db.hqPayment.findMany({ where: { date: { gte: yearAgo } }, select: { date: true, gbpPence: true } }),
    db.hqLead.findMany({ where: { stage: { notIn: ["WON", "LOST"] } }, select: { stage: true, valueMinor: true, currency: true } }),
    db.hqQuote.count({ where: { status: "SENT" } }),
    db.hqInvoice.findMany({ where: { status: { not: "DRAFT" } }, include: { client: { select: { name: true } } }, orderBy: { issueDate: "desc" }, take: 8 }),
    latestRates(),
    Promise.all([
      db.hqProject.count({ where: { status: "ACTIVE" } }),
      db.hqTimeEntry.aggregate({ where: { billable: true, invoiceId: null }, _sum: { minutes: true } }),
      db.hqContract.findMany({ where: { status: "ACTIVE", endDate: { not: null } }, select: { endDate: true, noticeDays: true, status: true } }),
    ]),
  ]);
  const renewalsDue = work[2].filter((c) => ["due", "overdue"].includes(renewalState({ status: c.status, endDate: londonDate(c.endDate!), noticeDays: c.noticeDays }, today))).length;
  const now = Date.now();
  const owed = (i: (typeof open)[number]) => toGbpPence(i.totalMinor - i.paidMinor, i.currency, Number(i.perGbp));
  const outstanding = open.reduce((n, i) => n + owed(i), 0);
  const overdue = open.filter((i) => i.dueDate.getTime() + 86_400_000 < now);
  const thisMonth = payments.filter((p) => p.date >= monthStart).reduce((n, p) => n + p.gbpPence, 0);
  const last12 = payments.reduce((n, p) => n + p.gbpPence, 0);

  // Money received per month, last 12 months
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 12 + i, 1));
    const key = d.toISOString().slice(0, 7);
    return { key, label: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }), n: payments.filter((p) => londonDate(p.date).slice(0, 7) === key).reduce((a, p) => a + p.gbpPence, 0) };
  });
  const maxMonth = Math.max(1, ...months.map((m) => m.n));
  const missingRate = new Set<string>();
  const pipeline = LEAD_STAGES.filter((s) => s !== "WON" && s !== "LOST").map((s) => {
    const rows = leads.filter((l) => l.stage === s);
    const value = rows.reduce((n, l) => {
      if (!rates[l.currency]) { missingRate.add(l.currency); return n; }
      return n + toGbpPence(l.valueMinor, l.currency, rates[l.currency]);
    }, 0);
    return { s, n: rows.length, value };
  });

  return (
    <div>
      <PageHeader title="Matrix Infotech" sub="Your business at a glance. Amounts in other currencies are shown in GBP at the rate on each invoice or payment." />
      {denied && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Your role doesn&apos;t include that page. Ask the owner if you need it.</p>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Owed to you" value={formatGBP(outstanding)} sub={`${open.length} unpaid invoice${open.length === 1 ? "" : "s"}`} />
        <Stat label="Overdue" value={formatGBP(overdue.reduce((n, i) => n + owed(i), 0))} sub={`${overdue.length} invoice${overdue.length === 1 ? "" : "s"}`} />
        <Stat label="Received this month" value={formatGBP(thisMonth)} sub={`${formatGBP(last12)} in the last 12 months`} />
        <Stat label="Quotes waiting" value={String(quotes)} sub="Sent, no answer yet" />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Link href="/platform/projects" className="block"><Stat label="Active projects" value={String(work[0])} /></Link>
        <Link href="/platform/projects" className="block"><Stat label="Unbilled hours" value={fmtMinutes(work[1]._sum.minutes ?? 0)} sub="Billable time not yet invoiced" /></Link>
        <Link href="/platform/contracts" className="block"><Stat label="Renewals due" value={String(renewalsDue)} sub="Contracts to renew now" /></Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Money received</h2>
          <div className="flex h-36 items-end gap-1">
            {months.map((m) => (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1" title={`${m.label}: ${formatGBP(m.n)}`}>
                <div className="w-full rounded-t bg-violet-500" style={{ height: `${(m.n / maxMonth) * 100}%`, minHeight: m.n ? 2 : 0 }} />
                <div className="text-[10px] text-slate-500">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Open leads</h2>{h.can("leads.view") && <Link href="/platform/leads" className="text-sm font-semibold text-violet-700">Pipeline</Link>}</div>
          <table className="table">
            <tbody>{pipeline.map((p) => <tr key={p.s}><td>{LEAD_STAGE_LABEL[p.s]}</td><td className="text-right">{p.n}</td><td className="text-right tabular-nums">{formatGBP(p.value)}</td></tr>)}</tbody>
          </table>
          {missingRate.size > 0 && <p className="mt-2 text-xs text-amber-700">Leads in {[...missingRate].join(", ")} are left out of the values until you add an exchange rate.</p>}
        </div>
        <div className="card lg:col-span-2 overflow-x-auto p-0">
          <div className="flex items-center justify-between p-4"><h2 className="font-semibold">Overdue invoices</h2><Link href="/platform/invoices?f=overdue" className="text-sm font-semibold text-violet-700">All overdue</Link></div>
          <table className="table">
            <thead><tr><th>Invoice</th><th>Client</th><th>Due</th><th className="text-right">Left to pay</th></tr></thead>
            <tbody>
              {overdue.slice(0, 8).map((i) => (
                <tr key={i.id}><td><Link className="font-mono text-xs font-semibold text-violet-700" href={`/platform/invoices/${i.id}`}>{i.number}</Link></td><td>{i.client.name}</td><td className="text-red-700">{fmtDate(i.dueDate)}</td><td className="text-right tabular-nums">{formatMoney(i.totalMinor - i.paidMinor, i.currency)}</td></tr>
              ))}
              {!overdue.length && <tr><td colSpan={4} className="text-center text-slate-500">Nothing overdue.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card lg:col-span-2 overflow-x-auto p-0">
          <h2 className="p-4 font-semibold">Latest invoices</h2>
          <table className="table">
            <thead><tr><th>Invoice</th><th>Client</th><th>Date</th><th>Status</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {recent.map((i) => (
                <tr key={i.id}><td><Link className="font-mono text-xs font-semibold text-violet-700" href={`/platform/invoices/${i.id}`}>{i.number}</Link></td><td>{i.client.name}</td><td>{fmtDate(i.issueDate)}</td><td><Pill s={i.status} map={INVOICE_STATUS} /></td><td className="text-right tabular-nums">{formatMoney(i.totalMinor, i.currency)}</td></tr>
              ))}
              {!recent.length && <tr><td colSpan={5} className="text-center text-slate-500">No invoices yet. <Link href="/platform/invoices/new" className="font-semibold text-violet-700">Create your first</Link>.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
