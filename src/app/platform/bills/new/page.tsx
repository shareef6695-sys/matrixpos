import { requireHq } from "@/lib/server/hq";
import { billFormData } from "@/lib/server/hq-bill-form";
import { PageHeader } from "@/components/admin";
import { BillForm } from "@/components/hq/BooksForms";
import { saveBill } from "@/lib/server/actions/hq-books";
import { londonDate } from "@/lib/dates";

export const metadata = { title: "New bill" };

export default async function NewBill({ searchParams }: { searchParams: Promise<{ expense?: string; supplier?: string; project?: string }> }) {
  await requireHq("accounts.edit");
  const { expense, supplier, project } = await searchParams;
  const data = await billFormData();
  const isExpense = expense === "1";
  return (
    <div>
      <PageHeader title={isExpense ? "Add an expense" : "Add a bill"} sub={isExpense ? "Something already paid: it goes in the books and comes out of the bank account you choose." : "A supplier's invoice to pay later. Record the payment when you pay it, or match it from the bank statement."} />
      <BillForm action={saveBill} {...data} defaults={{ isExpense, date: londonDate(), supplierId: supplier, projectId: project, currency: data.suppliers.find((s) => s.id === supplier)?.currency }} />
    </div>
  );
}
