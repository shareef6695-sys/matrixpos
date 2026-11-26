"use client";
import { useActionState } from "react";
import type { FormState } from "@/lib/server/actions/auth";

/** Wraps a server action form and shows its error / success message. */
export function ActionForm({ action, children, className, submit, reset = false }: {
  action: (s: FormState, f: FormData) => Promise<FormState>; children: React.ReactNode; className?: string; submit: string; reset?: boolean;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className={className} key={reset && state?.ok ? state.ok + Math.random() : undefined}>
      {children}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : submit}</button>
    </form>
  );
}
