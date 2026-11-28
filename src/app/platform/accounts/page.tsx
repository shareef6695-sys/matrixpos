import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { catchUpBooks, hqBalances, lockDate } from "@/lib/server/hq-books";
import { PageHeader, Stat } from "@/components/admin";
import { BooksNav } from "@/components/hq/BooksNav";
import { profitAndLoss } from "@/lib/hq/books";
import { formatMoney } from "@/lib/hq/money";
import { formatGBP } from "@/lib/pos/money";
import { fmtDate, londonDate, londonDayStart } from "@/lib/dates";

export const metadata = { title: "Books" };

/** UK company year assumed to run with the calendar year unless set otherwise; the reports page takes any range. */
export default async function Books() {
  await requireHq("accounts.view");
  // Anything sent or paid before the books existed (or while a period was locked) is brought in here.
  await catchUpBooks();
  const today = londonDate();
  const yearStart = londonDayStart(`${today.slice(0, 4)}-01-01`);
  const [all, year, lock, unmatched, billsDue] = await Promise.all([
    hqBalances(),
    hqBalances({ gte: yearStart }),
    lockDate(),
    db.hqBankTxn.count({ where: { status: "UNMATCHED" } }),
    db.hqBill.count({ where: { status: { in: ["OPEN", "PARTIAL"] } } }),
  ]);
  const pl = profitAndLoss(year);
  const by = (k: string) => all.find((a) => a.key === k)?.balance ?? 0;
  const banks = all.filter((a) => a.isBank && (a.debit || a.credit));
  return (
    <div>
      <PageHeader title="Books" sub="Matrix Infotech Ltd's own accounts, in GBP. Invoices, payments, bills and bank lines post here automatically." />
      <BooksNav current="/platform/accounts" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clients owe you" value={formatGBP(by("DEBTORS"))} />
        <Stat label="You owe suppliers" value={formatGBP(by("CREDITORS"))} sub={billsDue ? `${billsDue} unpaid bill${billsDue === 1 ? "" : "s"}` : undefined} />
        <Stat label={`Income ${today.slice(0, 4)}`} value={formatGBP(pl.totalIncome)} />
        <Stat label={`Profit ${today.slice(0, 4)} (before tax)`} value={formatGBP(pl.netProfit)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Bank balances</h2>
          <ul className="space-y-2 text-sm">
            {banks.map((b) => (
              <li key={b.id} className="flex justify-between gap-3">
                <Link href={`/platform/bank/${b.id}`} className="text-violet-700">{b.code} {b.name}</Link>
                <span className="tabular-nums">{b.currency === "GBP" ? formatGBP(b.balance) : <>{formatMoney(b.foreign, b.currency)} <span className="text-xs text-slate-500">({formatGBP(b.balance)})</span></>}</span>
              </li>
            ))}
            {!banks.length && <li className="text-slate-500">Nothing in the bank accounts yet. Record a payment, or add opening balances as a journal.</li>}
          </ul>
          {unmatched > 0 && <p className="mt-3 text-sm"><Link href="/platform/bank" className="font-semibold text-amber-700">{unmatched} bank line{unmatched === 1 ? "" : "s"} to reconcile →</Link></p>}
        </div>
        <div className="card text-sm">
          <h2 className="mb-3 font-semibold">Getting started</h2>
          <ol className="list-decimal space-y-1 pl-5 text-slate-600">
            <li>Check the <Link href="/platform/accounts/chart" className="text-violet-700">chart of accounts</Link> and add any bank accounts you have (with their currency).</li>
            <li>Enter what was in each account on your start date as a <Link href="/platform/accounts/journals" className="text-violet-700">journal</Link> (your opening balances).</li>
            <li>Upload bank statements under <Link href="/platform/bank" className="text-violet-700">Bank</Link> and tick each line off.</li>
            <li>Add costs under <Link href="/platform/bills" className="text-violet-700">Bills &amp; expenses</Link>.</li>
            <li>When a month or year is final, set the <Link href="/platform/accounts/settings" className="text-violet-700">lock date</Link>.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-500">{lock ? `Locked up to ${fmtDate(lock)}.` : "No lock date set."} Not VAT registered, so no VAT is recorded.</p>
        </div>
      </div>
    </div>
  );
}
