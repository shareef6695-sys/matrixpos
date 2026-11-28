import { requireHq } from "@/lib/server/hq";
import { documentFormData } from "@/lib/server/hq-forms";
import { PageHeader } from "@/components/admin";
import { DocumentForm } from "@/components/hq/DocumentForm";
import { saveInvoice } from "@/lib/server/actions/hq-sales";
import { londonDate } from "@/lib/dates";

export const metadata = { title: "New invoice" };

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ client?: string; project?: string }> }) {
  await requireHq("invoices.edit");
  const { client, project } = await searchParams;
  const data = await documentFormData();
  return (
    <div>
      <PageHeader title="New invoice" sub="Saved as a draft. Nothing goes to the client until you press Email or Mark as sent." />
      <DocumentForm kind="invoice" action={saveInvoice} {...data} defaults={{ clientId: client, projectId: project, issueDate: londonDate() }} />
    </div>
  );
}
