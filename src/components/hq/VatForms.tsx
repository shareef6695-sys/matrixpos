"use client";
import { useActionState, useEffect, useState } from "react";
import type { FormState } from "@/lib/server/actions/auth";

/** What HMRC's fraud prevention rules ask the browser for. The device ID stays in this browser. */
function clientInfo() {
  let deviceId = "";
  try {
    deviceId = localStorage.getItem("hq.deviceId") ?? "";
    if (!deviceId) { deviceId = crypto.randomUUID(); localStorage.setItem("hq.deviceId", deviceId); }
  } catch { deviceId = crypto.randomUUID(); }
  return JSON.stringify({
    deviceId, userAgent: navigator.userAgent, timezoneOffset: new Date().getTimezoneOffset(),
    screens: [{ width: screen.width, height: screen.height, scale: window.devicePixelRatio || 1, depth: screen.colorDepth }],
    window: { width: window.innerWidth, height: window.innerHeight },
  });
}

function useClientInfo() {
  const [v, setV] = useState("");
  useEffect(() => setV(clientInfo()), []);
  return v;
}

interface Obligation { periodKey: string; start: string; end: string; due: string; status: "O" | "F"; received?: string }
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Fetches HMRC's list of returns, each with a button to work it out from the books. */
export function HmrcObligations({ load, prepare, known }: {
  load: (client: string) => Promise<{ error?: string; obligations?: Obligation[] }>;
  prepare: (f: FormData) => Promise<void>;
  known: Record<string, string>; // "start|end" → return id
}) {
  const [state, setState] = useState<{ error?: string; obligations?: Obligation[] }>();
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <button type="button" className="btn-secondary" disabled={busy} onClick={async () => { setBusy(true); setState(await load(clientInfo()).catch(() => ({ error: "Couldn't reach HMRC. Try again." }))); setBusy(false); }}>
        {busy ? "Asking HMRC…" : state ? "Refresh from HMRC" : "Get my returns from HMRC"}
      </button>
      {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state?.obligations && (
        <table className="table mt-3 text-sm">
          <thead><tr><th>Period</th><th>Due</th><th>Status</th><th /></tr></thead>
          <tbody>
            {state.obligations.map((o) => {
              const id = known[`${o.start}|${o.end}`];
              return (
                <tr key={o.periodKey}>
                  <td>{fmt(o.start)} to {fmt(o.end)}</td><td>{fmt(o.due)}</td>
                  <td>{o.status === "F" ? <span className="badge bg-emerald-100 text-emerald-800">Received{o.received ? ` ${fmt(o.received)}` : ""}</span> : <span className="badge bg-amber-100 text-amber-800">Open</span>}</td>
                  <td className="text-right">
                    {o.status === "O" && (
                      <form action={prepare}>
                        <input type="hidden" name="start" value={o.start} /><input type="hidden" name="end" value={o.end} />
                        <input type="hidden" name="due" value={o.due} /><input type="hidden" name="periodKey" value={o.periodKey} />
                        <button className="text-violet-700">{id ? "Open the draft" : "Work it out"}</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {!state.obligations.length && <tr><td colSpan={4} className="text-slate-500">HMRC has no returns for you in the last year.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The declaration and the button that files a return, by sending it to HMRC or recording it as filed elsewhere. */
export function VatFileForm({ action, id, canHmrc, sandbox }: { action: (s: FormState, f: FormData) => Promise<FormState>; id: string; canHmrc: boolean; sandbox: boolean }) {
  const [state, run, pending] = useActionState(action, undefined);
  const client = useClientInfo();
  const [mode, setMode] = useState(canHmrc ? "hmrc" : "record");
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="client" value={client} />
      <fieldset className="space-y-1 text-sm">
        <label className="flex items-start gap-2"><input type="radio" name="mode" value="hmrc" checked={mode === "hmrc"} onChange={() => setMode("hmrc")} disabled={!canHmrc} className="mt-1" />
          <span>Send it to HMRC now{sandbox ? " (HMRC's test service)" : ""}{!canHmrc && <span className="block text-xs text-slate-500">Connect to HMRC above, then choose this period from HMRC&apos;s list.</span>}</span></label>
        <label className="flex items-start gap-2"><input type="radio" name="mode" value="record" checked={mode === "record"} onChange={() => setMode("record")} className="mt-1" />
          <span>I&apos;ve filed it another way (say, through my accountant). Just record it here.</span></label>
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-1" />
        <span>When I submit this VAT information, I am making a legal declaration that the information is true and complete. A false declaration can result in prosecution.</span>
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn-primary" disabled={pending || (mode === "hmrc" && !client)}>{pending ? "Filing…" : mode === "hmrc" ? "Submit to HMRC" : "Mark as filed"}</button>
    </form>
  );
}
