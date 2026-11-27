"use client";
import { useActionState } from "react";
import { PricingCards } from "@/components/Pricing";
import { requestPlan, payByCard, openCardPortal } from "@/lib/server/actions/billing";

export function PlanPicker({ current, paying, card, subscribed }: { current: string; paying: boolean; card: boolean; subscribed: boolean }) {
  const [state, action, pending] = useActionState(requestPlan, undefined);
  const [cardState, cardAction, cardPending] = useActionState(payByCard, undefined);
  const msg = cardState ?? state;
  const busy = pending || cardPending;
  return (
    <div>
      {msg?.ok && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg.ok}</div>}
      {msg?.error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{msg.error}</div>}
      <PricingCards
        current={current}
        action={(p, yearly) => {
          const fields = (
            <>
              <input type="hidden" name="plan" value={p.id} />
              <input type="hidden" name="cycle" value={yearly ? "YEARLY" : "MONTHLY"} />
            </>
          );
          const isCurrent = p.id === current;
          if (card && subscribed) {
            return isCurrent ? (
              <div className="space-y-2">
                <form action={openCardPortal}><button className="btn-primary w-full py-3">Manage card & invoices</button></form>
                <form action={cardAction}>{fields}<button className="w-full text-center text-xs font-semibold text-slate-600 hover:text-slate-900" disabled={busy}>Switch to {yearly ? "yearly" : "monthly"} billing</button></form>
              </div>
            ) : (
              <form action={cardAction}>{fields}<button className="btn-secondary w-full py-3" disabled={busy}>{cardPending ? "Switching…" : `Switch to ${p.name}`}</button></form>
            );
          }
          return (
            <div className="space-y-2">
              {card && (
                <form action={cardAction}>{fields}<button className={`${isCurrent ? "btn-primary" : "btn-secondary"} w-full py-3`} disabled={busy}>{cardPending ? "Opening secure checkout…" : `Pay by card for ${p.name}`}</button></form>
              )}
              <form action={action}>
                {fields}
                <button className={card ? "w-full text-center text-xs font-semibold text-slate-600 hover:text-slate-900" : `${isCurrent ? "btn-primary" : "btn-secondary"} w-full py-3`} disabled={busy}>
                  {card ? "or request an invoice" : isCurrent ? (paying ? "Change billing" : `Pay for ${p.name}`) : `Switch to ${p.name}`}
                </button>
              </form>
            </div>
          );
        }}
      />
    </div>
  );
}
