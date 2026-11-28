import { requireHq } from "@/lib/server/hq";
import { documentFormData } from "@/lib/server/hq-forms";
import { PageHeader } from "@/components/admin";
import { DocumentForm } from "@/components/hq/DocumentForm";
import { saveQuote } from "@/lib/server/actions/hq-sales";
import { londonDate } from "@/lib/dates";

export const metadata = { title: "New quote" };

export default async function NewQuote({ searchParams }: { searchParams: Promise<{ client?: string; lead?: string }> }) {
  await requireHq("quotes.edit");
  const { client, lead } = await searchParams;
  const data = await documentFormData();
  return (
    <div>
      <PageHeader title="New quote" />
      <DocumentForm kind="quote" action={saveQuote} {...data} defaults={{ clientId: client, leadId: lead, issueDate: londonDate() }} />
    </div>
  );
}
