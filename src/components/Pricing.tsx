"use client";
import { useState } from "react";
import Link from "next/link";
import { PLANS, TRIAL_DAYS, type Plan } from "@/lib/plans";

const pounds = (pence: number) => `£${(pence / 100).toFixed(pence % 100 ? 2 : 0)}`;

/** Plan cards with a monthly / yearly switch. `action` renders the button under each plan. */
export function PricingCards({ current, action, vat = false }: { current?: string; action?: (p: Plan, yearly: boolean) => React.ReactNode; vat?: boolean }) {
  const [yearly, setYearly] = useState(false);
  return (
    <div>
      <div className="mb-8 flex items-center justify-center gap-3 text-sm">
        <button type="button" onClick={() => setYearly(false)} className={`rounded-full px-4 py-1.5 font-semibold ${!yearly ? "bg-slate-900 text-white" : "text-slate-600"}`}>Monthly</button>
        <button type="button" onClick={() => setYearly(true)} className={`rounded-full px-4 py-1.5 font-semibold ${yearly ? "bg-slate-900 text-white" : "text-slate-600"}`}>
          Yearly <span className={`ml-1 ${yearly ? "text-brand-100" : "text-brand-700"}`}>2 months free</span>
        </button>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => (
          <div key={p.id} className={`card relative flex flex-col ${p.popular ? "ring-2 ring-brand-600" : ""}`}>
            {p.popular && <span className="badge absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-600 px-3 py-1 text-white">Most popular</span>}
            {current === p.id && <span className="badge absolute right-4 top-4 bg-slate-900 text-white">Your plan</span>}
            <h3 className="text-lg font-bold text-slate-900">{p.name}</h3>
            <p className="text-sm text-slate-500">{p.tagline}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold tracking-tight text-slate-900">{pounds(yearly ? Math.round(p.yearlyPence / 12) : p.monthlyPence)}</span>
              <span className="text-sm text-slate-500">/month{vat ? " + VAT" : ""}</span>
            </div>
            <p className="mt-1 h-5 text-xs text-slate-500">{yearly ? `${pounds(p.yearlyPence)} billed yearly` : "Billed monthly, cancel any time"}</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-700">
              {p.highlights.map((h) => (
                <li key={h} className="flex gap-2"><span className="text-brand-600">✓</span>{h}</li>
              ))}
            </ul>
            <div className="mt-6">
              {action ? action(p, yearly) : (
                <Link href={`/signup?plan=${p.id}`} className={`${p.popular ? "btn-primary" : "btn-secondary"} w-full py-3`}>Start {TRIAL_DAYS}-day free trial</Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
