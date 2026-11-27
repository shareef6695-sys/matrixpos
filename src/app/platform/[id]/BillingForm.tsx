"use client";
import { useActionState } from "react";
import { platformUpdateShop } from "@/lib/server/actions/billing";
import { PLANS } from "@/lib/plans";

const day = (d: string | null) => (d ? d.slice(0, 10) : "");

export function BillingForm({ org }: { org: { id: string; plan: string; billingStatus: string; billingCycle: string; trialEndsAt: string | null; paidUntil: string | null; billingNote: string | null } }) {
  const [state, action, pending] = useActionState(platformUpdateShop, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={org.id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Plan</label>
          <select name="plan" className="input" defaultValue={org.plan}>{PLANS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div>
        <div>
          <label className="label">Billing</label>
          <select name="billingCycle" className="input" defaultValue={org.billingCycle}><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select>
        </div>
        <div>
          <label className="label">Status</label>
          <select name="billingStatus" className="input" defaultValue={org.billingStatus}>
            <option value="TRIAL">Trial</option><option value="ACTIVE">Paying</option><option value="PAST_DUE">Overdue (still works)</option>
            <option value="SUSPENDED">Suspended (locked out)</option><option value="CANCELLED">Cancelled (locked out)</option>
          </select>
        </div>
        <div><label className="label">Trial ends</label><input type="date" name="trialEndsAt" className="input" defaultValue={day(org.trialEndsAt)} /></div>
        <div><label className="label">Paid until</label><input type="date" name="paidUntil" className="input" defaultValue={day(org.paidUntil)} /></div>
      </div>
      <div><label className="label">Private notes (invoices, contact, anything)</label><textarea name="billingNote" rows={3} className="input" defaultValue={org.billingNote ?? ""} /></div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
