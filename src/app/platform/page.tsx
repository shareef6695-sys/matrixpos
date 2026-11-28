import Link from "next/link";
import { platformShops, planRequests, type ShopRow } from "@/lib/server/platform";
import { Stat } from "@/components/admin";
import { formatGBP } from "@/lib/pos/money";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { planById } from "@/lib/plans";
import { StatusBadge } from "./StatusBadge";
import { stripeMode } from "@/lib/server/stripe-billing";
import { setupChecks } from "@/lib/server/setup-check";
import { requirePlatformAdmin } from "@/lib/server/billing";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

const FILTERS: [string, string, (r: ShopRow, now: number) => boolean][] = [
  ["all", "All", () => true],
  ["trial", "On trial", (r) => r.status === "TRIAL"],
  ["ending", "Trial ends in 7 days", (r, now) => r.status === "TRIAL" && !!r.trialEndsAt && r.trialEndsAt.getTime() < now + 7 * DAY],
  ["ended", "Trial ended", (r) => r.status === "TRIAL_ENDED"],
  ["paying", "Paying", (r) => r.status === "ACTIVE"],
  ["overdue", "Overdue", (r) => r.status === "PAST_DUE"],
  ["suspended", "Suspended or cancelled", (r) => r.status === "SUSPENDED" || r.status === "CANCELLED"],
  ["idle", "Not trading (7 days)", (r) => !r.trading],
];

