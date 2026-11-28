import { requireHq } from "@/lib/server/hq";
import { documentFormData } from "@/lib/server/hq-forms";
import { PageHeader } from "@/components/admin";
import { DocumentForm } from "@/components/hq/DocumentForm";
import { RecurringFields } from "@/components/hq/RecurringFields";
import { saveRecurring } from "@/lib/server/actions/hq-books";
import { londonDate } from "@/lib/dates";

export const metadata = { title: "New repeating invoice" };

export default async function NewRecurring({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireHq("invoices.edit");
  const { client } = await searchParams;
  const data = await documentFormData();
  return (
    <div>
      <PageHeader title="New repeating invoice" sub="The first invoice is made on the date you choose, then one every period after." />
      <DocumentForm kind="recurring" action={saveRecurring} {...data} defaults={{ clientId: client, issueDate: londonDate() }} extra={<RecurringFields />} />
    </div>
  );
}
