import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ensureChart } from "@/lib/server/accounting";
import { balanceOf } from "@/lib/accounting/ledger";
import { PageHeader } from "@/components/admin";
import { formatGBP } from "@/lib/pos/money";
import { fmtDate, londonDate, londonRange, addDays } from "@/lib/dates";
import { AccountsTabs } from "../Tabs";

export const metadata = { title: "Ledger" };

const SOURCE: Record<string, string> = { SALE: "Till", SALE_VOID: "Void", BILL: "Bill", BILL_PAYMENT: "Payment", STOCK: "Stock", CASH: "Till cash", SHIFT: "Till close", TRANSFER: "Transfer", MANUAL: "Journal" };

export default async function Ledger({ searchParams }: { searchParams: Promise<{ account?: string; from?: string; to?: string }> }) {
  const s = await requireAdmin();
  const sp = await searchParams;
  await ensureChart(s.orgId);
  const today = londonDate();
  const from = sp.from || addDays(today, -30);
  const to = sp.to || today;
  const range = londonRange(from, to);
  const accounts = await db.ledgerAccount.findMany({ where: { organizationId: s.orgId }, orderBy: { code: "asc" } });
  const account = accounts.find((a) => a.id === sp.account);

  if (account) {
    // General ledger for one account, with running balance.
    const opening = await db.journalLine.aggregate({ where: { accountId: account.id, entry: { date: { lt: range.gte } } }, _sum: { debitPence: true, creditPence: true } });
    const lines = await db.journalLine.findMany({ where: { accountId: account.id, entry: { date: range } }, include: { entry: true }, orderBy: [{ entry: { date: "asc" } }, { entry: { createdAt: "asc" } }] });
    let run = balanceOf(account.type, opening._sum.debitPence ?? 0, opening._sum.creditPence ?? 0);
    return (
      <div>
        <PageHeader title={`${account.code} ${account.name}`} sub={`${from} to ${to}`} actions={<Link href="/admin/accounts/journals" className="btn-secondary">All journals</Link>} />
        <AccountsTabs current="/admin/accounts/journals" />
        <Filter from={from} to={to} account={account.id} accounts={accounts} />
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Description</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
            <tbody>
              <tr className="text-slate-500"><td colSpan={6}>Opening balance</td><td className="text-right">{formatGBP(run)}</td></tr>
              {lines.map((l) => {
                run += balanceOf(account.type, l.debitPence, l.creditPence);
                return (
                  <tr key={l.id}><td>{fmtDate(l.entry.date)}</td><td className="text-xs">{SOURCE[l.entry.source]}</td><td className="font-mono text-xs">{l.entry.reference}</td><td className="text-xs">{l.entry.memo}{l.description && l.description !== l.entry.memo ? ` · ${l.description}` : ""}</td>
                    <td className="text-right">{l.debitPence ? formatGBP(l.debitPence) : ""}</td><td className="text-right">{l.creditPence ? formatGBP(l.creditPence) : ""}</td><td className="text-right font-semibold">{formatGBP(run)}</td></tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const entries = await db.journalEntry.findMany({ where: { organizationId: s.orgId, date: range }, include: { lines: { include: { account: true } } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200 });
  return (
    <div>
      <PageHeader title="Ledger" sub="Every journal, newest first. Pick an account to see its full history." />
      <AccountsTabs current="/admin/accounts/journals" />
      <Filter from={from} to={to} accounts={accounts} />
      <div className="space-y-3">
        {entries.map((e) => (
          <div key={e.id} className="card p-3">
            <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm"><span><b>{fmtDate(e.date)}</b> · {SOURCE[e.source]} {e.reference && <span className="font-mono text-xs">{e.reference}</span>}</span><span className="text-slate-500">{e.memo}</span></div>
            <table className="w-full text-xs"><tbody>{e.lines.map((l) => (
              <tr key={l.id}><td className={l.creditPence ? "pl-6" : ""}><Link className="text-brand-700" href={`/admin/accounts/journals?account=${l.accountId}`}>{l.account.code} {l.account.name}</Link></td><td className="w-24 text-right">{l.debitPence ? formatGBP(l.debitPence) : ""}</td><td className="w-24 text-right">{l.creditPence ? formatGBP(l.creditPence) : ""}</td></tr>
            ))}</tbody></table>
          </div>
        ))}
        {entries.length === 0 && <p className="text-sm text-slate-500">No journals in this period.</p>}
      </div>
    </div>
  );
}

function Filter({ from, to, account, accounts }: { from: string; to: string; account?: string; accounts: { id: string; code: string; name: string }[] }) {
  return (
    <form className="mb-4 flex flex-wrap items-end gap-2">
      <div><label className="label">Account</label><select name="account" defaultValue={account ?? ""} className="input"><option value="">All journals</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></div>
      <div><label className="label">From</label><input type="date" name="from" defaultValue={from} className="input" /></div>
      <div><label className="label">To</label><input type="date" name="to" defaultValue={to} className="input" /></div>
      <button className="btn-secondary">Show</button>
    </form>
  );
}
