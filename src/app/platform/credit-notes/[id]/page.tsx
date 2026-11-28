import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { HqDocument } from "@/components/hq/HqDocument";
import { ErrorBanner } from "@/components/hq/ui";
import { formatMoney } from "@/lib/hq/money";
import { DocActions } from "@/components/hq/DocActions";
import { phoneOf } from "@/lib/server/hq-pdf";
import { shareText } from "@/lib/hq/share";
import { seller } from "@/lib/legal";
import { appUrl } from "@/lib/server/email";
import { voidCreditNote } from "@/lib/server/actions/hq-books";

export const metadata = { title: "Credit note" };

export default async function CreditNote({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const h = await requireHq("invoices.view");
  const { id } = await params;
  const { error } = await searchParams;
  const c = await db.hqCreditNote.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, invoice: { include: { client: { include: { contacts: true } } } } } });
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
          <DocActions pdf={`/api/hq/pdf/credit/${c.id}`} whatsapp={c.status === "VOID" ? null : {
            phone: phoneOf(c.invoice.client),
            text: shareText({ kind: "credit", number: c.number, to: c.invoice.billToName ?? c.invoice.client.name, amount: formatMoney(c.totalMinor, c.currency), from: seller().name, link: `${await appUrl()}/api/doc/credit/${c.publicToken}` }),
          }} />
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
