import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { hqPeople } from "@/lib/server/hq-people";
import { projectPicks, peopleNames } from "@/lib/server/hq-time";
import { Stat } from "@/components/admin";
import { ActionForm } from "@/components/FormMessage";
import { ErrorBanner, Pill } from "@/components/hq/ui";
import { ProjectFields } from "@/components/hq/ProjectFields";
import { TaskFields } from "@/components/hq/TaskFields";
import { LogTimeForm } from "@/components/hq/TimeForms";
import { deleteProject, deleteTask, deleteTime, invoiceTime, logTime, moveTask, saveProject, saveTask, startTimer } from "@/lib/server/actions/hq-projects";
import { currencies, formatMoney, toGbpPence } from "@/lib/hq/money";
import { formatGBP } from "@/lib/pos/money";
import { fmtMinutes } from "@/lib/hq/projects";
import { BILLING_LABEL, BILL_STATUS, INVOICE_STATUS, PRIORITY, PROJECT_STATUS, TASK_STATUS_LABEL } from "@/lib/hq/labels";
import { fmtDate, londonDate } from "@/lib/dates";

export const metadata = { title: "Project" };

const COLS = ["TODO", "DOING", "REVIEW", "DONE"] as const;

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const h = await requireHq("projects.view");
  const { id } = await params;
  const { error } = await searchParams;
  const p = await db.hqProject.findUnique({
    where: { id },
    include: {
      client: true,
      tasks: { orderBy: [{ position: "asc" }] },
      time: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], include: { task: { select: { title: true } }, invoice: { select: { number: true } } } },
      invoices: { orderBy: { issueDate: "desc" } },
      bills: { orderBy: { date: "desc" } },
    },
  });
  if (!p) notFound();
  const edit = h.can("projects.edit");
  const logs = h.can("time.log") || edit;
  const [people, picks, names] = await Promise.all([hqPeople(), logs ? projectPicks() : [], peopleNames([...p.time.map((t) => t.userId), ...p.tasks.map((t) => t.assigneeId), p.managerId])]);
  const clients = edit ? await db.hqClient.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];

  const total = p.time.reduce((n, t) => n + t.minutes, 0);
  const unbilled = p.time.filter((t) => t.billable && !t.invoiceId);
  const unbilledMin = unbilled.reduce((n, t) => n + t.minutes, 0);
  const live = p.invoices.filter((i) => i.status !== "VOID" && i.status !== "DRAFT");
  const invoicedNet = live.reduce((n, i) => n + toGbpPence(i.totalMinor - i.taxMinor, i.currency, Number(i.perGbp)), 0);
  const invoicedSame = live.filter((i) => i.currency === p.currency).reduce((n, i) => n + i.totalMinor, 0);
  const costs = p.bills.filter((b) => b.status !== "VOID").reduce((n, b) => n + toGbpPence(b.netMinor, b.currency, Number(b.perGbp)), 0);
  const minsBy = new Map<string, number>();
  for (const t of p.time) if (t.taskId) minsBy.set(t.taskId, (minsBy.get(t.taskId) ?? 0) + t.minutes);
  const canMove = (assignee: string | null) => edit || (h.can("time.log") && assignee === h.userId);
  // Project staff without invoice access see hours, not money.
  const money = h.can("invoices.view");
  const hoursBudget = p.budgetHours != null ? Number(p.budgetHours) * 60 : null;
  const here = `/platform/projects/${p.id}`;

  return (
    <div>
      <Link href="/platform/projects" className="text-sm text-slate-500">← Projects</Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{p.name} <Pill s={p.status} map={PROJECT_STATUS} /></h1>
          <p className="text-sm text-slate-500">
            {p.client ? <Link href={`/platform/clients/${p.client.id}`} className="font-semibold text-violet-700">{p.client.name}</Link> : "Internal"} · {BILLING_LABEL[p.billing]}
            {money && p.rateMinor ? ` at ${formatMoney(p.rateMinor, p.currency)}/hour` : ""}{p.managerId ? ` · ${names.get(p.managerId) ?? ""} in charge` : ""}
            {p.dueDate ? ` · due ${fmtDate(p.dueDate)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {logs && p.status !== "DONE" && p.status !== "CANCELLED" && <form action={startTimer}><input type="hidden" name="projectId" value={p.id} /><button className="btn-primary">Start timer</button></form>}
          {p.client && h.can("invoices.edit") && <Link href={`/platform/invoices/new?client=${p.client.id}&project=${p.id}`} className="btn-secondary">New invoice</Link>}
        </div>
      </div>
      <ErrorBanner error={error} />
      {p.description && <p className="mb-4 whitespace-pre-line text-sm text-slate-600">{p.description}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Time logged" value={fmtMinutes(total)} sub={hoursBudget ? `of ${Number(p.budgetHours)} hours budgeted${total > hoursBudget ? " (over)" : ""}` : "hours"} />
        <Stat label="Not yet invoiced" value={fmtMinutes(unbilledMin)} sub={money && p.rateMinor ? formatMoney(Math.round((unbilledMin / 60) * p.rateMinor), p.currency) : "billable hours"} />
        {money && <><Stat label="Invoiced" value={formatGBP(invoicedNet)} sub={p.billing === "FIXED" && p.budgetMinor ? `${formatMoney(Math.max(0, p.budgetMinor - invoicedSame), p.currency)} of ${formatMoney(p.budgetMinor, p.currency)} left to invoice` : "before VAT"} />
        <Stat label="Profit so far" value={formatGBP(invoicedNet - costs)} sub={`after ${formatGBP(costs)} of bills for this project`} /></>}
      </div>

      <h2 className="mb-2 font-semibold">Tasks</h2>
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLS.map((col, ci) => (
          <div key={col} className="rounded-xl bg-slate-100 p-2">
            <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{TASK_STATUS_LABEL[col]} ({p.tasks.filter((t) => t.status === col).length})</div>
            <div className="space-y-2">
              {p.tasks.filter((t) => t.status === col).map((t) => (
                <details key={t.id} className="rounded-lg bg-white p-2 text-sm shadow-sm ring-1 ring-slate-200">
                  <summary className="cursor-pointer list-none">
                    <div className="font-medium">{t.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                      {t.priority !== "NORMAL" && <Pill s={t.priority} map={PRIORITY} />}
                      {t.assigneeId && <span>{names.get(t.assigneeId)}</span>}
                      {t.dueDate && <span className={t.status !== "DONE" && t.dueDate.getTime() + 86_400_000 < Date.now() ? "font-semibold text-red-700" : ""}>· due {fmtDate(t.dueDate)}</span>}
                      {(minsBy.get(t.id) || t.estimateMinutes) ? <span>· {fmtMinutes(minsBy.get(t.id) ?? 0)}{t.estimateMinutes ? ` / ${fmtMinutes(t.estimateMinutes)}` : ""}</span> : null}
                    </div>
                  </summary>
                  {t.description && <p className="mt-2 whitespace-pre-line text-xs text-slate-600">{t.description}</p>}
                  {canMove(t.assigneeId) && (
                    <div className="mt-2 flex gap-2">
                      {ci > 0 && <form action={moveTask}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value={COLS[ci - 1]} /><button className="text-xs text-violet-700">← {TASK_STATUS_LABEL[COLS[ci - 1]]}</button></form>}
                      {ci < COLS.length - 1 && <form action={moveTask}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value={COLS[ci + 1]} /><button className="text-xs font-semibold text-violet-700">{TASK_STATUS_LABEL[COLS[ci + 1]]} →</button></form>}
                    </div>
                  )}
                  {edit && (
                    <div className="mt-3 border-t border-slate-100 pt-2">
                      <ActionForm action={saveTask} className="space-y-2" submit="Save task"><TaskFields t={t} projectId={p.id} people={people} /></ActionForm>
                      <form action={deleteTask} className="mt-2"><input type="hidden" name="id" value={t.id} /><button className="text-xs text-red-600">Delete task</button></form>
                    </div>
                  )}
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>
      {edit && (
        <details className="card mb-6">
          <summary className="cursor-pointer font-semibold">Add a task</summary>
          <ActionForm action={saveTask} className="mt-3 space-y-3" submit="Add task" reset><TaskFields projectId={p.id} people={people} /></ActionForm>
        </details>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="card overflow-x-auto p-0">
          <h2 className="px-4 pt-4 font-semibold">Time</h2>
          <table className="table text-sm">
            <thead><tr><th>Date</th><th>Who</th><th>Task and notes</th><th className="text-right">Time</th><th>Billing</th><th /></tr></thead>
            <tbody>
              {p.time.slice(0, 200).map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td>{names.get(t.userId) ?? ""}</td>
                  <td>{t.task?.title}{t.task && t.description ? " · " : ""}<span className="text-slate-500">{t.description}</span></td>
                  <td className="text-right tabular-nums">{fmtMinutes(t.minutes)}</td>
                  <td className="text-xs">{!t.billable ? "Not billable" : t.invoice ? !money ? "Invoiced" : <Link href={`/platform/invoices/${t.invoiceId}`} className="text-violet-700">{t.invoice.number}</Link> : <span className="text-amber-700">Unbilled</span>}</td>
                  <td>{!t.invoiceId && (edit || (h.can("time.log") && t.userId === h.userId)) && <form action={deleteTime}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="back" value={here} /><button className="text-xs text-red-600">Delete</button></form>}</td>
                </tr>
              ))}
              {!p.time.length && <tr><td colSpan={6} className="text-center text-slate-500">No time logged yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="space-y-4">
          {logs && p.status !== "DONE" && p.status !== "CANCELLED" && (
            <div className="card">
              <h2 className="mb-3 font-semibold">Log time</h2>
              <LogTimeForm action={logTime} projects={picks} people={edit ? people : undefined} me={h.userId} today={londonDate()} fixedProject={p.id} />
            </div>
          )}
          {h.can("invoices.edit") && p.client && p.rateMinor > 0 && unbilled.length > 0 && (
            <div className="card">
              <h2 className="mb-1 font-semibold">Invoice the unbilled time</h2>
              <p className="mb-3 text-xs text-slate-500">Makes a draft invoice at {formatMoney(p.rateMinor, p.currency)}/hour. Check it, then send it as usual.</p>
              <ActionForm action={invoiceTime} className="space-y-2" submit="Make draft invoice">
                <input type="hidden" name="projectId" value={p.id} />
                <label className="label">Time up to and including</label>
                <input type="date" name="until" className="input" defaultValue={londonDate()} />
                <select name="groupBy" className="input" defaultValue="task"><option value="task">One line per task</option><option value="entry">One line per time entry</option></select>
              </ActionForm>
            </div>
          )}
          {money && <div className="card text-sm">
            <h2 className="mb-2 font-semibold">Invoices</h2>
            <ul className="space-y-1">
              {p.invoices.map((i) => <li key={i.id} className="flex justify-between gap-2"><Link href={`/platform/invoices/${i.id}`} className="font-mono text-xs font-semibold text-violet-700">{i.number}</Link><span><Pill s={i.status} map={INVOICE_STATUS} /> <span className="tabular-nums">{formatMoney(i.totalMinor, i.currency)}</span></span></li>)}
              {!p.invoices.length && <li className="text-slate-500">None yet.</li>}
            </ul>
            <h2 className="mb-2 mt-4 font-semibold">Costs (bills)</h2>
            <ul className="space-y-1">
              {p.bills.map((b) => <li key={b.id} className="flex justify-between gap-2"><Link href={`/platform/bills/${b.id}`} className="text-violet-700">{b.payee}</Link><span><Pill s={b.status} map={BILL_STATUS} /> <span className="tabular-nums">{formatMoney(b.totalMinor, b.currency)}</span></span></li>)}
              {!p.bills.length && <li className="text-slate-500">None. Choose this project when adding a bill to count it here.</li>}
            </ul>
          </div>}
          {edit && (
            <details className="card">
              <summary className="cursor-pointer font-semibold">Project details</summary>
              <ActionForm action={saveProject} className="mt-3 space-y-3" submit="Save"><ProjectFields p={p} clients={clients} people={people} currencies={currencies()} money={money} /></ActionForm>
              <form action={deleteProject} className="mt-3"><input type="hidden" name="id" value={p.id} /><button className="text-xs text-red-600">Delete project</button></form>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
