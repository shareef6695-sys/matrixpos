import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { balances, profitAndLoss, catchUpSales } from "@/lib/server/accounting";
import { PageHeader, Stat } from "@/components/admin";
import { formatGBP } from "@/lib/pos/money";
import { londonDate, londonRange, fmtDate } from "@/lib/dates";
import { payBill } from "@/lib/server/actions/accounts";
import { AccountsTabs } from "./Tabs";

export const metadata = { title: "Accounts" };

export default async function AccountsOverview() {
  const s = await requireAdmin();
  const settings = await db.orgSettings.findUnique({ where: { organizationId: s.orgId } });
  if (settings?.enableAccounting === false) {
    return <div><PageHeader title="Accounts" /><div className="card">Accounts is switched off. An owner can switch it on in <Link className="text-brand-700" href="/admin/settings">Settings</Link>.</div></div>;
  }
  await catchUpSales(s.orgId);
  const today = londonDate();
  const monthStart = today.slice(0, 8) + "01";
  const [b, pl, unpaid] = await Promise.all([
    balances(s.orgId),
    profitAndLoss(s.orgId, londonRange(monthStart, today)),
    db.bill.findMany({ where: { organizationId: s.orgId, paidAt: null }, orderBy: [{ dueDate: "asc" }, { date: "asc" }], take: 20 }),
  ]);
  const key = (k: string) => b.find((a) => a.systemKey === k)?.balance ?? 0;
  const vatOwed = key("VAT_OUTPUT") + key("VAT_INPUT");
  const banks = b.filter((a) => a.isBank);

  return (
    <div>
      <PageHeader title="Accounts" sub="Every sale, refund, bill and cash movement is booked here automatically, using double-entry bookkeeping."
        actions={<><Link href="/admin/accounts/bills" className="btn-primary">Add bill or expense</Link><Link href="/admin/accounts/money" className="btn-secondary">Move money</Link></>} />
      <AccountsTabs current="/admin/accounts" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {banks.map((a) => <Stat key={a.id} label={a.name} value={formatGBP(a.balance)} />)}
        <Stat label="Card payments to arrive" value={formatGBP(key("CARD_CLEARING"))} sub="Move to bank when the provider pays out" />
        <Stat label="Owed to suppliers" value={formatGBP(key("CREDITORS"))} sub={`${unpaid.length} unpaid bill${unpaid.length === 1 ? "" : "s"}`} />
        <Stat label={vatOwed >= 0 ? "VAT owed to HMRC" : "VAT to reclaim from HMRC"} value={formatGBP(Math.abs(vatOwed))} sub="VAT on sales less VAT on purchases" />
        <Stat label="Stock at cost" value={formatGBP(key("STOCK"))} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">This month so far</h2><Link className="text-sm text-brand-700" href="/admin/accounts/reports?type=pl">Full profit and loss</Link></div>
          <table className="table">
            <tbody>
              <tr><td>Sales (ex VAT)</td><td className="text-right">{formatGBP(pl.totalIncome)}</td></tr>
              <tr><td>Cost of sales and stock losses</td><td className="text-right">-{formatGBP(pl.totalCos)}</td></tr>
              <tr className="font-semibold"><td>Gross profit {pl.totalIncome ? `(${((pl.grossProfit / pl.totalIncome) * 100).toFixed(1)}%)` : ""}</td><td className="text-right">{formatGBP(pl.grossProfit)}</td></tr>
              <tr><td>Overheads</td><td className="text-right">-{formatGBP(pl.totalOverheads)}</td></tr>
              <tr className="text-base font-bold"><td>Net profit</td><td className={`text-right ${pl.netProfit < 0 ? "text-red-600" : "text-emerald-700"}`}>{formatGBP(pl.netProfit)}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold">Bills to pay</h2>
          {unpaid.length === 0 ? <p className="text-sm text-slate-500">Nothing outstanding.</p> : (
            <ul className="divide-y divide-slate-100">
              {unpaid.map((bill) => (
                <li key={bill.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span><b>{bill.payee}</b> {bill.reference && <span className="text-slate-400">#{bill.reference}</span>}<br /><span className={`text-xs ${bill.dueDate && bill.dueDate < new Date() ? "text-red-600" : "text-slate-500"}`}>{bill.dueDate ? `Due ${fmtDate(bill.dueDate)}` : `Dated ${fmtDate(bill.date)}`}</span></span>
                  <form action={payBill} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={bill.id} />
                    <span className="font-semibold">{formatGBP(bill.grossPence)}</span>
                    <select name="paidFromId" className="input w-36 py-1 text-xs">{banks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                    <button className="btn-secondary px-2 py-1 text-xs">Mark paid</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
