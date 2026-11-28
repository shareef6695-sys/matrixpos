import Link from "next/link";
import { requireHq } from "@/lib/server/hq";
import { hqBalances } from "@/lib/server/hq-books";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/admin";
import { BooksNav } from "@/components/hq/BooksNav";
import { ActionForm } from "@/components/FormMessage";
import { saveAccount } from "@/lib/server/actions/hq-books";
import { currencies, formatMoney } from "@/lib/hq/money";
import { formatGBP } from "@/lib/pos/money";
import type { HqAccount } from "@prisma/client";

export const metadata = { title: "Chart of accounts" };

const TYPE_LABEL = { ASSET: "Assets", LIABILITY: "Liabilities", EQUITY: "Capital and reserves", INCOME: "Income", EXPENSE: "Costs" } as const;

function Fields({ a, list }: { a?: HqAccount; list: string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {a && <input type="hidden" name="id" value={a.id} />}
      <div><label className="label">Code</label><input name="code" className="input" defaultValue={a?.code} required inputMode="numeric" /></div>
      <div><label className="label">Type</label><select name="type" className="input" defaultValue={a?.type ?? "EXPENSE"}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="sm:col-span-2"><label className="label">Name</label><input name="name" className="input" defaultValue={a?.name} required /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isBank" defaultChecked={a?.isBank} /> Bank, card or payment account</label>
      <div><label className="label">Currency (bank accounts)</label><select name="currency" className="input" defaultValue={a?.currency ?? "GBP"}>{list.map((c) => <option key={c}>{c}</option>)}</select></div>
      <div className="sm:col-span-2"><label className="label">Notes</label><input name="description" className="input" defaultValue={a?.description ?? ""} placeholder="e.g. Lloyds business account ending 1234" /></div>
      {a && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="archived" defaultChecked={a.archived} /> Archived (hidden from pickers)</label>}
    </div>
  );
}

export default async function Chart() {
  const h = await requireHq("accounts.view");
  const edit = h.can("accounts.edit");
  const [balances, accounts] = await Promise.all([hqBalances(), db.hqAccount.findMany({ orderBy: { code: "asc" } })]);
  const bal = new Map(balances.map((b) => [b.id, b]));
  const list = currencies();
  return (
    <div>
      <PageHeader title="Chart of accounts" sub="Balances are to today, in GBP. Bank accounts in another currency also show their own balance." />
      <BooksNav current="/platform/accounts/chart" />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {(Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map((t) => (
            <div key={t}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{TYPE_LABEL[t]}</h2>
              <div className="space-y-1">
                {accounts.filter((a) => a.type === t).map((a) => {
                  const b = bal.get(a.id);
                  return (
                    <details key={a.id} className={`card py-2 ${a.archived ? "opacity-60" : ""}`}>
                      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                        <span><span className="font-mono text-xs text-slate-500">{a.code}</span> <b>{a.name}</b>{a.isBank && <span className="badge ml-1 bg-sky-100 text-sky-800">Bank {a.currency}</span>}{a.systemKey && <span className="badge ml-1 bg-slate-100 text-slate-600">Automatic</span>}</span>
                        <span className="flex items-center gap-3 tabular-nums">
                          {a.isBank && a.currency !== "GBP" && b ? <span className="text-xs text-slate-500">{formatMoney(b.foreign, a.currency)}</span> : null}
                          {formatGBP(b?.balance ?? 0)}
                          <Link href={`/platform/accounts/ledger/${a.id}`} className="text-xs text-violet-700">Ledger</Link>
                        </span>
                      </summary>
                      {edit && <ActionForm action={saveAccount} className="mt-3 space-y-3" submit="Save"><Fields a={a} list={list} /></ActionForm>}
                    </details>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {edit && (
          <div className="card h-fit">
            <h2 className="mb-3 font-semibold">Add an account</h2>
            <p className="mb-3 text-xs text-slate-500">To add a bank account (say a Lloyds USD account), tick &quot;Bank&quot; and choose its currency.</p>
            <ActionForm action={saveAccount} className="space-y-3" submit="Add account" reset><Fields list={list} /></ActionForm>
          </div>
        )}
      </div>
    </div>
  );
}
