import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/admin";
import { saveCustomer, eraseCustomer } from "@/lib/server/actions/admin";

export const metadata = { title: "Customers" };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireAdmin();
  const { q } = await searchParams;
  const [customers, settings] = await Promise.all([
    db.customer.findMany({
      where: { organizationId: s.orgId, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { loyaltyCode: q.toUpperCase() }] } : {}) },
      include: { _count: { select: { sales: true } } }, orderBy: { createdAt: "desc" }, take: 200,
    }),
    db.orgSettings.findUnique({ where: { organizationId: s.orgId } }),
  ]);
  return (
    <div>
      <PageHeader title="Customers & loyalty" sub={settings?.enableLoyalty ? `Customers earn ${settings.loyaltyPointsPerPound} point(s) per £1` : "Loyalty is switched off in Settings"} />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="card overflow-x-auto p-0">
          <form className="flex gap-2 border-b border-slate-100 p-3"><input name="q" defaultValue={q} className="input max-w-xs" placeholder="Search" /><button className="btn-secondary">Search</button></form>
          <table className="table">
            <thead><tr><th>Name</th><th>Card</th><th>Contact</th><th>Marketing</th><th className="text-right">Visits</th><th className="text-right">Points</th><th /></tr></thead>
            <tbody>{customers.map((c) => (
              <tr key={c.id}><td className="font-medium">{c.name}</td><td className="font-mono text-xs">{c.loyaltyCode}</td><td className="text-xs">{c.email}<br />{c.phone}</td>
                <td>{c.marketingOptIn ? <span className="badge bg-emerald-100 text-emerald-800">Opted in</span> : <span className="badge bg-slate-100 text-slate-500">No</span>}</td>
                <td className="text-right">{c._count.sales}</td><td className="text-right font-semibold">{c.points}</td>
                <td><form action={eraseCustomer}><input type="hidden" name="id" value={c.id} /><button className="text-xs text-red-600" title="Erase personal data (UK GDPR)">Erase</button></form></td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="card h-fit">
          <h2 className="mb-3 font-semibold">Add customer</h2>
          <form action={saveCustomer} className="space-y-2">
            <input name="name" className="input" placeholder="Name" required />
            <input name="email" type="email" className="input" placeholder="Email" />
            <input name="phone" className="input" placeholder="Mobile" />
            <input name="loyaltyCode" className="input" placeholder="Card number (blank to generate)" />
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="marketingOptIn" className="mt-1" /> Customer agreed to receive marketing (record consent under UK GDPR / PECR)</label>
            <button className="btn-primary">Add</button>
          </form>
        </div>
      </div>
    </div>
  );
}
