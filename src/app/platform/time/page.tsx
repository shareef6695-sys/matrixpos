import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { hqPeople } from "@/lib/server/hq-people";
import { projectPicks } from "@/lib/server/hq-time";
import { PageHeader } from "@/components/admin";
import { ErrorBanner, Pill } from "@/components/hq/ui";
import { Elapsed, LogTimeForm, StartTimerForm } from "@/components/hq/TimeForms";
import { deleteTime, discardTimer, logTime, moveTask, startTimer, stopTimer } from "@/lib/server/actions/hq-projects";
import { fmtMinutes } from "@/lib/hq/projects";
import { PRIORITY, TASK_STATUS_LABEL } from "@/lib/hq/labels";
import { addDays, fmtDate, londonDate, londonDayStart } from "@/lib/dates";

export const metadata = { title: "Time" };

/** Monday of the week a date falls in. */
function monday(ymd: string) {
  const d = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return addDays(ymd, d === 0 ? -6 : 1 - d);
}

export default async function Time({ searchParams }: { searchParams: Promise<{ w?: string; u?: string; error?: string }> }) {
  const h = await requireHq();
  const logs = h.can("time.log") || h.can("projects.edit");
  if (!logs && !h.can("projects.view")) redirect("/platform/home?denied=1");
  const sp = await searchParams;
  const today = londonDate();
  const week = monday(sp.w && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) ? sp.w : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const people = await hqPeople();
  // Anyone who can see projects can look at a colleague's week; everyone else sees their own.
  const who = sp.u && h.can("projects.view") && people.some((p) => p.id === sp.u) ? sp.u : h.userId;
  const [entries, timer, tasks, picks] = await Promise.all([
    db.hqTimeEntry.findMany({
      where: { userId: who, date: { gte: londonDayStart(week), lt: londonDayStart(addDays(week, 7)) } },
      include: { project: { select: { id: true, name: true, client: { select: { name: true } } } }, task: { select: { title: true } } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    db.hqTimer.findUnique({ where: { userId: h.userId }, include: { project: { select: { name: true } }, task: { select: { title: true } } } }),
    db.hqTask.findMany({ where: { assigneeId: who, status: { not: "DONE" } }, include: { project: { select: { id: true, name: true } } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }], take: 50 }),
    logs ? projectPicks() : [],
  ]);
  const rows = new Map<string, { label: string; href: string; byDay: number[] }>();
  for (const e of entries) {
    const key = `${e.projectId}|${e.taskId ?? ""}`;
    const r = rows.get(key) ?? { label: `${e.project.client ? `${e.project.client.name}: ` : ""}${e.project.name}${e.task ? ` · ${e.task.title}` : ""}`, href: `/platform/projects/${e.projectId}`, byDay: days.map(() => 0) };
    r.byDay[days.indexOf(londonDate(e.date))] += e.minutes;
    rows.set(key, r);
  }
  const dayTotals = days.map((_, i) => [...rows.values()].reduce((n, r) => n + r.byDay[i], 0));
  const mine = who === h.userId;
  const q = (w: string) => `/platform/time?w=${w}${who !== h.userId ? `&u=${who}` : ""}`;
  return (
    <div>
      <PageHeader title="Time" sub="Start a timer, or log time afterwards. Billable time can be put on an invoice from the project." />
      <ErrorBanner error={sp.error} />
      {mine && logs && (
        <div className="card mb-6">
          {timer ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Timer running</div>
                <div className="font-semibold">{timer.project.name}{timer.task ? ` · ${timer.task.title}` : ""}</div>
                {timer.description && <div className="text-sm text-slate-500">{timer.description}</div>}
              </div>
              <Elapsed since={timer.startedAt.toISOString()} />
              <div className="flex gap-2">
                <form action={stopTimer}><button className="btn-primary">Stop and log</button></form>
                <form action={discardTimer}><button className="btn-secondary">Discard</button></form>
              </div>
            </div>
          ) : picks.length ? <StartTimerForm action={startTimer} projects={picks} /> : <p className="text-sm text-slate-500">No open projects yet. <Link href="/platform/projects" className="text-violet-700">Create one</Link> to start tracking time.</p>}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Link href={q(addDays(week, -7))} className="btn-secondary px-3 py-1">←</Link>
          <span className="font-semibold">Week of {fmtDate(londonDayStart(week))}</span>
          <Link href={q(addDays(week, 7))} className="btn-secondary px-3 py-1">→</Link>
          {week !== monday(today) && <Link href={q(today)} className="text-violet-700">This week</Link>}
        </div>
        {h.can("projects.view") && people.length > 1 && (
          <form className="flex gap-2 text-sm">
            <input type="hidden" name="w" value={week} />
            <select name="u" className="input py-1" defaultValue={who}>{people.map((p) => <option key={p.id} value={p.id}>{p.id === h.userId ? `${p.name} (me)` : p.name}</option>)}</select>
            <button className="btn-secondary py-1">Show</button>
          </form>
        )}
      </div>
      <div className="card mb-6 overflow-x-auto p-0">
        <table className="table min-w-[760px] text-sm">
          <thead><tr><th>Project and task</th>{days.map((d) => <th key={d} className={`text-right ${d === today ? "text-violet-700" : ""}`}>{new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" })}</th>)}<th className="text-right">Total</th></tr></thead>
          <tbody>
            {[...rows.values()].map((r) => (
              <tr key={r.label}><td><Link href={r.href} className="hover:text-violet-700">{r.label}</Link></td>{r.byDay.map((m, i) => <td key={i} className="text-right tabular-nums">{m ? fmtMinutes(m) : ""}</td>)}<td className="text-right font-semibold tabular-nums">{fmtMinutes(r.byDay.reduce((a, b) => a + b, 0))}</td></tr>
            ))}
            {!rows.size && <tr><td colSpan={9} className="text-center text-slate-500">No time this week.</td></tr>}
            <tr className="font-bold"><td>Total</td>{dayTotals.map((m, i) => <td key={i} className="text-right tabular-nums">{m ? fmtMinutes(m) : ""}</td>)}<td className="text-right tabular-nums">{fmtMinutes(dayTotals.reduce((a, b) => a + b, 0))}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="card overflow-x-auto p-0">
            <h2 className="px-4 pt-4 font-semibold">Entries this week</h2>
            <table className="table text-sm">
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{fmtDate(e.date)}</td>
                    <td>{e.project.name}{e.task ? ` · ${e.task.title}` : ""}<div className="text-xs text-slate-500">{e.description}</div></td>
                    <td className="text-right tabular-nums">{fmtMinutes(e.minutes)}</td>
                    <td className="text-xs">{e.billable ? (e.invoiceId ? "Invoiced" : "Billable") : "Not billable"}</td>
                    <td>{!e.invoiceId && (h.can("projects.edit") || (mine && h.can("time.log"))) && <form action={deleteTime}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="back" value="/platform/time" /><button className="text-xs text-red-600">Delete</button></form>}</td>
                  </tr>
                ))}
                {!entries.length && <tr><td className="text-slate-500">None.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card text-sm">
            <h2 className="mb-2 font-semibold">{mine ? "My tasks" : "Their tasks"}</h2>
            <ul className="divide-y divide-slate-100">
              {tasks.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <Link href={`/platform/projects/${t.project.id}`} className="font-medium hover:text-violet-700">{t.title}</Link>
                    <span className="text-xs text-slate-500"> · {t.project.name} · {TASK_STATUS_LABEL[t.status]}{t.dueDate ? ` · due ${fmtDate(t.dueDate)}` : ""}</span>
                    {t.priority !== "NORMAL" && <> <Pill s={t.priority} map={PRIORITY} /></>}
                  </span>
                  {mine && h.can("time.log") && (
                    <form action={moveTask}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value={t.status === "TODO" ? "DOING" : t.status === "DOING" ? "REVIEW" : "DONE"} /><button className="text-xs font-semibold text-violet-700">{t.status === "TODO" ? "Start" : t.status === "DOING" ? "Ready for review" : "Done"}</button></form>
                  )}
                </li>
              ))}
              {!tasks.length && <li className="py-2 text-slate-500">Nothing assigned.</li>}
            </ul>
          </div>
        </div>
        {mine && logs && picks.length > 0 && (
          <div className="card h-fit">
            <h2 className="mb-3 font-semibold">Log time</h2>
            <LogTimeForm action={logTime} projects={picks} people={h.can("projects.edit") ? people : undefined} me={h.userId} today={today} />
          </div>
        )}
      </div>
    </div>
  );
}
