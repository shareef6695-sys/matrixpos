import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { catchUpBooks } from "@/lib/server/hq-books";
import { hmrcConfigured, hmrcConnected, hmrcSandbox, hqSettings, rollingTurnover } from "@/lib/server/hq-vat";
import { disconnectHmrc, loadObligations, prepareVatReturn, saveVatSettings } from "@/lib/server/actions/hq-tax";
import { PageHeader } from "@/components/admin";
import { BooksNav } from "@/components/hq/BooksNav";
import { ActionForm } from "@/components/FormMessage";
import { HmrcObligations } from "@/components/hq/VatForms";
import { VAT_THRESHOLD_PENCE, vatQuarters } from "@/lib/hq/books";
import { formatGBP } from "@/lib/pos/money";
import { seller } from "@/lib/legal";
import { fmtDate, londonDate } from "@/lib/dates";

export const metadata = { title: "VAT" };

const HMRC_MSG: Record<string, [string, string]> = {
  connected: ["Connected to HMRC.", "text-emerald-700"],
  cancelled: ["HMRC sign-in was cancelled.", "text-amber-700"],
  expired: ["That HMRC sign-in had expired. Try again.", "text-red-600"],
  failed: ["HMRC didn't accept the sign-in. Try again.", "text-red-600"],
  denied: ["Only the owner can connect HMRC, once HMRC_CLIENT_ID and HMRC_CLIENT_SECRET are set.", "text-red-600"],
};

