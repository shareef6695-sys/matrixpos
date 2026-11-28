import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { HqDocument } from "@/components/hq/HqDocument";
import { ErrorBanner } from "@/components/hq/ui";
import { PrintButton } from "@/components/PrintButton";
import { voidCreditNote } from "@/lib/server/actions/hq-books";

export const metadata = { title: "Credit note" };

export default async function CreditNote({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const h = await requireHq("invoices.view");
  const { id } = await params;
  const { error } = await searchParams;
  const c = await db.hqCreditNote.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, invoice: true } });
  if (!c) notFound();
  const inv = c.invoice;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link href={`/platform/invoices/${inv.id}`} className="text-sm text-slate-500">← Invoice {inv.number}</Link>
          <h1 className="text-2xl font-bold tracking-tight">Credit note {c.number}{c.status === "VOID" && <span className="badge ml-2 bg-slate-200 text-slate-600">Void</span>}</h1>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          {h.can("invoices.edit") && c.status !== "VOID" && <form action={voidCreditNote}><input type="hidden" name="id" value={c.id} /><button className="btn-secondary text-red-700">Void</button></form>}
        </div>
      </div>
      <ErrorBanner error={error} />
      <HqDocument d={{
        kind: "credit", against: inv.number, number: c.number, title: c.reason, status: c.status, currency: c.currency, issueDate: c.date, endDate: null,
        subtotalMinor: c.subtotalMinor, discountMinor: c.discountMinor, taxMinor: c.taxMinor, totalMinor: c.totalMinor,
        notes: null, terms: null, billToName: inv.billToName ?? "", billToAddress: inv.billToAddress, billToEmail: inv.billToEmail, billToVatNumber: inv.billToVatNumber, lines: c.lines,
      }} />
    </div>
  );
}
