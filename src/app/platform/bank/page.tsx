import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { hqBalances } from "@/lib/server/hq-books";
import { PageHeader } from "@/components/admin";
import { formatMoney } from "@/lib/hq/money";
import { formatGBP } from "@/lib/pos/money";

export const metadata = { title: "Bank" };

export default async function Bank() {
  await requireHq("accounts.view");
  const [balances, counts] = await Promise.all([
    hqBalances(),
    db.hqBankTxn.groupBy({ by: ["accountId"], where: { status: "UNMATCHED" }, _count: true }),
  ]);
  const unmatched = new Map(counts.map((c) => [c.accountId, c._count]));
  const banks = balances.filter((b) => b.isBank);
  return (
    <div>
      <PageHeader title="Bank" sub="Upload statements from Lloyds (or any bank) as CSV, then tick each line off against your invoices, bills and costs." actions={<Link href="/platform/accounts/chart" className="btn-secondary">Add a bank account</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {banks.map((b) => (
          <Link key={b.id} href={`/platform/bank/${b.id}`} className="card block hover:ring-violet-300">
            <div className="text-xs text-slate-500">{b.code} · {b.currency}</div>
            <div className="font-semibold">{b.name}</div>
            <div className="mt-2 text-2xl font-bold tabular-nums">{b.currency === "GBP" ? formatGBP(b.balance) : formatMoney(b.foreign, b.currency)}</div>
            <div className="text-xs text-slate-500">In the books{b.currency !== "GBP" ? ` (${formatGBP(b.balance)})` : ""}</div>
            {unmatched.get(b.id) ? <div className="mt-2 text-sm font-semibold text-amber-700">{unmatched.get(b.id)} to reconcile</div> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
