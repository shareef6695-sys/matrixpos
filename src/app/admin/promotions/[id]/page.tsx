import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/admin";
import { PromotionForm } from "./PromotionForm";

export const metadata = { title: "Offer" };

export default async function PromotionPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireAdmin();
  const { id } = await params;
  const products = await db.product.findMany({ where: { organizationId: s.orgId, active: true, unit: "EACH" }, select: { id: true, name: true, pricePence: true, category: { select: { name: true } } }, orderBy: { name: "asc" } });
  const weighed = await db.product.findMany({ where: { organizationId: s.orgId, active: true, unit: "PER_KG" }, select: { id: true, name: true, pricePence: true, category: { select: { name: true } } }, orderBy: { name: "asc" } });
  const promo = id === "new" ? null : await db.promotion.findFirst({ where: { id, organizationId: s.orgId }, include: { items: true } });
  if (id !== "new" && !promo) notFound();
  return (
    <div>
      <PageHeader title={promo ? promo.name : "New offer"} />
      <PromotionForm promo={promo ? { ...promo, startsAt: promo.startsAt?.toISOString().slice(0, 10) ?? "", endsAt: promo.endsAt?.toISOString().slice(0, 10) ?? "" } : null}
        products={products.map((p) => ({ id: p.id, name: p.name, price: p.pricePence, category: p.category?.name ?? "Other" }))}
        weighed={weighed.map((p) => ({ id: p.id, name: p.name, price: p.pricePence, category: p.category?.name ?? "Other" }))} />
    </div>
  );
}