export default async function PlatformHome({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  // Checked here as well as in the layout: Next.js can render a page without re-running its layout.
  await requirePlatformAdmin();
  const { f = "all", q = "" } = await searchParams;
  const [all, requests] = await Promise.all([platformShops(), planRequests()]);
  const shops = all.filter((r) => !r.internal);
  const now = Date.now();

  const count = (fn: (r: ShopRow) => boolean) => shops.filter(fn).length;
  const mrr = shops.reduce((n, r) => n + r.mrr, 0);
  const new7 = count((r) => r.createdAt.getTime() > now - 7 * DAY);
  const new30 = count((r) => r.createdAt.getTime() > now - 30 * DAY);
  const trading = count((r) => r.trading);
  const paying = count((r) => r.status === "ACTIVE" || r.status === "PAST_DUE");
  const trials = count((r) => r.status === "TRIAL");
  const ending = count((r) => FILTERS[2][2](r, now));
  const takings30 = shops.reduce((n, r) => n + r.takings30, 0);
  const shopsTotal = shops.reduce((n, r) => n + r.stores, 0);

  // Sign-ups per week for the last 12 weeks
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = now - (11 - i) * 7 * DAY;
    const start = end - 7 * DAY;
    return { label: fmtDate(new Date(start)).slice(0, 6), n: count((r) => r.createdAt.getTime() > start && r.createdAt.getTime() <= end) };
  });
  const maxWeek = Math.max(1, ...weeks.map((w) => w.n));

  const byPlan = ["STARTER", "BUSINESS", "ENTERPRISE"].map((p) => ({ p, n: count((r) => r.plan === p && (r.status === "ACTIVE" || r.status === "PAST_DUE")) }));

  const filter = FILTERS.find(([k]) => k === f) ?? FILTERS[0];
  const needle = q.trim().toLowerCase();
  const rows = (filter[0] === "all" ? all : shops).filter((r) => filter[2](r, now)).filter((r) =>
    !needle || [r.name, r.owner?.email, r.owner?.name, r.town, r.slug].some((v) => v?.toLowerCase().includes(needle)),
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">All customers</h1>
        <p className="mt-1 text-sm text-slate-500">Every business that has signed up to MatrixPOS. Your own shop and the demo shop are left out of the numbers.</p>
        <p className="mt-1 text-xs text-slate-500">
          Card payments: {stripeMode() === "live" ? <b className="text-emerald-700">Stripe live mode</b> : stripeMode() === "test" ? <b className="text-amber-700">Stripe TEST mode (no real money)</b> : <b>off (invoices only)</b>}
        </p>
      </div>

      {setupChecks().some((c) => !c.ok) && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="mb-2 font-semibold">Finish setting up (Vercel → Settings → Environment Variables, then redeploy)</div>
          <ul className="space-y-1">
            {setupChecks().filter((c) => !c.ok).map((c) => <li key={c.label}><b>{c.label}:</b> {c.fix}</li>)}
          </ul>
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Monthly revenue" value={formatGBP(mrr)} sub={`${paying} paying · ${formatGBP(mrr * 12)} a year`} />
        <Stat label="Businesses" value={String(shops.length)} sub={`${shopsTotal} shops · ${new7} new this week, ${new30} this month`} />
        <Stat label="On trial" value={String(trials)} sub={`${ending} ending in the next 7 days`} />
        <Stat label="Trading this week" value={`${trading} of ${shops.length}`} sub={`${formatGBP(takings30)} taken through MatrixPOS in 30 days`} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-4 font-semibold">Sign-ups per week</h2>
          <div className="flex h-40 items-end gap-1.5" role="img" aria-label={`Sign-ups per week: ${weeks.map((w) => `${w.label} ${w.n}`).join(", ")}`}>
            {weeks.map((w) => (
              <div key={w.label} className="flex flex-1 flex-col items-center justify-end gap-1" title={`Week of ${w.label}: ${w.n}`}>
                <span className="text-xs tabular-nums text-slate-600">{w.n || ""}</span>
                <div className="w-full rounded-t bg-brand-600" style={{ height: `${(w.n / maxWeek) * 100}%`, minHeight: w.n ? 4 : 1, opacity: w.n ? 1 : 0.2 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1.5 text-[10px] text-slate-500">
            {weeks.map((w, i) => <span key={w.label} className="flex-1 text-center">{i % 2 === 0 ? w.label : ""}</span>)}
          </div>
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold">Paying by plan</h2>
          <ul className="space-y-2 text-sm">
            {byPlan.map(({ p, n }) => (
              <li key={p} className="flex justify-between"><span>{planById(p).name} <span className="text-slate-500">({formatGBP(planById(p).monthlyPence)})</span></span><span className="font-semibold tabular-nums">{n}</span></li>
            ))}
          </ul>
          <h2 className="mb-2 mt-5 font-semibold">Plan requests</h2>
          {requests.length === 0 ? <p className="text-sm text-slate-500">None in the last 30 days.</p> : (
            <ul className="space-y-2 text-sm">
              {requests.slice(0, 6).map((r) => {
                const d = r.detail as { plan?: string; cycle?: string };
                return (
                  <li key={r.id}>
                    <Link href={`/platform/${r.organization.id}`} className="font-medium text-brand-700 hover:underline">{r.organization.name}</Link>{" "}
                    wants {planById(d.plan ?? "").name} {String(d.cycle ?? "").toLowerCase()}
                    <div className="text-xs text-slate-500">{fmtDateTime(r.createdAt)}{r.user?.email ? ` · ${r.user.email}` : ""}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
          {FILTERS.map(([k, label, fn]) => (
            <Link key={k} href={`/platform?f=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`badge px-3 py-1.5 text-sm ${filter[0] === k ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-200"}`}>
              {label} <span className="ml-1 opacity-70">{(k === "all" ? all : shops).filter((r) => fn(r, now)).length}</span>
            </Link>
          ))}
          <form className="ml-auto">
            <input type="hidden" name="f" value={filter[0]} />
            <input name="q" defaultValue={q} placeholder="Search name, email, town" className="input w-56 py-1.5" />
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Business</th><th>Owner</th><th>Plan</th><th>Status</th><th>Signed up</th>
                <th className="text-right">Shops / tills</th><th className="text-right">Sales (30d)</th><th className="text-right">Takings (30d)</th><th>Last sale</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/platform/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.name}</Link>
                    {r.internal && <span className="badge ml-2 bg-violet-100 text-violet-800">Yours</span>}
                    {r.town && <div className="text-xs text-slate-500">{r.town}</div>}
                  </td>
                  <td><div>{r.owner?.name}</div><div className="text-xs text-slate-500">{r.owner?.email}</div></td>
                  <td>{planById(r.plan).name}<div className="text-xs text-slate-500">{r.cycle.toLowerCase()} · {r.card ? "card" : "invoice"}</div></td>
                  <td>
                    <StatusBadge status={r.status} />
                    {r.status === "TRIAL" && r.trialEndsAt && <div className="text-xs text-slate-500">ends {fmtDate(r.trialEndsAt)}</div>}
                    {(r.status === "ACTIVE" || r.status === "PAST_DUE") && r.paidUntil && <div className="text-xs text-slate-500">paid to {fmtDate(r.paidUntil)}</div>}
                  </td>
                  <td className="whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                  <td className="text-right tabular-nums">{r.stores} / {r.registers}</td>
                  <td className="text-right tabular-nums">{r.sales30}</td>
                  <td className="text-right tabular-nums">{formatGBP(r.takings30)}</td>
                  <td className="whitespace-nowrap">
                    {r.lastSale ? fmtDate(r.lastSale) : <span className="text-slate-400">Never</span>}
                    {r.trading && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-500" title="Traded in the last 7 days" />}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-slate-500">No businesses match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-right text-xs"><a href="/api/platform/export" className="font-semibold text-slate-600 hover:text-slate-900">Download all as CSV</a></p>
    </div>
  );
}
