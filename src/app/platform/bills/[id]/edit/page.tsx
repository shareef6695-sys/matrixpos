import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { billFormData } from "@/lib/server/hq-bill-form";
import { ymd } from "@/lib/server/hq-forms";
import { PageHeader } from "@/components/admin";
import { BillForm } from "@/components/hq/BooksForms";
import { saveBill } from "@/lib/server/actions/hq-books";
import { minorToInput } from "@/lib/hq/money";

export const metadata = { title: "Edit bill" };

export default async function EditBill({ params }: { params: Promise<{ id: string }> }) {
  await requireHq("accounts.edit");
  const { id } = await params;
  const b = await db.hqBill.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, payments: true } });
  if (!b || b.status === "VOID" || (!b.isExpense && b.payments.length)) notFound();
  const data = await billFormData(b.projectId);
  return (
    <div>
      <PageHeader title={`Edit ${b.isExpense ? "expense" : "bill"}`} />
      <BillForm action={saveBill} {...data} defaults={{
        id: b.id, projectId: b.projectId ?? undefined, isExpense: b.isExpense, supplierId: b.supplierId ?? undefined, payee: b.payee, reference: b.reference ?? undefined, date: ymd(b.date)!, dueDate: ymd(b.dueDate),
        currency: b.currency, perGbp: b.currency === "GBP" ? undefined : String(Number(b.perGbp)), notes: b.notes ?? undefined, bankAccountId: b.payments[0]?.bankAccountId,
        lines: b.lines.map((l) => ({ description: l.description, accountId: l.accountId, amount: minorToInput(l.netMinor, b.currency), taxPct: Number(l.taxPct) ? String(Number(l.taxPct)) : "" })),
      }} />
    </div>
  );
}
