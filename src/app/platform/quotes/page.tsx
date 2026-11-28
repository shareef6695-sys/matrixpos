import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { PageHeader } from "@/components/admin";
import { Pill, Tabs } from "@/components/hq/ui";
import { formatMoney } from "@/lib/hq/money";
import { QUOTE_STATUS } from "@/lib/hq/labels";
import { fmtDate } from "@/lib/dates";
import type { HqQuoteStatus } from "@prisma/client";

export const metadata = { title: "Quotes" };

const TABS: [string, string][] = [["all", "All"], ["DRAFT", "Drafts"], ["SENT", "Waiting"], ["ACCEPTED", "Accepted"], ["DECLINED", "Declined"], ["INVOICED", "Invoiced"]];

export default async function Quotes({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const h = await requireHq("quotes.view");
  const { f = "all" } = await searchParams;
  const status = TABS.some(([k]) => k === f) && f !== "all" ? (f as HqQuoteStatus) : undefined;
  const quotes = await db.hqQuote.findMany({ where: status ? { status } : {}, include: { client: { select: { name: true } } }, orderBy: { issueDate: "desc" }, take: 500 });
  return (
    <div>
      <PageHeader title="Quotes" sub="Send a quote with a link the client can accept online, then turn it into an invoice in one click." actions={h.can("quotes.edit") ? <Link href="/platform/quotes/new" className="btn-primary">New quote</Link> : null} />
      <Tabs base="/platform/quotes" current={status ?? "all"} tabs={TABS} />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Number</th><th>Client</th><th>Title</th><th>Date</th><th>Valid until</th><th>Status</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id}><td><Link href={`/platform/quotes/${q.id}`} className="font-mono text-xs font-semibold text-violet-700">{q.number}</Link></td><td>{q.client.name}</td><td>{q.title}</td><td>{fmtDate(q.issueDate)}</td><td>{q.expiryDate ? fmtDate(q.expiryDate) : ""}</td><td><Pill s={q.status} map={QUOTE_STATUS} /></td><td className="text-right tabular-nums">{formatMoney(q.totalMinor, q.currency)}</td></tr>
            ))}
            {!quotes.length && <tr><td colSpan={7} className="text-center text-slate-500">No quotes here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
