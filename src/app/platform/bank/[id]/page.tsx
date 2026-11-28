import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { matchSuggestions, openDocumentsFor } from "@/lib/server/hq-bank";
import { accountOptions } from "@/lib/server/hq-forms";
import { PageHeader } from "@/components/admin";
import { ErrorBanner, Tabs } from "@/components/hq/ui";
import { ActionForm } from "@/components/FormMessage";
import { AccountSelect } from "@/components/hq/BooksForms";
import { createFromTxn, ignoreTxn, importStatement, matchTxn, payFromTxn, receiveTxn, unmatchTxn } from "@/lib/server/actions/hq-books";
import { formatMoney } from "@/lib/hq/money";
import { SOURCE_LABEL } from "@/lib/hq/labels";
import { fmtDate } from "@/lib/dates";

export const metadata = { title: "Bank account" };

const TABS: [string, string][] = [["all", "To reconcile"], ["MATCHED", "Reconciled"], ["IGNORED", "Ignored"]];

function Hidden({ txnId }: { txnId: string }) {
  return <input type="hidden" name="txnId" value={txnId} />;
}

export default async function BankAccount({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string; error?: string }> }) {
  const h = await requireHq("accounts.view");
  const edit = h.can("accounts.edit");
  const { id } = await params;
  const { f = "all", error } = await searchParams;
  const a = await db.hqAccount.findFirst({ where: { id, isBank: true } });
  if (!a) notFound();
  const status = f === "MATCHED" || f === "IGNORED" ? f : "UNMATCHED";
  const [txns, book, counts, opts] = await Promise.all([
    db.hqBankTxn.findMany({ where: { accountId: id, status }, orderBy: { date: status === "UNMATCHED" ? "asc" : "desc" }, take: status === "UNMATCHED" ? 30 : 200, include: { journal: true } }),
    db.hqJournalLine.aggregate({ where: { accountId: id }, _sum: { foreignMinor: true } }),
    db.hqBankTxn.groupBy({ by: ["status"], where: { accountId: id }, _count: true }),
    accountOptions(),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  // For each line waiting: entries already in the books that look the same, and open invoices or bills it may be paying.
  const extra = status === "UNMATCHED" && edit
    ? await Promise.all(txns.map(async (t) => ({ suggestions: await matchSuggestions(t), docs: await openDocumentsFor(t.amountMinor, a.currency) })))
    : [];
  const others = opts.all.filter((x) => x.id !== a.id && (!x.isBank || x.currency === a.currency));
  return (
    <div>
      <Link href="/platform/bank" className="text-sm text-slate-500">← Bank</Link>
      <PageHeader title={`${a.code} ${a.name}`} sub={`${a.currency} · In the books: ${formatMoney(book._sum.foreignMinor ?? 0, a.currency)}`} actions={<Link href={`/platform/accounts/ledger/${a.id}`} className="btn-secondary">Ledger</Link>} />
      <ErrorBanner error={error} />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div>
          <Tabs base={`/platform/bank/${a.id}`} current={f === "MATCHED" || f === "IGNORED" ? f : "all"} tabs={TABS.map(([k, l]) => [k, `${l} (${count(k === "all" ? "UNMATCHED" : k)})`])} />
          <div className="space-y-3">
            {txns.map((t, i) => {
              const x = extra[i];
              return (
                <div key={t.id} className="card text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><b>{fmtDate(t.date)}</b> · {t.description}</div>
                    <div className={`text-base font-bold tabular-nums ${t.amountMinor < 0 ? "text-slate-800" : "text-emerald-700"}`}>{t.amountMinor > 0 ? "+" : ""}{formatMoney(t.amountMinor, a.currency)}</div>
                  </div>
                  {t.status === "MATCHED" && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>Matched to {t.journal ? `${SOURCE_LABEL[t.journal.source] ?? t.journal.source}: ${t.journal.memo ?? ""} ${t.journal.reference ?? ""}` : "an entry"}</span>
                      {edit && <form action={unmatchTxn}><Hidden txnId={t.id} /><button className="text-red-600">Undo</button></form>}
                    </div>
                  )}
                  {t.status === "IGNORED" && edit && <form action={ignoreTxn} className="mt-2"><Hidden txnId={t.id} /><button className="text-xs text-violet-700">Bring back</button></form>}
                  {x && (
                    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                      {x.suggestions.map((s) => (
                        <form key={s.journalId} action={matchTxn} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 p-2">
                          <Hidden txnId={t.id} /><input type="hidden" name="journalId" value={s.journalId} />
                          <span>Already in the books: {SOURCE_LABEL[s.source] ?? s.source} on {fmtDate(s.date)} · {s.memo} {s.reference}</span>
                          <button className="btn-primary py-1 text-xs">Match</button>
                        </form>
                      ))}
                      {t.amountMinor > 0 && x.docs.invoices.length > 0 && (
                        <form action={receiveTxn} className="flex flex-wrap gap-2">
                          <Hidden txnId={t.id} />
                          <select name="invoiceId" className="input min-w-0 flex-1" required defaultValue={x.docs.invoices.find((v) => t.description.toUpperCase().includes(v.number))?.id ?? ""}>
                            <option value="">Payment for an invoice…</option>
                            {x.docs.invoices.map((v) => <option key={v.id} value={v.id}>{v.number} · {v.billToName} · {formatMoney(v.totalMinor - v.paidMinor, v.currency)} left</option>)}
                          </select>
                          <button className="btn-secondary">Receive</button>
                        </form>
                      )}
                      {t.amountMinor < 0 && x.docs.bills.length > 0 && (
                        <form action={payFromTxn} className="flex flex-wrap gap-2">
                          <Hidden txnId={t.id} />
                          <select name="billId" className="input min-w-0 flex-1" required defaultValue="">
                            <option value="">Paying a bill…</option>
                            {x.docs.bills.map((v) => <option key={v.id} value={v.id}>{v.payee}{v.reference ? ` ${v.reference}` : ""} · {formatMoney(v.totalMinor - v.paidMinor, v.currency)} left</option>)}
                          </select>
                          <button className="btn-secondary">Pay</button>
                        </form>
                      )}
                      <form action={createFromTxn} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <Hidden txnId={t.id} />
                        <AccountSelect accounts={others} name="accountId" required />
                        <input name="description" className="input" defaultValue={t.description} aria-label="Description" />
                        <button className="btn-secondary">Add to books</button>
                        {a.currency !== "GBP" && <input name="perGbp" className="input sm:col-span-3" inputMode="decimal" placeholder={`£1 = ? ${a.currency} (blank = saved rate)`} />}
                      </form>
                      <form action={ignoreTxn}><Hidden txnId={t.id} /><button className="text-xs text-slate-500">Ignore this line (a duplicate, or already covered)</button></form>
                    </div>
                  )}
                </div>
              );
            })}
            {!txns.length && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{status === "UNMATCHED" ? "Nothing to reconcile. Upload a statement to start." : "Nothing here."}</p>}
            {status === "UNMATCHED" && count("UNMATCHED") > txns.length && <p className="text-center text-xs text-slate-500">Showing the oldest {txns.length}. The rest appear as you go.</p>}
          </div>
        </div>
        {edit && (
          <div className="card h-fit">
            <h2 className="mb-2 font-semibold">Upload a statement</h2>
            <p className="mb-3 text-xs text-slate-500">In Lloyds online banking, open the account, choose Export (or Download transactions) and pick CSV. Other banks work the same way. Lines already uploaded are skipped.</p>
            <ActionForm action={importStatement} className="space-y-3" submit="Upload" reset>
              <input type="hidden" name="accountId" value={a.id} />
              <input type="file" name="file" accept=".csv,text/csv" className="input" required />
            </ActionForm>
          </div>
        )}
      </div>
    </div>
  );
}
