import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/admin";
import { ProductForm } from "../ProductForm";

export const metadata = { title: "Add product" };

export default async function NewProduct() {
  const s = await requireAdmin();
  const [categories, suppliers] = await Promise.all([
    db.category.findMany({ where: { organizationId: s.orgId }, orderBy: { name: "asc" } }),
    db.supplier.findMany({ where: { organizationId: s.orgId }, orderBy: { name: "asc" } }),
  ]);
  return <div><PageHeader title="Add product" /><ProductForm categories={categories} suppliers={suppliers} /></div>;
}
