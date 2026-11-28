import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/admin";
import { formatGBP, formatWeight } from "@/lib/pos/money";
import { VAT_LETTERS } from "@/lib/pos/vat";
import { fmtDateTime } from "@/lib/dates";
import { voidSale } from "@/lib/server/actions/admin";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Sale" };

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireAdmin();
  const { id } = await params;
  const sale = await db.sale.findFirst({
    where: { id, organizationId: s.orgId },
    include: { lines: true, payments: true, vatLines: true, store: true, register: true, user: true, customer: true },
  });
  if (!sale) notFound();
  const org = await db.organization.findUnique({ where: { id: s.orgId } });
  const original = sale.originalSaleId ? await db.sale.findFirst({ where: { id: sale.originalSaleId, organizationId: s.orgId }, select: { id: true, receiptNo: true } }) : null;
  const refunds = await db.sale.findMany({ where: { originalSaleId: sale.id, organizationId: s.orgId }, select: { id: true, receiptNo: true, totalPence: true } });

  return (
    <div>
      <PageHeader title={`Receipt ${sale.receiptNo}`} sub={`${fmtDateTime(sale.createdAt)} · ${sale.store.name} · ${sale.register.name} · ${sale.user.name}`}
        actions={<><PrintButton />{sale.status === "COMPLETED" && <form action={voidSale}><input type="hidden" name="id" value={sale.id} /><button className="btn-danger">Void sale</button></form>}</>} />
      {sale.status === "VOIDED" && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">This sale was voided and is excluded from reports.</div>}
      {original && <p className="mb-4 text-sm">Refund of <Link className="text-brand-700" href={`/admin/sales/${original.id}`}>{original.receiptNo}</Link></p>}
      {refunds.length > 0 && <p className="mb-4 text-sm">Refunds: {refunds.map((r) => <Link key={r.id} className="mr-2 text-brand-700" href={`/admin/sales/${r.id}`}>{r.receiptNo} ({formatGBP(r.totalPence)})</Link>)}</p>}
      <div className="print-area card max-w-xl font-mono text-sm">
        <div className="text-center"><b>{org?.name}</b><div>{sale.store.name}</div>{org?.vatNumber && <div>VAT No. {org.vatNumber}</div>}</div>
        <hr className="my-2 border-dashed" />
        {sale.lines.map((l) => (
          <div key={l.id} className="mb-1">
            <div className="flex justify-between"><span>{l.name}</span><span>{formatGBP(l.grossPence)} {VAT_LETTERS[l.vatCode]}</span></div>
            {(l.unit === "PER_KG" || Math.abs(l.quantity) > 1) && <div className="pl-2 text-xs text-slate-500">{l.unit === "PER_KG" ? `${formatWeight(Math.abs(l.quantity))} @ ${formatGBP(l.unitPricePence)}/kg` : `${Math.abs(l.quantity)} @ ${formatGBP(l.unitPricePence)}`}</div>}
            {l.discountPence !== 0 && <div className="flex justify-between pl-2 text-xs text-emerald-700"><span>{l.promotionName ?? "Discount"}</span><span>-{formatGBP(Math.abs(l.discountPence))}</span></div>}
          </div>
        ))}
        <hr className="my-2 border-dashed" />
        <div className="flex justify-between font-bold"><span>TOTAL</span><span>{formatGBP(sale.totalPence)}</span></div>
        {sale.payments.map((p) => <div key={p.id} className="flex justify-between"><span>{p.method.replace("_", " ").toLowerCase()} {p.reference}</span><span>{formatGBP(p.amountPence)}</span></div>)}
        {sale.changePence > 0 && <div className="flex justify-between"><span>Change</span><span>{formatGBP(sale.changePence)}</span></div>}
        <hr className="my-2 border-dashed" />
        {sale.vatLines.map((v) => <div key={v.vatCode} className="flex justify-between text-xs"><span>{VAT_LETTERS[v.vatCode]} {v.vatCode === "EXEMPT" ? "Exempt" : `${v.vatRate / 100}%`} on {formatGBP(v.grossPence - v.vatPence)}</span><span>VAT {formatGBP(v.vatPence)}</span></div>)}
        {sale.customer && <div className="mt-2 text-xs">Customer: {sale.customer.name}</div>}
        {sale.ageVerified && <div className="text-xs">Age verified at till</div>}
      </div>
    </div>
  );
}
