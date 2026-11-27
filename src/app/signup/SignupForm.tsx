"use client";
import { useActionState } from "react";
import { signup } from "@/lib/server/actions/auth";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";
import { formatGBP } from "@/lib/pos/money";

export function SignupForm({ plan = "BUSINESS" }: { plan?: string }) {
  const [state, action, pending] = useActionState(signup, undefined);
  const f = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="label" htmlFor={name}>{label}</label><input className="input" id={name} name={name} {...props} /></div>
  );
  return (
    <form action={action} className="space-y-4">
      {f("business", "Business name", { required: true, placeholder: "e.g. Patel's Convenience Ltd" })}
      <div className="grid grid-cols-2 gap-3">
        {f("storeName", "First shop", { required: true, placeholder: "High Street" })}
        {f("postcode", "Postcode", { placeholder: "E1 6AN" })}
      </div>
      {f("vatNumber", "VAT number (optional)", { placeholder: "GB123456789" })}
      {f("name", "Your name", { required: true, autoComplete: "name" })}
      {f("email", "Email", { required: true, type: "email", autoComplete: "email" })}
      <div className="grid grid-cols-2 gap-3">
        {f("password", "Password", { required: true, type: "password", minLength: 8, autoComplete: "new-password" })}
        {f("pin", "Till PIN", { required: true, inputMode: "numeric", pattern: "\\d{4,6}", placeholder: "4-6 digits" })}
      </div>
      <div>
        <label className="label" htmlFor="plan">Plan</label>
        <select id="plan" name="plan" className="input" defaultValue={plan}>
          {PLANS.map((p) => <option key={p.id} value={p.id}>{p.name}: {formatGBP(p.monthlyPence)}/month + VAT</option>)}
        </select>
        <p className="mt-1 text-xs text-slate-500">Free for {TRIAL_DAYS} days, no card needed. You can change plan at any time.</p>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full py-3" disabled={pending}>{pending ? "Creating…" : `Start ${TRIAL_DAYS}-day free trial`}</button>
    </form>
  );
}
