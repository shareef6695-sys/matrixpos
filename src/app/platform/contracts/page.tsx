import Link from "next/link";
import { db } from "@/lib/server/db";
import { autoRenew } from "@/lib/server/hq-contracts";
import { requireHq } from "@/lib/server/hq";
import { PageHeader, Stat } from "@/components/admin";
import { Pill, Tabs } from "@/components/hq/ui";
import { formatMoney, toGbpPence } from "@/lib/hq/money";
import { formatGBP } from "@/lib/pos/money";
import { daysLeft, renewalState } from "@/lib/hq/projects";
import { CONTRACT_KIND_LABEL, CONTRACT_STATUS, RENEWAL } from "@/lib/hq/labels";
import { latestRates } from "@/lib/server/hq";
import { fmtDate, londonDate } from "@/lib/dates";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Contracts" };

const TABS: [string, string][] = [["all", "Renewals"], ["ACTIVE", "Active"], ["DRAFT", "Drafts"], ["ended", "Ended"], ["every", "Everything"]];

export default async function Contracts({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const h = await requireHq("contracts.view");
  const { f = "all" } = await searchParams;
  const today = londonDate();
  await autoRenew();
  const where: Prisma.HqContractWhereInput =
    f === "ACTIVE" || f === "DRAFT" ? { status: f } : f === "ended" ? { status: { in: ["ENDED", "CANCELLED"] } } : f === "every" ? {} : { status: "ACTIVE", endDate: { not: null } };
  const [list, active, rates] = await Promise.all([
    db.hqContract.findMany({ where, include: { client: { select: { name: true } } }, orderBy: [{ endDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 500 }),
    db.hqContract.findMany({ where: { status: "ACTIVE" }, select: { valueMinor: true, costMinor: true, currency: true, renewMonths: true, endDate: true, noticeDays: true, status: true } }),
    latestRates(),
  ]);
  const state = (c: { status: string; endDate: Date | null; noticeDays: number }) => renewalState({ status: c.status, endDate: c.endDate ? londonDate(c.endDate) : null, noticeDays: c.noticeDays }, today);
  const shown = f === "all" ? list.filter((c) => state(c) !== "none") : list;
  // Yearly value of active contracts, in GBP at the latest rates.
  const yearly = active.reduce((n, c) => n + (rates[c.currency] ? toGbpPence(Math.round((c.valueMinor * 12) / c.renewMonths), c.currency, rates[c.currency]) : 0), 0);
  const due = active.filter((c) => { const s = state(c); return s === "due" || s === "overdue"; }).length;
  return (
    <div>
      <PageHeader title="Contracts and renewals" sub="Support and care plans, hosting and the third-party licences you resell. You get an email when one is coming up for renewal."
        actions={h.can("contracts.edit") ? <Link href="/platform/contracts/new" className="btn-primary">New contract</Link> : null} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Active contracts" value={String(active.length)} />
        <Stat label="Worth per year" value={formatGBP(yearly)} sub="At the latest exchange rates" />
        <Stat label="Need renewing" value={String(due)} sub="Inside their reminder period, or ended" />
      </div>
      <Tabs base="/platform/contracts" current={TABS.some(([k]) => k === f) ? f : "all"} tabs={TABS} />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Contract</th><th>Client</th><th>Type</th><th>Status</th><th>Ends</th><th className="text-right">Per term</th></tr></thead>
          <tbody>
            {shown.map((c) => {
              const s = state(c);
              return (
                <tr key={c.id}>
                  <td><Link href={`/platform/contracts/${c.id}`} className="font-semibold text-violet-700">{c.title}</Link>{c.vendor && <div className="text-xs text-slate-500">{c.vendor}</div>}</td>
                  <td>{c.client.name}</td>
                  <td className="text-sm">{CONTRACT_KIND_LABEL[c.kind]}</td>
                  <td><Pill s={c.status} map={CONTRACT_STATUS} />{s !== "none" && <> <Pill s={s} map={RENEWAL} /></>}</td>
                  <td className="whitespace-nowrap text-sm">{c.endDate ? <>{fmtDate(c.endDate)}{c.status === "ACTIVE" && <div className="text-xs text-slate-500">{(() => { const d = daysLeft(londonDate(c.endDate), today); return d < 0 ? `${-d} days ago` : d === 0 ? "today" : `in ${d} days`; })()}{c.autoRenew ? " · renews itself" : ""}</div>}</> : "Rolling"}</td>
                  <td className="text-right tabular-nums">{c.valueMinor ? formatMoney(c.valueMinor, c.currency) : ""}<div className="text-xs text-slate-500">{c.renewMonths} months</div></td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={6} className="text-center text-slate-500">{f === "all" ? "Nothing to renew in the next 90 days." : "None here."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
