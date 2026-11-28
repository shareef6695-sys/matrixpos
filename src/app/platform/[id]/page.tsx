import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { requirePlatformAdmin } from "@/lib/server/billing";
import { Stat } from "@/components/admin";
import { formatGBP } from "@/lib/pos/money";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { displayStatus, planById } from "@/lib/plans";
import { platformQuick, platformInvoice } from "@/lib/server/actions/billing";
import { platformDeleteNow, platformResetMfa } from "@/lib/server/actions/account";
import { CLOSURE_DAYS } from "@/lib/server/account";
import { StatusBadge } from "../StatusBadge";
import { seller } from "@/lib/legal";
import { BillingForm } from "./BillingForm";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export default async function PlatformShop({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ confirm?: string }> }) {
  // Checked here as well as in the layout: Next.js can render a page without re-running its layout.
  await requirePlatformAdmin();
  const { id } = await params;
  const { confirm } = await searchParams;
  const org = await db.organization.findUnique({
    where: { id },
    include: {
      stores: { include: { registers: { orderBy: { number: "asc" } } }, orderBy: { name: "asc" } },
      users: { orderBy: [{ role: "desc" }, { name: "asc" }], select: { id: true, name: true, email: true, role: true, active: true, emailVerifiedAt: true, totpEnabledAt: true } },
      _count: { select: { products: true, customers: true } },
    },
  });
  if (!org) notFound();
  const since30 = new Date(Date.now() - 30 * DAY);
  const [s30, allTime, last, events] = await Promise.all([
    db.sale.aggregate({ where: { organizationId: id, kind: "SALE", status: "COMPLETED", createdAt: { gte: since30 } }, _sum: { totalPence: true }, _count: true }),
    db.sale.aggregate({ where: { organizationId: id, kind: "SALE", status: "COMPLETED" }, _sum: { totalPence: true }, _count: true }),
    db.sale.findFirst({ where: { organizationId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.auditLog.findMany({ where: { organizationId: id, action: { startsWith: "platform." } }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const invoices = await db.subscriptionInvoice.findMany({ where: { organizationId: id }, orderBy: { issuedAt: "desc" }, take: 30 });
  const requests = await db.auditLog.findMany({ where: { organizationId: id, action: "billing.request" }, orderBy: { createdAt: "desc" }, take: 5, include: { user: { select: { email: true } } } });
  const status = displayStatus(org);
  const plan = planById(org.plan);
  const quick = (op: string, label: string, cls = "btn-secondary") => (
    <form action={platformQuick}><input type="hidden" name="id" value={org.id} /><input type="hidden" name="op" value={op} /><button className={cls}>{label}</button></form>
  );

  const invAct = (op: string, label: string, invoiceId = "", cls = "btn-secondary") => (
    <form action={platformInvoice}>
      <input type="hidden" name="orgId" value={org.id} /><input type="hidden" name="op" value={op} /><input type="hidden" name="invoiceId" value={invoiceId} />
      <button className={cls}>{label}</button>
    </form>
  );

  return (
    <div>
      <Link href="/platform" className="text-sm font-semibold text-slate-600 hover:text-slate-900">← All customers</Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
        <StatusBadge status={status} />
        <span className="badge bg-slate-100">{plan.name} · {org.billingCycle.toLowerCase()}</span>
      </div>

      {org.closureRequestedAt && (
        <form action={platformDeleteNow} className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <span className="flex-1">
            The owner closed this account on {fmtDate(org.closureRequestedAt)}. It will be deleted automatically on {fmtDate(new Date(org.closureRequestedAt.getTime() + CLOSURE_DAYS * DAY))}.
            {confirm && <b className="block">The name didn&apos;t match.</b>}
          </span>
          <input type="hidden" name="id" value={org.id} />
          <input name="confirmName" className="input w-56 py-1.5" placeholder={`Type "${org.name}"`} required aria-label="Business name to confirm" />
          <button className="btn-danger">Delete all data now</button>
        </form>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Signed up" value={fmtDate(org.createdAt)} sub={org.trialEndsAt ? `Trial ends ${fmtDate(org.trialEndsAt)}` : undefined} />
        <Stat label="Takings, 30 days" value={formatGBP(s30._sum.totalPence ?? 0)} sub={`${s30._count} sales`} />
        <Stat label="Takings, all time" value={formatGBP(allTime._sum.totalPence ?? 0)} sub={`${allTime._count} sales`} />
        <Stat label="Last sale" value={last ? fmtDate(last.createdAt) : "Never"} sub={`${org._count.products} products · ${org._count.customers} loyalty customers`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card">
            <h2 className="mb-3 font-semibold">Subscription</h2>
            <p className="mb-3 text-sm text-slate-600">
              {org.stripeSubscriptionId ? "Pays by card through Stripe. The plan and paid-until date update automatically." : "Pays by invoice. Mark payments here when they arrive."}
              {org.stripeCustomerId && <> <a href={`https://dashboard.stripe.com/customers/${org.stripeCustomerId}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-700">Open in Stripe</a></>}
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              {invAct("send", `Send invoice (${formatGBP(org.billingCycle === "YEARLY" ? plan.yearlyPence : plan.monthlyPence)}${seller().chargeVat ? " + VAT" : ""})`)}
              {quick("paid", `Mark paid for ${org.billingCycle === "YEARLY" ? "a year" : "a month"} (${formatGBP(org.billingCycle === "YEARLY" ? plan.yearlyPence : plan.monthlyPence)}${seller().chargeVat ? " + VAT" : ""})`, "btn-primary")}
              {quick("extend7", "Extend trial 7 days")}
              {quick("extend14", "Extend trial 14 days")}
              {status === "SUSPENDED" || status === "CANCELLED" ? quick("reactivate", "Reactivate") : quick("suspend", "Suspend", "btn-danger")}
            </div>
            <BillingForm org={{ id: org.id, plan: org.plan, billingStatus: org.billingStatus, billingCycle: org.billingCycle, trialEndsAt: org.trialEndsAt?.toISOString() ?? null, paidUntil: org.paidUntil?.toISOString() ?? null, billingNote: org.billingNote }} />
          </div>
          <div className="card p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
              <h2 className="font-semibold">Invoices</h2>
              {org.stripeCustomerId && invAct("sync", "Fetch card invoices from Stripe", "", "text-xs font-semibold text-brand-700 hover:underline")}
            </div>
            {invoices.length === 0 ? <p className="px-5 pb-4 pt-2 text-sm text-slate-500">No invoices yet.</p> : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Number</th><th>Date</th><th>Status</th><th className="text-right">Total</th><th /></tr></thead>
                  <tbody>
                    {invoices.map((i) => (
                      <tr key={i.id}>
                        <td><a href={`/invoice/${i.id}`} className="font-mono text-brand-700 hover:underline">{i.number}</a><div className="text-xs text-slate-500">{i.method === "CARD" ? "card" : "bank transfer"}{i.emailedAt ? " · emailed" : ""}</div></td>
                        <td className="whitespace-nowrap">{fmtDate(i.issuedAt)}</td>
                        <td>{i.status === "PAID" ? `Paid ${i.paidAt ? fmtDate(i.paidAt) : ""}` : i.status === "VOID" ? "Cancelled" : `Due ${i.dueAt ? fmtDate(i.dueAt) : ""}`}</td>
                        <td className="text-right tabular-nums">{formatGBP(i.totalPence)}</td>
                        <td>
                          <div className="flex flex-wrap justify-end gap-2 text-xs">
                            {i.status === "OPEN" && i.method === "BANK" && invAct("paid", "Mark paid", i.id, "font-semibold text-emerald-700 hover:underline")}
                            {invAct("resend", "Email again", i.id, "font-semibold text-slate-600 hover:underline")}
                            {i.status === "OPEN" && i.method === "BANK" && invAct("void", "Cancel", i.id, "font-semibold text-red-700 hover:underline")}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">Shops and tills</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {org.stores.map((s) => (
                <li key={s.id} className="py-2">
                  <span className="font-medium">{s.name}</span> <span className="text-slate-500">({s.code})</span>
                  <span className="text-slate-500"> · {[s.addressLine1, s.town, s.postcode].filter(Boolean).join(", ") || "No address"}</span>
                  <div className="text-xs text-slate-500">{s.registers.map((r) => r.name).join(", ")}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-3 font-semibold">People</h2>
            <ul className="space-y-2 text-sm">
              {org.users.map((u) => (
                <li key={u.id} className={u.active ? "" : "opacity-50"}>
                  <span className="font-medium">{u.name}</span> <span className="text-xs text-slate-500">{u.role.toLowerCase()}</span>
                  {u.email && (
                    <div className="text-xs">
                      <a href={`mailto:${u.email}`} className="text-brand-700">{u.email}</a>{" "}
                      {u.emailVerifiedAt ? <span className="text-emerald-700">confirmed</span> : <span className="text-amber-700">not confirmed</span>}
                    </div>
                  )}
                  {u.totpEnabledAt && (
                    <form action={platformResetMfa} className="text-xs text-slate-500">
                      Two-step sign-in on. <input type="hidden" name="userId" value={u.id} /><button className="font-semibold text-red-700 underline">Switch off (lost phone)</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">Plan requests</h2>
            {requests.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
              <ul className="space-y-2 text-sm">
                {requests.map((r) => {
                  const d = r.detail as { plan?: string; cycle?: string };
                  return <li key={r.id}>{planById(d.plan ?? "").name}, {String(d.cycle ?? "").toLowerCase()}<div className="text-xs text-slate-500">{fmtDateTime(r.createdAt)}{r.user?.email ? ` · ${r.user.email}` : ""}</div></li>;
                })}
              </ul>
            )}
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">Your changes</h2>
            {events.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
              <ul className="space-y-1 text-sm">
                {events.map((e) => <li key={e.id}>{e.action.replace("platform.", "")} <span className="text-xs text-slate-500">{fmtDateTime(e.createdAt)}</span></li>)}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
