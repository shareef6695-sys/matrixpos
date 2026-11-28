import Link from "next/link";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { hqPeople } from "@/lib/server/hq-people";
import { PageHeader } from "@/components/admin";
import { ActionForm } from "@/components/FormMessage";
import { Pill, Tabs } from "@/components/hq/ui";
import { ProjectFields } from "@/components/hq/ProjectFields";
import { saveProject } from "@/lib/server/actions/hq-projects";
import { currencies, formatMoney } from "@/lib/hq/money";
import { fmtMinutes } from "@/lib/hq/projects";
import { BILLING_LABEL, PROJECT_STATUS } from "@/lib/hq/labels";
import { fmtDate } from "@/lib/dates";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Projects" };

const TABS: [string, string][] = [["all", "Open"], ["mine", "Mine"], ["DONE", "Done"], ["every", "Everything"]];

export default async function Projects({ searchParams }: { searchParams: Promise<{ f?: string; client?: string }> }) {
  const h = await requireHq("projects.view");
  const { f = "all", client } = await searchParams;
  const where: Prisma.HqProjectWhereInput =
    f === "DONE" ? { status: { in: ["DONE", "CANCELLED"] } } : f === "every" ? {}
    : f === "mine" ? { status: { in: ["PLANNED", "ACTIVE", "ON_HOLD"] }, OR: [{ managerId: h.userId }, { tasks: { some: { assigneeId: h.userId } } }] }
    : { status: { in: ["PLANNED", "ACTIVE", "ON_HOLD"] } };
  const [projects, time, openTasks] = await Promise.all([
    db.hqProject.findMany({ where, include: { client: { select: { name: true } } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 300 }),
    db.hqTimeEntry.groupBy({ by: ["projectId"], _sum: { minutes: true } }),
    db.hqTask.groupBy({ by: ["projectId"], where: { status: { not: "DONE" } }, _count: true }),
  ]);
  const mins = new Map(time.map((t) => [t.projectId, t._sum.minutes ?? 0]));
  const tasks = new Map(openTasks.map((t) => [t.projectId, t._count]));
  const edit = h.can("projects.edit");
  const [clients, people] = edit ? await Promise.all([db.hqClient.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }), hqPeople()]) : [[], []];
  const now = Date.now();
  const money = h.can("invoices.view");
  return (
    <div>
      <PageHeader title="Projects" sub="Client builds and internal work, with tasks, time and whether each one is making money." actions={<Link href="/platform/time" className="btn-secondary">My time</Link>} />
      <Tabs base="/platform/projects" current={TABS.some(([k]) => k === f) ? f : "all"} tabs={TABS} />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Project</th><th>Client</th><th>Status</th><th>Due</th><th className="text-right">Open tasks</th><th className="text-right">Hours</th>{money && <th className="text-right">Value</th>}</tr></thead>
            <tbody>
              {projects.map((p) => {
                const used = mins.get(p.id) ?? 0;
                const over = p.budgetHours != null && Number(p.budgetHours) > 0 && used > Number(p.budgetHours) * 60;
                const late = p.dueDate && p.dueDate.getTime() + 86_400_000 < now && (p.status === "ACTIVE" || p.status === "PLANNED");
                return (
                  <tr key={p.id}>
                    <td><Link href={`/platform/projects/${p.id}`} className="font-semibold text-violet-700">{p.name}</Link><div className="text-xs text-slate-500">{BILLING_LABEL[p.billing]}</div></td>
                    <td>{p.client?.name ?? <span className="text-slate-400">Internal</span>}</td>
                    <td><Pill s={p.status} map={PROJECT_STATUS} /></td>
                    <td className={late ? "font-semibold text-red-700" : ""}>{p.dueDate ? fmtDate(p.dueDate) : ""}</td>
                    <td className="text-right tabular-nums">{tasks.get(p.id) ?? 0}</td>
                    <td className={`text-right tabular-nums ${over ? "font-semibold text-red-700" : ""}`}>{fmtMinutes(used)}{p.budgetHours != null ? <span className="text-xs text-slate-500"> / {Number(p.budgetHours)}</span> : null}</td>
                    {money && <td className="text-right tabular-nums">{p.budgetMinor ? formatMoney(p.budgetMinor, p.currency) : p.rateMinor ? `${formatMoney(p.rateMinor, p.currency)}/h` : ""}</td>}
                  </tr>
                );
              })}
              {!projects.length && <tr><td colSpan={7} className="text-center text-slate-500">No projects here.</td></tr>}
            </tbody>
          </table>
        </div>
        {edit && (
          <div className="card h-fit">
            <h2 className="mb-3 font-semibold">New project</h2>
            <ActionForm action={saveProject} className="space-y-3" submit="Create project"><ProjectFields clients={clients} people={people} currencies={currencies()} defaultClient={client} money={money} /></ActionForm>
          </div>
        )}
      </div>
    </div>
  );
}
