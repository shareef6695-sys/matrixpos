"use client";
import { useActionState, useEffect, useState } from "react";
import type { FormState } from "@/lib/server/actions/auth";

export interface ProjectPick { id: string; name: string; client: string | null; billed: boolean; tasks: { id: string; title: string }[] }

function ProjectTask({ projects, projectId, onProject }: { projects: ProjectPick[]; projectId: string; onProject: (id: string) => void }) {
  const p = projects.find((x) => x.id === projectId);
  return (
    <>
      <select name="projectId" className="input" value={projectId} onChange={(e) => onProject(e.target.value)} required aria-label="Project">
        <option value="">Project…</option>
        {projects.map((x) => <option key={x.id} value={x.id}>{x.client ? `${x.client}: ` : ""}{x.name}</option>)}
      </select>
      <select name="taskId" className="input" defaultValue="" key={projectId} aria-label="Task">
        <option value="">{p?.tasks.length ? "No particular task" : "No tasks on this project"}</option>
        {p?.tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
      </select>
    </>
  );
}

/** Log time already done. */
export function LogTimeForm({ action, projects, people, me, today, fixedProject }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  projects: ProjectPick[]; people?: { id: string; name: string }[]; me: string; today: string; fixedProject?: string;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  const [projectId, setProjectId] = useState(fixedProject ?? "");
  const billed = projects.find((p) => p.id === projectId)?.billed ?? true;
  const [n, setN] = useState(0);
  useEffect(() => { if (state?.ok) setN((x) => x + 1); }, [state]);
  return (
    <form action={run} className="grid gap-2 sm:grid-cols-2" key={n}>
      {fixedProject ? <><input type="hidden" name="projectId" value={fixedProject} /><div className="sm:col-span-2"><ProjectTaskOnly projects={projects} projectId={fixedProject} /></div></> : <ProjectTask projects={projects} projectId={projectId} onProject={setProjectId} />}
      <input name="date" type="date" className="input" defaultValue={today} max={today} required aria-label="Date" />
      <input name="duration" className="input" placeholder="Time: 1:30, 2h or 45m" required aria-label="Time spent" />
      <input name="description" className="input sm:col-span-2" placeholder="What you did (optional)" aria-label="What you did" />
      {people && people.length > 1 && (
        <select name="userId" className="input" defaultValue={me} aria-label="Who">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      )}
      <input type="hidden" name="billableShown" value="1" />
      {billed && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="billable" defaultChecked /> Billable</label>}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Log time"}</button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}

function ProjectTaskOnly({ projects, projectId }: { projects: ProjectPick[]; projectId: string }) {
  const p = projects.find((x) => x.id === projectId);
  return (
    <select name="taskId" className="input" defaultValue="" aria-label="Task">
      <option value="">No particular task</option>
      {p?.tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
    </select>
  );
}

/** Start a timer. */
export function StartTimerForm({ action, projects }: { action: (f: FormData) => Promise<void>; projects: ProjectPick[] }) {
  const [projectId, setProjectId] = useState("");
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <ProjectTask projects={projects} projectId={projectId} onProject={setProjectId} />
      <input name="description" className="input" placeholder="What you're doing" aria-label="What you're doing" />
      <button className="btn-primary">Start timer</button>
    </form>
  );
}

/** The running clock. */
export function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  return <span className="font-mono text-2xl font-bold tabular-nums">{Math.floor(s / 3600)}:{String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>;
}
