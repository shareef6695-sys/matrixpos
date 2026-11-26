import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/admin";
import { ImportForm } from "./ImportForm";

export const metadata = { title: "Import products" };

export default async function ImportPage() {
  const s = await requireAdmin();
  const stores = await db.store.findMany({ where: { organizationId: s.orgId }, orderBy: { name: "asc" } });
  return (
    <div>
      <PageHeader title="Import products from CSV" sub="Export from Excel, your old till, or your wholesaler's price file as CSV." />
      <div className="grid gap-6 lg:grid-cols-2">
        <ImportForm stores={stores.map((s) => ({ id: s.id, name: s.name }))} />
        <div className="card text-sm">
          <h2 className="mb-2 font-semibold">Columns</h2>
          <p className="mb-2 text-slate-600">The first row must be headers. Only <b>name</b> and <b>price</b> are required. Rows whose barcode or SKU already exists are updated.</p>
          <table className="table text-xs">
            <tbody>
              {[["name", "Product name"], ["price", "Selling price inc. VAT, e.g. 1.25"], ["barcode", "EAN-13 or other barcode"], ["sku", "Your code"], ["plu", "Short code for scale labels"], ["vat", "20, 5, 0 or exempt"], ["unit", "each or kg"], ["category", "Created if new"], ["cost", "Cost price ex. VAT"], ["min_age", "16 or 18"], ["stock", "Quantity in the chosen store (kg for weighed)"], ["reorder_level", "Low stock alert level"]].map(([c, d]) => <tr key={c}><td className="font-mono">{c}</td><td>{d}</td></tr>)}
            </tbody>
          </table>
          <a className="btn-secondary mt-3" href="data:text/csv;charset=utf-8,name,price,barcode,vat,unit,category,stock%0AMilk 4 pint,1.55,5000000000001,0,each,Dairy,24%0ABananas,0.99,,0,kg,Fruit,10" download="matrixpos-template.csv">Download template</a>
        </div>
      </div>
    </div>
  );
}
