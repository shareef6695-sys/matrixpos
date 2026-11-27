import "server-only";
import { db } from "./db";
import { displayStatus, mrrPence } from "@/lib/plans";
import { platformEmails } from "./billing";

const DAY = 86_400_000;

export type ShopRow = Awaited<ReturnType<typeof platformShops>>[number];

/** Every business on MatrixPOS with its usage and billing, for the platform owner. */
export async function platformShops() {
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY);
  const [orgs, sales30, lastSales] = await Promise.all([
    db.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { stores: true, users: true, products: true } },
        stores: { select: { _count: { select: { registers: true } }, postcode: true, town: true } },
        users: { where: { role: "OWNER" }, orderBy: { createdAt: "asc" }, take: 1, select: { name: true, email: true } },
      },
    }),
    db.sale.groupBy({ by: ["organizationId"], where: { createdAt: { gte: since30 }, kind: "SALE", status: "COMPLETED" }, _sum: { totalPence: true }, _count: true }),
    db.sale.groupBy({ by: ["organizationId"], _max: { createdAt: true } }),
  ]);
  const s30 = new Map(sales30.map((x) => [x.organizationId, x]));
  const last = new Map(lastSales.map((x) => [x.organizationId, x._max.createdAt]));
  const hq = platformEmails();
  return orgs.map((o) => {
    const status = displayStatus(o);
    const lastSale = last.get(o.id) ?? null;
    // Your own shop and the demo shop are shown but left out of the numbers.
    const internal = o.slug === "demo-mart" || (!!o.users[0]?.email && hq.includes(o.users[0].email.toLowerCase()));
    return {
      id: o.id,
      internal,
      name: o.name,
      slug: o.slug,
      createdAt: o.createdAt,
      plan: o.plan,
      cycle: o.billingCycle,
      status,
      trialEndsAt: o.trialEndsAt,
      paidUntil: o.paidUntil,
      note: o.billingNote,
      owner: o.users[0] ?? null,
      stores: o._count.stores,
      registers: o.stores.reduce((n, s) => n + s._count.registers, 0),
      staff: o._count.users,
      products: o._count.products,
      town: o.stores.map((s) => s.town || s.postcode).find(Boolean) ?? null,
      sales30: s30.get(o.id)?._count ?? 0,
      takings30: s30.get(o.id)?._sum.totalPence ?? 0,
      lastSale,
      trading: !!lastSale && lastSale.getTime() > now - 7 * DAY,
      mrr: !internal && (status === "ACTIVE" || status === "PAST_DUE") ? mrrPence(o.plan, o.billingCycle) : 0,
    };
  });
}

export async function planRequests(days = 30) {
  return db.auditLog.findMany({
    where: { action: "billing.request", createdAt: { gte: new Date(Date.now() - days * DAY) } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { organization: { select: { id: true, name: true, plan: true } }, user: { select: { email: true } } },
  });
}
