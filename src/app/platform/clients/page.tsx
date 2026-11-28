import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { hqPeople } from "@/lib/server/hq-people";
import { PageHeader } from "@/components/admin";
import { ActionForm } from "@/components/FormMessage";
import { ClientFields } from "@/components/hq/ClientFields";
import { saveClient } from "@/lib/server/actions/hq-crm";
import { currencies, formatMoney } from "@/lib/hq/money";

export const metadata = { title: "Clients" };

export default async function Clients({ searchParams }: { searchParams: Promise<{ q?: string; archived?: string }> }) {
  const h = await requireHq("clients.view");
  const { q = "", archived } = await searchParams;
  const needle = q.trim().slice(0, 100);
  const [clients, people] = await Promise.all([
    db.hqClient.findMany({
      where: {
        archived: archived === "1",
        ...(needle ? { OR: [{ name: { contains: needle, mode: "insensitive" } }, { email: { contains: needle, mode: "insensitive" } }, { contacts: { some: { name: { contains: needle, mode: "insensitive" } } } }] } : {}),
      },
      include: { invoices: { where: { status: { in: ["SENT", "PARTIAL"] } }, select: { totalMinor: true, paidMinor: true, currency: true } }, _count: { select: { invoices: true, quotes: true } } },
      orderBy: { name: "asc" }, take: 500,
    }),
    hqPeople(),
  ]);
  const names = Object.fromEntries(people.map((p) => [p.id, p.name]));
  return (
    <div>
      <PageHeader title="Clients" sub="The businesses and people you work for." />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="card overflow-x-auto p-0">
          <form className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
            <input name="q" defaultValue={needle} className="input max-w-xs" placeholder="Search clients and contacts" />
            {archived === "1" && <input type="hidden" name="archived" value="1" />}
            <button className="btn-secondary">Search</button>
            <Link href={archived === "1" ? "/platform/clients" : "/platform/clients?archived=1"} className="ml-auto self-center text-sm text-slate-500">{archived === "1" ? "Show current clients" : "Show archived"}</Link>
          </form>
          <table className="table">
            <thead><tr><th>Client</th><th>Contact</th><th>Looked after by</th><th className="text-right">Quotes</th><th className="text-right">Invoices</th><th className="text-right">Owed</th></tr></thead>
            <tbody>
              {clients.map((c) => {
                const owed = new Map<string, number>();
                for (const i of c.invoices) owed.set(i.currency, (owed.get(i.currency) ?? 0) + i.totalMinor - i.paidMinor);
                return (
                  <tr key={c.id}>
                    <td><Link href={`/platform/clients/${c.id}`} className="font-semibold text-violet-700">{c.name}</Link><div className="text-xs text-slate-500">{[c.town, c.country !== "United Kingdom" ? c.country : null].filter(Boolean).join(", ")}</div></td>
                    <td className="text-xs">{c.email}<br />{c.phone}</td>
                    <td className="text-xs">{c.ownerId ? names[c.ownerId] ?? "" : ""}</td>
                    <td className="text-right">{c._count.quotes}</td><td className="text-right">{c._count.invoices}</td>
                    <td className="text-right tabular-nums">{[...owed].map(([cur, n]) => <div key={cur}>{formatMoney(n, cur)}</div>)}</td>
                  </tr>
                );
              })}
              {!clients.length && <tr><td colSpan={6} className="text-center text-slate-500">No clients{needle ? " match that search" : " yet"}.</td></tr>}
            </tbody>
          </table>
        </div>
        {h.can("clients.edit") && (
          <div className="card h-fit">
            <h2 className="mb-3 font-semibold">Add a client</h2>
            <ActionForm action={saveClient} className="space-y-3" submit="Add client"><ClientFields list={currencies()} staff={people} /></ActionForm>
          </div>
        )}
      </div>
    </div>
  );
}
