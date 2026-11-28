import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { PageHeader } from "@/components/admin";
import { ActionForm } from "@/components/FormMessage";
import { saveRate, deleteRate } from "@/lib/server/actions/hq-crm";
import { currencies } from "@/lib/hq/money";
import { fmtDate, londonDate } from "@/lib/dates";

export const metadata = { title: "Currencies" };

export default async function Currencies() {
  const h = await requireHq("invoices.view");
  const rates = await db.hqFxRate.findMany({ orderBy: [{ currency: "asc" }, { date: "desc" }], take: 500 });
  return (
    <div>
      <PageHeader title="Currencies" sub="Your base currency is GBP. You can quote and invoice in any currency. Each quote, invoice and payment keeps the rate it was made at, so your GBP figures never change afterwards." />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Currency</th><th>Date</th><th className="text-right">£1 buys</th><th /></tr></thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id}><td className="font-semibold">{r.currency}</td><td>{fmtDate(r.date)}</td><td className="text-right tabular-nums">{Number(r.perGbp)}</td>
                  <td>{h.can("fx.edit") && <form action={deleteRate}><input type="hidden" name="id" value={r.id} /><button className="text-xs text-red-600">Delete</button></form>}</td></tr>
              ))}
              {!rates.length && <tr><td colSpan={4} className="text-center text-slate-500">No rates yet. Add one before invoicing in another currency, or type the rate on the invoice itself.</td></tr>}
            </tbody>
          </table>
        </div>
        {h.can("fx.edit") && (
          <div className="card h-fit">
            <h2 className="mb-3 font-semibold">Add a rate</h2>
            <ActionForm action={saveRate} className="space-y-2" submit="Save rate">
              <select name="currency" className="input" defaultValue="USD">{currencies().filter((c) => c !== "GBP").map((c) => <option key={c}>{c}</option>)}</select>
              <input name="perGbp" className="input" inputMode="decimal" placeholder="£1 = ? (e.g. 1.27 for USD)" required />
              <input name="date" type="date" className="input" defaultValue={londonDate()} required />
              <p className="text-xs text-slate-500">Use your bank&apos;s rate or the Bank of England&apos;s daily rate. The newest rate on or before a document&apos;s date is used.</p>
            </ActionForm>
          </div>
        )}
      </div>
    </div>
  );
}
