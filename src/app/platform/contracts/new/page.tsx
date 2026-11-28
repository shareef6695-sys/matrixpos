import { requireHq } from "@/lib/server/hq";
import { contractFormData } from "@/lib/server/hq-contract-form";
import { PageHeader } from "@/components/admin";
import { ActionForm } from "@/components/FormMessage";
import { ContractFields } from "@/components/hq/ContractFields";
import { saveContract } from "@/lib/server/actions/hq-projects";

export const metadata = { title: "New contract" };

export default async function NewContract({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireHq("contracts.edit");
  const { client } = await searchParams;
  const data = await contractFormData();
  return (
    <div>
      <PageHeader title="New contract" sub="To bill it every month or year, set up a repeating invoice for the client too, then link it here." />
      <div className="card max-w-3xl"><ActionForm action={saveContract} className="space-y-4" submit="Save contract"><ContractFields {...data} defaultClient={client} /></ActionForm></div>
    </div>
  );
}
