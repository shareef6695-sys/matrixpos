"use client";
import { useActionState } from "react";
import { signup } from "@/lib/server/actions/auth";

export function SignupForm() {
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
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full py-3" disabled={pending}>{pending ? "Creating…" : "Create shop"}</button>
    </form>
  );
}
