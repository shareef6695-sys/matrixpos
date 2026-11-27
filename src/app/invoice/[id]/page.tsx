import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/server/db";
import { getAdmin } from "@/lib/server/auth";
import { isPlatformAdmin } from "@/lib/server/billing";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Invoice", robots: { index: false } };
export const dynamic = "force-dynamic";

/** One subscription invoice. Visible to the business's owners and managers, and to the platform owner. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getAdmin();
  if (!s) redirect(`/login?next=/invoice/${id}`);
  const inv = await db.subscriptionInvoice.findUnique({ where: { id } });
  const platform = await isPlatformAdmin();
  if (!inv || (inv.organizationId !== s.orgId && !platform)) notFound();
  const back = platform && inv.organizationId !== s.orgId ? `/platform/${inv.organizationId}` : "/admin/billing";
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={back} className="text-sm font-semibold text-slate-600 hover:text-slate-900">← Back</Link>
        <div className="flex gap-2">
          {inv.stripePdfUrl && <a href={inv.stripePdfUrl} className="btn-secondary" target="_blank" rel="noreferrer">Stripe PDF</a>}
          <PrintButton />
        </div>
      </div>
      <InvoiceDocument inv={inv} />
    </main>
  );
}
