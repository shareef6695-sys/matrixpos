"use client";
import { useEffect, useRef, useState } from "react";
import { cashSuggestions, tenderStatus, type TenderMethod } from "@/lib/pos/pricing";
import { formatGBP, parseGBP } from "@/lib/pos/money";
import { Keypad, Modal } from "./ui";
import type { Bootstrap, Tender } from "./types";

type Step = { kind: "choose" } | { kind: "cash" } | { kind: "card" } | { kind: "terminal"; provider: TenderMethod; ref?: string; message: string };

const PROVIDER_PATH: Partial<Record<TenderMethod, string>> = { STRIPE_TERMINAL: "stripe_terminal", SUMUP: "sumup", DOJO: "dojo" };

/** Handles cash, keyed card, integrated terminals and split tender. Calls onComplete once fully paid. */
export function PaymentModal({ boot, totalPence, saleId, refund, onCancel, onComplete }: {
  boot: Bootstrap; totalPence: number; saleId: string; refund?: boolean;
  onCancel: () => void; onComplete: (tenders: Tender[], changePence: number) => void;
}) {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [entry, setEntry] = useState("");
  const [cardRef, setCardRef] = useState("");
  const status = tenderStatus(totalPence, tenders);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const s = boot.settings;

  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  const add = (t: Tender) => {
    const next = [...tenders, t];
    setTenders(next);
    setEntry("");
    setCardRef("");
    const st = tenderStatus(totalPence, next);
    if (st.complete) onComplete(next, st.changePence);
    else setStep({ kind: "choose" });
  };

  const amountEntered = () => {
    const p = entry ? parseGBP(entry.includes(".") ? entry : (parseInt(entry, 10) / 100).toFixed(2)) : status.remaining;
    return p ?? 0;
  };

  async function startTerminal(provider: TenderMethod) {
    const amount = status.remaining;
    setStep({ kind: "terminal", provider, message: "Sending to card machine…" });
    try {
      const res = await fetch(`/api/payments/${PROVIDER_PATH[provider]}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", amountPence: amount, saleId }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setStep({ kind: "terminal", provider, ref: body.ref, message: "Customer to tap, insert or swipe card" });
      poll.current = setInterval(async () => {
        const r = await fetch(`/api/payments/${PROVIDER_PATH[provider]}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", ref: body.ref }) }).then((x) => x.json()).catch(() => null);
        if (!r || r.state === "PENDING") return;
        clearInterval(poll.current!);
        if (r.state === "APPROVED") add({ method: provider, amountPence: amount, reference: r.reference ?? body.ref });
        else setStep({ kind: "terminal", provider, message: r.state === "DECLINED" ? `Declined${r.message ? `: ${r.message}` : ""}` : "Cancelled on the card machine" });
      }, 2000);
    } catch (e) {
      setStep({ kind: "terminal", provider, message: e instanceof Error ? e.message : "Card machine error" });
    }
  }

  async function cancelTerminal() {
    if (poll.current) clearInterval(poll.current);
    if (step.kind === "terminal" && step.ref)
      await fetch(`/api/payments/${PROVIDER_PATH[step.provider]}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", ref: step.ref }) }).catch(() => {});
    setStep({ kind: "choose" });
  }

  const due = (
    <div className="mb-4 grid grid-cols-2 gap-3 text-center">
      <div className="rounded-xl bg-slate-100 p-3"><div className="text-xs uppercase text-slate-500">{refund ? "Refund" : "Total"}</div><div className="text-2xl font-bold tabular-nums">{formatGBP(Math.abs(totalPence))}</div></div>
      <div className="rounded-xl bg-brand-50 p-3"><div className="text-xs uppercase text-brand-700">{refund ? "To give back" : "Left to pay"}</div><div className="text-2xl font-bold tabular-nums text-brand-800">{formatGBP(status.remaining)}</div></div>
    </div>
  );

  return (
    <Modal title={refund ? "Refund" : "Take payment"} onClose={tenders.length ? undefined : onCancel}>
      {due}
      {tenders.length > 0 && (
        <ul className="mb-4 space-y-1 text-sm">
          {tenders.map((t, i) => <li key={i} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5"><span>{t.method.replace("_", " ").toLowerCase()}</span><span className="font-semibold">{formatGBP(t.amountPence)}</span></li>)}
        </ul>
      )}

      {step.kind === "choose" && (
        <div className="grid grid-cols-2 gap-3">
          {s.enableCash && <PayBtn onClick={() => setStep({ kind: "cash" })} label="Cash" icon="💷" />}
          {s.enableCardManual && <PayBtn onClick={() => setStep({ kind: "card" })} label="Card" sub="separate card machine" icon="💳" />}
          {!refund && s.enableStripeTerminal && boot.register.hasStripe && <PayBtn onClick={() => startTerminal("STRIPE_TERMINAL")} label="Stripe" sub="card reader" icon="💳" />}
          {!refund && s.enableSumUp && boot.register.hasSumUp && <PayBtn onClick={() => startTerminal("SUMUP")} label="SumUp" sub="card reader" icon="💳" />}
          {!refund && s.enableDojo && boot.register.hasDojo && <PayBtn onClick={() => startTerminal("DOJO")} label="Dojo" sub="card machine" icon="💳" />}
          {!refund && <PayBtn onClick={() => { const a = amountEntered(); setEntry(""); add({ method: "VOUCHER", amountPence: Math.min(a, status.remaining) }); }} label="Voucher" sub="full amount left" icon="🎟️" />}
          {tenders.length > 0 && <button onClick={onCancel} className="btn-danger col-span-2 h-12">Abandon payment</button>}
        </div>
      )}

      {step.kind === "cash" && (
        <div>
          {!refund && (
            <div className="mb-3 grid grid-cols-4 gap-2">
              {cashSuggestions(status.remaining).map((v) => (
                <button key={v} onClick={() => add({ method: "CASH", amountPence: v })} className="h-12 rounded-xl bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-200">{formatGBP(v)}</button>
              ))}
            </div>
          )}
          <p className="mb-2 text-center text-sm text-slate-500">{refund ? "Cash to give back" : "Cash handed over"} (leave empty for exact)</p>
          <Keypad value={entry} onChange={setEntry} decimal maxLength={8} onEnter={() => { const a = amountEntered(); if (a > 0) add({ method: "CASH", amountPence: refund ? Math.min(a, status.remaining) : a }); }} enterLabel={entry ? `Cash ${formatGBP(amountEntered())}` : "Exact cash"} />
          <button onClick={() => setStep({ kind: "choose" })} className="btn-secondary mt-2 w-full">Back</button>
        </div>
      )}

      {step.kind === "card" && (
        <div className="space-y-3">
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Key <b>{formatGBP(amountEntered())}</b> into the card machine{refund ? " as a refund" : ""}. Only confirm once it shows <b>Approved</b>.
          </p>
          <Keypad value={entry} onChange={setEntry} decimal maxLength={8} />
          <input className="input" placeholder="Auth code or last 4 digits (optional)" value={cardRef} onChange={(e) => setCardRef(e.target.value.slice(0, 20))} />
          <button className="btn-primary h-14 w-full text-lg" onClick={() => { const a = Math.min(amountEntered(), status.remaining); if (a > 0) add({ method: "CARD_MANUAL", amountPence: a, reference: cardRef || null }); }}>Card approved</button>
          <button onClick={() => setStep({ kind: "choose" })} className="btn-secondary w-full">Back</button>
        </div>
      )}

      {step.kind === "terminal" && (
        <div className="space-y-4 text-center">
          <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-brand-100 text-4xl leading-[4rem]">💳</div>
          <p className="text-lg font-semibold">{step.message}</p>
          <button onClick={cancelTerminal} className="btn-secondary w-full">{step.ref ? "Cancel on card machine" : "Back"}</button>
        </div>
      )}
    </Modal>
  );
}

function PayBtn({ label, sub, icon, onClick }: { label: string; sub?: string; icon: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-24 flex-col items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200 hover:ring-brand-500 active:bg-slate-50">
      <span className="text-2xl">{icon}</span>
      <span className="font-bold">{label}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </button>
  );
}
