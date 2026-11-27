"use client";
import { useActionState } from "react";
import { PricingCards } from "@/components/Pricing";
import { requestPlan } from "@/lib/server/actions/billing";

export function PlanPicker({ current, paying }: { current: string; paying: boolean }) {
  const [state, action, pending] = useActionState(requestPlan, undefined);
  return (
    <div>
      {state?.ok && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{state.ok}</div>}
      {state?.error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{state.error}</div>}
      <PricingCards
        current={current}
        action={(p, yearly) => (
          <form action={action}>
            <input type="hidden" name="plan" value={p.id} />
            <input type="hidden" name="cycle" value={yearly ? "YEARLY" : "MONTHLY"} />
            <button className={`${p.id === current ? "btn-primary" : "btn-secondary"} w-full py-3`} disabled={pending}>
              {p.id === current ? (paying ? "Change billing" : `Pay for ${p.name}`) : `Switch to ${p.name}`}
            </button>
          </form>
        )}
      />
    </div>
  );
}
