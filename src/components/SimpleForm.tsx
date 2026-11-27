"use client";
import { useActionState } from "react";
import type { FormState } from "@/lib/server/actions/auth";

/** A small form bound to a server action, with the action's error or success message under it. */
export function SimpleForm({ action, children, submit, className = "space-y-4", hideOnOk = false }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submit: string;
  className?: string;
  hideOnOk?: boolean;
}) {
  const [state, act, pending] = useActionState(action, undefined);
  if (hideOnOk && state?.ok) return <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{state.ok}</p>;
  return (
    <form action={act} className={className}>
      {children}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn-primary w-full py-3" disabled={pending}>{pending ? "Please wait…" : submit}</button>
    </form>
  );
}
