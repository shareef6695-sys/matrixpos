import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { documentFormData, linesForForm, ymd } from "@/lib/server/hq-forms";
import { PageHeader } from "@/components/admin";
import { DocumentForm } from "@/components/hq/DocumentForm";
import { saveQuote } from "@/lib/server/actions/hq-sales";

export const metadata = { title: "Edit quote" };

export default async function EditQuote({ params }: { params: Promise<{ id: string }> }) {
  await requireHq("quotes.edit");
  const { id } = await params;
  const q = await db.hqQuote.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!q) notFound();
  if (q.status !== "DRAFT" && q.status !== "SENT") redirect(`/platform/quotes/${id}`);
  const data = await documentFormData();
  return (
    <div>
      <PageHeader title={`Edit quote ${q.number}`} sub={q.status === "SENT" ? "This quote has been sent. The client's link shows your changes straight away." : undefined} />
      <DocumentForm kind="quote" action={saveQuote} {...data} defaults={{
        id: q.id, clientId: q.clientId, title: q.title ?? "", currency: q.currency, perGbp: q.currency === "GBP" ? "" : String(Number(q.perGbp)),
        issueDate: ymd(q.issueDate)!, endDate: ymd(q.expiryDate), notes: q.notes ?? "", terms: q.terms ?? "", lines: linesForForm(q.lines, q.currency),
      }} />
    </div>
  );
}
