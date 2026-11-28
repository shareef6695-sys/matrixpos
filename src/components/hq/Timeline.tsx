import type { HqNote } from "@prisma/client";
import { addNote } from "@/lib/server/actions/hq-crm";
import { fmtDateTime } from "@/lib/dates";

const KIND: Record<string, string> = { NOTE: "Note", CALL: "Call", EMAIL: "Email", MEETING: "Meeting" };

export function Timeline({ notes, clientId, leadId, canEdit }: { notes: HqNote[]; clientId?: string; leadId?: string; canEdit: boolean }) {
  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">Notes and activity</h2>
      {canEdit && (
        <form action={addNote} className="mb-4 space-y-2">
          {clientId && <input type="hidden" name="clientId" value={clientId} />}
          {leadId && <input type="hidden" name="leadId" value={leadId} />}
          <textarea name="body" className="input min-h-16" placeholder="What happened? e.g. Called, they want a demo next week" required />
          <div className="flex gap-2">
            <select name="kind" className="input w-auto">{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <button className="btn-secondary">Add</button>
          </div>
        </form>
      )}
      <ul className="space-y-3 text-sm">
        {notes.map((n) => (
          <li key={n.id} className="border-l-2 border-violet-200 pl-3">
            <div className="text-xs text-slate-500">{KIND[n.kind] ?? n.kind} · {fmtDateTime(n.createdAt)}{n.userName ? ` · ${n.userName}` : ""}</div>
            <div className="whitespace-pre-line">{n.body}</div>
          </li>
        ))}
        {!notes.length && <li className="text-slate-500">Nothing yet.</li>}
      </ul>
    </div>
  );
}
