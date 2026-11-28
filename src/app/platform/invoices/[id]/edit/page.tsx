import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { documentFormData, linesForForm, ymd } from "@/lib/server/hq-forms";
import { PageHeader } from "@/components/admin";
import { DocumentForm } from "@/components/hq/DocumentForm";
import { saveInvoice } from "@/lib/server/actions/hq-sales";

export const metadata = { title: "Edit invoice" };

export default async function EditInvoice({ params }: { params: Promise<{ id: string }> }) {
  await requireHq("invoices.edit");
  const { id } = await params;
  const inv = await db.hqInvoice.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, _count: { select: { payments: true } } } });
  if (!inv) notFound();
  if ((inv.status !== "DRAFT" && inv.status !== "SENT") || inv._count.payments) redirect(`/platform/invoices/${id}`);
  const data = await documentFormData(inv.projectId);
  return (
    <div>
      <PageHeader title={`Edit invoice ${inv.number}`} sub={inv.status === "SENT" ? "This invoice has been sent. The client's link shows your changes straight away, so let them know." : undefined} />
      <DocumentForm kind="invoice" action={saveInvoice} {...data} defaults={{
        id: inv.id, clientId: inv.clientId, projectId: inv.projectId ?? undefined, title: inv.title ?? "", currency: inv.currency, perGbp: inv.currency === "GBP" ? "" : String(Number(inv.perGbp)),
        issueDate: ymd(inv.issueDate)!, endDate: ymd(inv.dueDate), notes: inv.notes ?? "", terms: inv.terms ?? "", lines: linesForForm(inv.lines, inv.currency),
      }} />
    </div>
  );
}
