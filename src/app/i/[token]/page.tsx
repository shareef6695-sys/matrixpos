import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { HqDocument } from "@/components/hq/HqDocument";
import { PrintButton } from "@/components/PrintButton";

// The link's secret is the only key, so the page is never indexed and never passes its address on to other sites.
export const metadata = { title: "Invoice", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export const dynamic = "force-dynamic";

/** A client's view of a Matrix Infotech invoice, from the link in their email. Drafts are never shown. */
export default async function PublicInvoice({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) notFound();
  const inv = await db.hqInvoice.findUnique({ where: { publicToken: token }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!inv || inv.status === "DRAFT") notFound();
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-3xl justify-end print:hidden"><PrintButton /></div>
      <HqDocument d={{
        kind: "invoice", number: inv.number, title: inv.title, status: inv.status, currency: inv.currency, issueDate: inv.issueDate, endDate: inv.dueDate,
        subtotalMinor: inv.subtotalMinor, discountMinor: inv.discountMinor, taxMinor: inv.taxMinor, totalMinor: inv.totalMinor, paidMinor: inv.paidMinor,
        notes: inv.notes, terms: inv.terms, billToName: inv.billToName ?? "", billToAddress: inv.billToAddress, billToEmail: inv.billToEmail, billToVatNumber: inv.billToVatNumber, lines: inv.lines,
      }} />
    </main>
  );
}
