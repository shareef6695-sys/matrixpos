import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { accountOptions } from "@/lib/server/hq-forms";
import { PageHeader } from "@/components/admin";
import { BooksNav } from "@/components/hq/BooksNav";
import { ErrorBanner } from "@/components/hq/ui";
import { JournalForm } from "@/components/hq/BooksForms";
import { deleteJournal, saveJournal } from "@/lib/server/actions/hq-books";
import { formatGBP } from "@/lib/pos/money";
import { fmtDate, londonDate } from "@/lib/dates";
import { SOURCE_LABEL, sourceLink } from "@/lib/hq/labels";

export const metadata = { title: "Journals" };

export default async function Journals({ searchParams }: { searchParams: Promise<{ error?: string; manual?: string }> }) {
  const h = await requireHq("accounts.view");
  const { error, manual } = await searchParams;
  const [opts, journals] = await Promise.all([
    accountOptions(),
    db.hqJournal.findMany({ where: manual ? { source: "MANUAL" } : {}, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200, include: { lines: { include: { account: { select: { code: true, name: true } } } } } }),
  ]);
  return (
    <div>
      <PageHeader title="Journals" sub="Every entry in the books. Use a journal for opening balances, the director's loan, depreciation and year-end adjustments." />
      <BooksNav current="/platform/accounts/journals" />
      <ErrorBanner error={error} />
      {h.can("accounts.edit") && (
        <details className="card mb-6" open={!journals.length}>
          <summary className="cursor-pointer font-semibold">New journal</summary>
          <p className="my-3 text-xs text-slate-500">For opening balances: debit each bank account and anything you own, credit anything you owe, and put the difference to 3100 Retained profit.</p>
          <JournalForm action={saveJournal} accounts={opts.all} today={londonDate()} />
        </details>
      )}
      <div className="mb-3 flex gap-2 text-sm">
        <Link href="/platform/accounts/journals" className={!manual ? "font-semibold text-violet-700" : "text-slate-500"}>All entries</Link>·
        <Link href="/platform/accounts/journals?manual=1" className={manual ? "font-semibold text-violet-700" : "text-slate-500"}>Entered by hand</Link>
      </div>
      <div className="space-y-2">
        {journals.map((j) => (
          <div key={j.id} className="card py-3 text-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span><b>{fmtDate(j.date)}</b> · <span className="badge bg-slate-100 text-slate-700">{SOURCE_LABEL[j.source] ?? j.source}</span> {j.memo}{j.reference ? <span className="font-mono text-xs text-slate-500"> {j.reference}</span> : null}</span>
              {j.source === "MANUAL" && h.can("accounts.edit") && <form action={deleteJournal}><input type="hidden" name="id" value={j.id} /><button className="text-xs text-red-600">Delete</button></form>}
              {j.source !== "MANUAL" && sourceLink(j.source, j.sourceId) && <Link href={sourceLink(j.source, j.sourceId)!} className="text-xs text-violet-700">Open</Link>}
            </div>
            <table className="w-full text-xs tabular-nums">
              <tbody>
                {j.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="py-0.5"><Link href={`/platform/accounts/ledger/${l.accountId}`} className="text-slate-700 hover:text-violet-700"><span className="font-mono text-slate-500">{l.account.code}</span> {l.account.name}</Link>{l.description ? <span className="text-slate-400"> · {l.description}</span> : null}</td>
                    <td className="w-28 text-right">{l.debitPence ? formatGBP(l.debitPence) : ""}</td>
                    <td className="w-28 text-right">{l.creditPence ? formatGBP(l.creditPence) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {!journals.length && <p className="text-sm text-slate-500">Nothing in the books yet.</p>}
      </div>
    </div>
  );
}
