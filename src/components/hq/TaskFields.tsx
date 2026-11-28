import type { HqTask } from "@prisma/client";
import { PRIORITY, TASK_STATUS_LABEL } from "@/lib/hq/labels";
import { fmtMinutes } from "@/lib/hq/projects";
import { londonDate } from "@/lib/dates";

export function TaskFields({ t, projectId, people }: { t?: HqTask; projectId: string; people: { id: string; name: string }[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      {t && <input type="hidden" name="id" value={t.id} />}
      <input name="title" className="input sm:col-span-2" defaultValue={t?.title} placeholder="Task" required aria-label="Task title" />
      <select name="assigneeId" className="input" defaultValue={t?.assigneeId ?? ""} aria-label="For"><option value="">Nobody yet</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select name="priority" className="input" defaultValue={t?.priority ?? "NORMAL"} aria-label="Priority">{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label} priority</option>)}</select>
      <select name="status" className="input" defaultValue={t?.status ?? "TODO"} aria-label="Status">{Object.entries(TASK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <input name="dueDate" type="date" className="input" defaultValue={t?.dueDate ? londonDate(t.dueDate) : ""} aria-label="Due" />
      <input name="estimate" className="input" defaultValue={t?.estimateMinutes ? fmtMinutes(t.estimateMinutes) : ""} placeholder="Estimate, e.g. 3h" aria-label="Estimate" />
      <textarea name="description" className="input min-h-12 sm:col-span-2" defaultValue={t?.description ?? ""} placeholder="Details (optional)" aria-label="Details" />
    </div>
  );
}