export default async function Vat({ searchParams }: { searchParams: Promise<{ hmrc?: string; error?: string }> }) {
  const h = await requireHq("accounts.view");
  const sp = await searchParams;
  await catchUpBooks();
  const today = londonDate();
  const [s, turnover, returns, connected] = await Promise.all([hqSettings(), rollingTurnover(today), db.hqVatReturn.findMany({ orderBy: { periodStart: "desc" } }), hmrcConnected()]);
  const charging = seller().chargeVat;
  const from = s?.vatRegisteredFrom ? londonDate(s.vatRegisteredFrom) : null;
  const quarters = from && s?.vatStaggerMonth ? vatQuarters(from, s.vatStaggerMonth as 1 | 2 | 3, today).reverse() : [];
  const byPeriod = new Map(returns.map((r) => [`${londonDate(r.periodStart)}|${londonDate(r.periodEnd)}`, r]));
  const pct = Math.min(100, Math.round((turnover / VAT_THRESHOLD_PENCE) * 100));
  const edit = h.can("accounts.edit");
  const msg = sp.hmrc ? HMRC_MSG[sp.hmrc] : undefined;
  return (
    <div>
      <PageHeader title="VAT" sub="Registration, quarterly returns from the books, and filing with HMRC through Making Tax Digital." />
      <BooksNav current="/platform/accounts/vat" />
      {sp.error && <p className="mb-4 text-sm text-red-600">{sp.error}</p>}
      {msg && <p className={`mb-4 text-sm ${msg[1]}`}>{msg[0]}</p>}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-1 font-semibold">VAT threshold</h2>
          <p className="mb-3 text-sm text-slate-600">Sales in the last 12 months: <b>{formatGBP(turnover)}</b> of the {formatGBP(VAT_THRESHOLD_PENCE)} registration threshold.</p>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-violet-600"}`} style={{ width: `${pct}%` }} /></div>
          <p className="mt-3 text-xs text-slate-500">
            {from ? "You're registered, so this is for reference." : pct >= 100
              ? "You've passed the threshold. You must register with HMRC within 30 days of the end of the month you went over."
              : "If sales in any 12 months go over the threshold, you must register within 30 days. You must also register straight away if you expect to go over it in the next 30 days alone."}
            {" "}Counts all income in the books except bank interest.
          </p>
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold">Registration</h2>
          {edit ? (
            <ActionForm action={saveVatSettings} className="space-y-3" submit="Save">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label">Registered for VAT from</label><input type="date" name="vatRegisteredFrom" className="input" defaultValue={from ?? ""} /></div>
                <div>
                  <label className="label">VAT quarters end in</label>
                  <select name="vatStaggerMonth" className="input" defaultValue={s?.vatStaggerMonth ?? ""}>
                    <option value="">Choose…</option>
                    <option value="1">Jan, Apr, Jul, Oct</option><option value="2">Feb, May, Aug, Nov</option><option value="3">Mar, Jun, Sep, Dec</option>
                  </select>
                </div>
                <div className="sm:col-span-2"><label className="label">VAT number</label><input name="hmrcVrn" className="input" defaultValue={s?.hmrcVrn ?? ""} placeholder="GB123456789" /></div>
              </div>
              <p className="text-xs text-slate-500">Leave the date blank while you aren&apos;t registered. Documents dated before it never carry VAT.</p>
            </ActionForm>
          ) : <p className="text-sm">{from ? `Registered from ${fmtDate(from)}.` : "Not registered for VAT."}</p>}
          <div className={`mt-4 rounded-lg p-3 text-xs ${from && !charging ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}>
            {charging
              ? <>VAT is switched on for invoices and MatrixPOS billing (number {seller().vatNumber}).</>
              : <>VAT isn&apos;t being charged yet. {from ? "To start, " : "Once registered, "}set <code>CHARGE_VAT=true</code> and <code>INVOICE_VAT_NUMBER</code> in Vercel (Settings → Environment Variables) and redeploy. That also adds VAT to MatrixPOS plans, and puts the VAT number on every invoice.</>}
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Making Tax Digital</h2>
          {connected && <span className="badge bg-emerald-100 text-emerald-800">Connected{hmrcSandbox() ? " to HMRC's test service" : ""}{s?.hmrcConnectedAt ? ` since ${fmtDate(s.hmrcConnectedAt)}` : ""}</span>}
        </div>
        {!hmrcConfigured() ? (
          <p className="text-sm text-slate-600">To file returns straight to HMRC, register Matrix HQ as an app on the HMRC Developer Hub, then set <code>HMRC_CLIENT_ID</code>, <code>HMRC_CLIENT_SECRET</code> and <code>HMRC_ENV</code> (<code>sandbox</code> or <code>production</code>) in Vercel. The redirect address to give HMRC is <code>/api/hmrc/callback</code> on this site. Until then, work out each return here and file it through your accountant or HMRC&apos;s own service.</p>
        ) : !connected ? (
          h.role === "OWNER"
            ? <div className="text-sm"><p className="mb-3 text-slate-600">Sign in with the Government Gateway account for Matrix Infotech&apos;s VAT, and agree to let Matrix HQ read and file your returns.</p><a href="/api/hmrc/connect" className="btn-primary">Connect to HMRC</a></div>
            : <p className="text-sm text-slate-600">The owner can connect HMRC.</p>
        ) : (
          <div className="space-y-4">
            {s?.hmrcVrn ? <HmrcObligations load={loadObligations} prepare={prepareVatReturn} known={Object.fromEntries([...byPeriod].map(([k, r]) => [k, r.id]))} /> : <p className="text-sm text-amber-700">Save your VAT number above to see your returns.</p>}
            {h.role === "OWNER" && <form action={disconnectHmrc}><button className="text-xs text-red-600">Disconnect HMRC</button></form>}
          </div>
        )}
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-0 font-semibold">Returns</h2>
        <table className="table">
          <thead><tr><th>Period</th><th>Due</th><th className="text-right">To pay (or back)</th><th>Status</th><th /></tr></thead>
          <tbody>
            {quarters.map((q) => {
              const r = byPeriod.get(`${q.start}|${q.end}`);
              const late = !r?.filedAt && q.due < today;
              return (
                <tr key={q.start}>
                  <td>{fmtDate(q.start)} to {fmtDate(q.end)}</td>
                  <td className={late ? "font-semibold text-red-700" : ""}>{fmtDate(q.due)}</td>
                  <td className="text-right tabular-nums">{r ? formatGBP(r.box5) : ""}</td>
                  <td>{r?.status === "FILED" ? <span className="badge bg-emerald-100 text-emerald-800">Filed{r.submittedToHmrc ? " with HMRC" : ""}</span> : q.end >= today ? <span className="badge bg-slate-100 text-slate-700">In progress</span> : r ? <span className="badge bg-amber-100 text-amber-800">Draft</span> : <span className="badge bg-amber-100 text-amber-800">To do</span>}</td>
                  <td className="text-right">
                    {r ? <Link href={`/platform/accounts/vat/${r.id}`} className="text-violet-700">Open</Link> : edit && (
                      <form action={prepareVatReturn}>
                        <input type="hidden" name="start" value={q.start} /><input type="hidden" name="end" value={q.end} /><input type="hidden" name="due" value={q.due} />
                        <button className="text-violet-700">{q.end >= today ? "Preview" : "Work it out"}</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {returns.filter((r) => !quarters.some((q) => byPeriod.get(`${q.start}|${q.end}`)?.id === r.id)).map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.periodStart)} to {fmtDate(r.periodEnd)}</td><td>{fmtDate(r.dueDate)}</td><td className="text-right tabular-nums">{formatGBP(r.box5)}</td>
                <td><span className={`badge ${r.status === "FILED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{r.status === "FILED" ? "Filed" : "Draft"}</span></td>
                <td className="text-right"><Link href={`/platform/accounts/vat/${r.id}`} className="text-violet-700">Open</Link></td>
              </tr>
            ))}
            {!quarters.length && !returns.length && <tr><td colSpan={5} className="text-slate-500">Save your registration date and quarters above to see your returns.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
