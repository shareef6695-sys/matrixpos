import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { billTo } from "@/lib/server/hq-docs";
import { HqDocument } from "@/components/hq/HqDocument";
import { PrintButton } from "@/components/PrintButton";
import { respondToQuote } from "@/lib/server/actions/hq-sales";
import { fmtDate } from "@/lib/dates";

export const metadata = { title: "Quote", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export const dynamic = "force-dynamic";

/** A client's view of a quote, where they can accept or decline it. Drafts are never shown. */
export default async function PublicQuote({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) notFound();
  const q = await db.hqQuote.findUnique({ where: { publicToken: token }, include: { lines: { orderBy: { position: "asc" } }, client: { include: { contacts: true } } } });
  if (!q || q.status === "DRAFT") notFound();
  const to = billTo(q.client);
  const expired = !!q.expiryDate && q.expiryDate.getTime() + 86_400_000 < Date.now();
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="text-sm">
          {q.status === "SENT" && !expired && "Please review this quote and let us know."}
          {q.status === "SENT" && expired && `This quote expired on ${fmtDate(q.expiryDate!)}. Please get in touch for an updated one.`}
          {(q.status === "ACCEPTED" || q.status === "INVOICED") && <b className="text-emerald-700">Accepted{q.respondedAt ? ` on ${fmtDate(q.respondedAt)}` : ""}. Thank you!</b>}
          {q.status === "DECLINED" && <b className="text-slate-700">Declined{q.respondedAt ? ` on ${fmtDate(q.respondedAt)}` : ""}.</b>}
        </div>
        <div className="flex gap-2">
          {q.status === "SENT" && !expired && (
            <form action={respondToQuote} className="flex gap-2">
              <input type="hidden" name="token" value={token} />
              <button name="answer" value="decline" className="btn-secondary">Decline</button>
              <button name="answer" value="accept" className="btn-primary">Accept quote</button>
            </form>
          )}
          <a href={`/api/doc/quote/${token}?download=1`} className="btn-secondary">Download PDF</a>
          <PrintButton label="Print" />
        </div>
      </div>
      <HqDocument d={{
        kind: "quote", number: q.number, title: q.title, status: q.status, currency: q.currency, issueDate: q.issueDate, endDate: q.expiryDate,
        subtotalMinor: q.subtotalMinor, discountMinor: q.discountMinor, taxMinor: q.taxMinor, totalMinor: q.totalMinor, notes: q.notes, terms: q.terms,
        billToName: to.billToName, billToAddress: to.billToAddress, billToEmail: to.billToEmail, billToVatNumber: to.billToVatNumber, lines: q.lines,
      }} />
    </main>
  );
}
