import { isPlatformAdmin } from "@/lib/server/billing";
import { platformShops } from "@/lib/server/platform";
import { csv } from "@/lib/csv";
import { planById } from "@/lib/plans";
import { apiRoute } from "@/lib/server/errors";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export const GET = apiRoute("GET /api/platform/export", async () => {
  if (!(await isPlatformAdmin())) return new Response("Not found", { status: 404 });
  const rows = await platformShops();
  const body = csv([
    ["business", "owner", "email", "plan", "billing", "status", "signed_up", "trial_ends", "paid_until", "shops", "tills", "staff", "products", "sales_30d", "takings_30d", "last_sale", "monthly_fee", "payment", "note"],
    ...rows.map((r) => [r.name, r.owner?.name, r.owner?.email, planById(r.plan).name, r.cycle, r.status, day(r.createdAt), day(r.trialEndsAt), day(r.paidUntil),
      r.stores, r.registers, r.staff, r.products, r.sales30, (r.takings30 / 100).toFixed(2), day(r.lastSale), (r.mrr / 100).toFixed(2), r.card ? "card" : "invoice", r.note]),
  ]);
  return new Response(body, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="matrixpos-customers-${day(new Date())}.csv"`, "cache-control": "no-store" },
  });
});
