import { requireAdmin } from "@/lib/server/auth";
import { balances } from "@/lib/server/accounting";
import { PageHeader } from "@/components/admin";
import { formatGBP } from "@/lib/pos/money";
import { saveLedgerAccount } from "@/lib/server/actions/accounts";
import { AccountsTabs } from "../Tabs";
import { db } from "@/lib/server/db";

export const metadata = { title: "Chart of accounts" };

const TYPE = { ASSET: "Assets", LIABILITY: "Liabilities", EQUITY: "Capital", INCOME: "Income", EXPENSE: "Expenses" } as const;

export default async function Chart() {
  const s = await requireAdmin();
  const b = await balances(s.orgId);
  const archived = new Set((await db.ledgerAccount.findMany({ where: { organizationId: s.orgId, archived: true }, select: { id: true } })).map((a) => a.id));
  const owner = s.role === "OWNER";
  return (
    <div>
      <PageHeader title="Chart of accounts" sub="A standard UK small-retail chart is set up for you. Add accounts for anything else you want to track." />
      <AccountsTabs current="/admin/accounts/chart" />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {(Object.keys(TYPE) as (keyof typeof TYPE)[]).map((t) => (
            <div key={t} className="card p-0">
              <h2 className="border-b border-slate-100 px-4 py-3 font-semibold">{TYPE[t]}</h2>
              <table className="table"><tbody>
                {b.filter((a) => a.type === t).map((a) => (
                  <tr key={a.id} className={archived.has(a.id) ? "opacity-50" : ""}>
                    <td className="w-16 font-mono text-xs">{a.code}</td>
                    <td>{owner ? (
                      <form action={saveLedgerAccount} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={a.id} />
                        <input name="name" defaultValue={a.name} className="min-w-0 flex-1 rounded border-0 bg-transparent px-1 py-0.5 hover:bg-slate-50 focus:ring-1 focus:ring-brand-500" />
                        {!a.systemKey && <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" name="archived" defaultChecked={archived.has(a.id)} /> hide</label>}
                        <button className="text-xs text-brand-700">Save</button>
                      </form>
                    ) : a.name}{a.isBank && <span className="badge ml-2 bg-sky-100 text-sky-800">bank/cash</span>}</td>
                    <td className="text-right font-semibold tabular-nums">{formatGBP(a.balance)}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          ))}
        </div>
        {owner && (
          <form action={saveLedgerAccount} className="card h-fit space-y-2">
            <h2 className="font-semibold">Add an account</h2>
            <div className="grid grid-cols-3 gap-2">
              <input name="code" className="input" placeholder="Code" required />
              <input name="name" className="input col-span-2" placeholder="Name" required />
            </div>
            <select name="type" className="input">{Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isBank" /> Bank or cash account (money can be paid from it)</label>
            <button className="btn-primary">Add</button>
          </form>
        )}
      </div>
    </div>
  );
}
