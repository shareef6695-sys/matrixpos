import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader, Stat } from "@/components/admin";
import { accessFor, planById, STATUS_LABEL } from "@/lib/plans";
import { platformEmails } from "@/lib/server/billing";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { PlanPicker } from "./PlanPicker";
import { stripeBillingEnabled } from "@/lib/server/stripe-billing";
import { CloseAccount } from "./CloseAccount";
import { cancelClosure } from "@/lib/server/actions/account";
import { CLOSURE_DAYS } from "@/lib/server/account";

export const metadata = { title: "Plan & billing" };

const limit = (n: number, max: number | null) => (max == null ? `${n} (unlimited)` : `${n} of ${max}`);

export default async function Billing({ searchParams }: { searchParams: Promise<{ card?: string }> }) {
  const { card } = await searchParams;
  const s = await requireAdmin("MANAGER", { allowLocked: true });
  const [org, stores, registers, staff, lastRequest] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: s.orgId } }),
    db.store.count({ where: { organizationId: s.orgId } }),
    db.register.count({ where: { store: { organizationId: s.orgId } } }),
    db.user.count({ where: { organizationId: s.orgId, active: true } }),
    db.auditLog.findFirst({ where: { organizationId: s.orgId, action: "billing.request" }, orderBy: { createdAt: "desc" } }),
  ]);
  const plan = planById(org.plan);
  const access = accessFor(org);
  const contact = process.env.BILLING_CONTACT_EMAIL || platformEmails()[0];
  const req = lastRequest?.detail as { plan?: string; cycle?: string } | null;

  return (
    <div className="max-w-6xl">
      <PageHeader title="Plan & billing" sub="Your MatrixPOS subscription" />
      {card === "success" && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <strong>Thank you, your card payment went through.</strong> Your plan updates within a minute. Receipts are emailed to you by Stripe.
        </div>
      )}
      {card === "portal-error" && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">The card management page couldn&apos;t open. Please try again in a minute.</div>}
      {card === "cancelled" && <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Card payment cancelled. Nothing was charged.</div>}
      {org.closureRequestedAt && (
        <form action={cancelClosure} className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <span><strong>Your account is closing.</strong> All data will be deleted on {fmtDate(new Date(org.closureRequestedAt.getTime() + CLOSURE_DAYS * 86_400_000))}.</span>
          {s.role === "OWNER" && <button className="btn-primary">Keep my account</button>}
        </form>
      )}
      {!org.closureRequestedAt && access.message && (
        <div className={`mb-6 rounded-lg border p-4 text-sm ${access.allowed ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-900"}`}>
          <strong>{access.message}</strong> Choose a plan below and we'll email you an invoice.
        </div>
      )}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Plan" value={plan.name} sub={`${org.billingCycle === "YEARLY" ? "Yearly" : "Monthly"} billing`} />
        <Stat
          label="Status"
          value={STATUS_LABEL[access.status]}
          sub={access.status === "TRIAL" ? `Trial ends ${fmtDate(org.trialEndsAt!)}` : org.paidUntil ? `Paid until ${fmtDate(org.paidUntil)}` : undefined}
        />
        <Stat label="Shops" value={limit(stores, plan.maxStores)} />
        <Stat label="Tills / staff" value={`${registers} / ${staff}`} sub={`Plan allows ${plan.maxRegisters ?? "unlimited"} tills, ${plan.maxStaff ?? "unlimited"} staff`} />
      </div>
      {req?.plan && (
        <p className="mb-6 text-sm text-slate-600">
          You asked for {planById(req.plan).name} ({String(req.cycle ?? "").toLowerCase()}) on {fmtDateTime(lastRequest!.createdAt)}. We'll be in touch with an invoice.
        </p>
      )}
      {s.role === "OWNER" ? <PlanPicker current={org.plan} paying={org.billingStatus === "ACTIVE"} card={stripeBillingEnabled()} subscribed={!!org.stripeSubscriptionId} /> : <p className="text-sm text-slate-600">Ask the business owner to choose a plan.</p>}
      <div className="card mt-8 text-sm text-slate-600">
        <h2 className="mb-2 font-semibold text-slate-900">How payment works</h2>
        {stripeBillingEnabled() ? (
          <p>Pay by debit or credit card and your plan renews automatically, with a VAT invoice emailed each time. Card payments are handled securely by Stripe. We never see your card number. You can also ask for an invoice and pay by bank transfer. Prices exclude VAT.</p>
        ) : (
          <p>When you choose a plan, we send an invoice to your email. Pay by bank transfer and your account is marked as paid. Prices exclude VAT.</p>
        )}
        {contact && <p className="mt-2">Questions about billing? Email <a className="font-semibold text-brand-700" href={`mailto:${contact}`}>{contact}</a>.</p>}
      </div>
      {s.role === "OWNER" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="card text-sm text-slate-600">
            <h2 className="mb-2 font-semibold text-slate-900">Download your data</h2>
            <p className="mb-4">One file with everything your business holds in MatrixPOS: products, stock, sales, customers, staff, suppliers and accounts. Use it for your records or to move to another system.</p>
            <a href="/api/admin/export-all" className="btn-secondary">Download all data (JSON)</a>
          </div>
          {!org.closureRequestedAt && (
            <div className="card text-sm text-slate-600">
              <h2 className="mb-2 font-semibold text-slate-900">Close your account</h2>
              <p className="mb-4">Stops your subscription and permanently deletes your business data after {CLOSURE_DAYS} days. Download your data first if you need it. You may need to keep sales and VAT records for 6 years for HMRC.</p>
              <CloseAccount name={org.name} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
