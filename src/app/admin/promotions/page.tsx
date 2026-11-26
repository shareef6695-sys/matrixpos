import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader, Empty } from "@/components/admin";
import { formatGBP } from "@/lib/pos/money";
import { fmtDate } from "@/lib/dates";
import { deletePromotion } from "@/lib/server/actions/admin";

export const metadata = { title: "Offers" };

const TYPE: Record<string, string> = { MULTIBUY_PRICE: "Multibuy", BUY_X_GET_Y: "Buy X get Y free", PERCENT_OFF: "% off", MEAL_DEAL: "Meal deal" };

export default async function Promotions() {
  const s = await requireAdmin();
  const promos = await db.promotion.findMany({ where: { organizationId: s.orgId }, include: { items: { include: { product: { select: { name: true } } } } }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="Offers" sub="Applied automatically at the till. Each item counts towards one offer at a time." actions={<Link href="/admin/promotions/new" className="btn-primary">New offer</Link>} />
      {promos.length === 0 ? <Empty>No offers yet. Try a meal deal, a &quot;3 for £2&quot; or a BOGOF.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {promos.map((p) => {
            const live = p.active && (!p.endsAt || p.endsAt > new Date()) && (!p.startsAt || p.startsAt <= new Date());
            return (
              <div key={p.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div><Link href={`/admin/promotions/${p.id}`} className="font-semibold text-brand-700">{p.name}</Link><div className="text-xs text-slate-500">{TYPE[p.type]}</div></div>
                  <span className={`badge ${live ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{live ? "Live" : p.active ? "Scheduled / ended" : "Off"}</span>
                </div>
                <p className="mt-2 text-sm">
                  {p.type === "MULTIBUY_PRICE" && `Any ${p.quantity} for ${formatGBP(p.pricePence ?? 0)}`}
                  {p.type === "BUY_X_GET_Y" && `Buy ${p.quantity}, get ${p.freeQuantity} free (cheapest free)`}
                  {p.type === "PERCENT_OFF" && `${p.percentOff}% off`}
                  {p.type === "MEAL_DEAL" && `One from each group for ${formatGBP(p.pricePence ?? 0)}`}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{p.items.map((i) => i.product.name).join(", ")}</p>
                {(p.startsAt || p.endsAt) && <p className="mt-1 text-xs text-slate-500">{p.startsAt ? fmtDate(p.startsAt) : "Now"} to {p.endsAt ? fmtDate(p.endsAt) : "no end"}</p>}
                <form action={deletePromotion} className="mt-3"><input type="hidden" name="id" value={p.id} /><button className="text-xs text-red-600">Delete</button></form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
