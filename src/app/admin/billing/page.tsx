import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader, Stat } from "@/components/admin";
import { accessFor, planById, STATUS_LABEL } from "@/lib/plans";
import { platformEmails } from "@/lib/server/billing";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { PlanPicker } from "./PlanPicker";

export const metadata = { title: "Plan & billing" };

const limit = (n: number, max: number | null) => (max == null ? `${n} (unlimited)` : `${n} of ${max}`);

export default async function Billing() {
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
      {access.message && (
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
      {s.role === "OWNER" ? <PlanPicker current={org.plan} paying={org.billingStatus === "ACTIVE"} /> : <p className="text-sm text-slate-600">Ask the business owner to choose a plan.</p>}
      <div className="card mt-8 text-sm text-slate-600">
        <h2 className="mb-2 font-semibold text-slate-900">How payment works</h2>
        <p>When you choose a plan, we send an invoice to your email. Pay by bank transfer and your account is marked as paid. Prices exclude VAT.</p>
        {contact && <p className="mt-2">Questions about billing? Email <a className="font-semibold text-brand-700" href={`mailto:${contact}`}>{contact}</a>.</p>}
      </div>
    </div>
  );
}
