import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { PageHeader } from "@/components/admin";
import { FREQUENCY_LABEL } from "@/lib/hq/labels";
import { fmtDate } from "@/lib/dates";

export const metadata = { title: "Repeating invoices" };

export default async function Recurring() {
  const h = await requireHq("invoices.view");
  const list = await db.hqRecurring.findMany({ orderBy: [{ active: "desc" }, { nextDate: "asc" }], include: { client: { select: { name: true } }, _count: { select: { invoices: true } } } });
  return (
    <div>
      <PageHeader title="Repeating invoices" sub="For support plans, hosting and subscriptions. Each invoice is made early in the morning on its date (UK time), and emailed if you choose."
        actions={h.can("invoices.edit") ? <Link href="/platform/recurring/new" className="btn-primary">New repeating invoice</Link> : null} />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Client</th><th>Title</th><th>How often</th><th>Next</th><th>Made so far</th><th>Sending</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                <td><Link href={`/platform/recurring/${r.id}`} className="font-semibold text-violet-700">{r.client.name}</Link></td>
                <td>{r.title}</td><td>{FREQUENCY_LABEL[r.frequency]}</td>
                <td>{r.active ? fmtDate(r.nextDate) : "Paused"}</td><td>{r._count.invoices}</td>
                <td className="text-sm">{r.autoSend ? "Emailed automatically" : "Saved as a draft"}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="text-center text-slate-500">None yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
