// Projects, time and contracts: the pure parts, unit tested.

/**
 * Reads a duration typed by a person: "1:30", "1h30", "1h 30m", "90m", "90", "1.5h" or "1.5".
 * A plain whole number of 10 or more is minutes, under 10 is hours ("2" = 2 hours, "45" = 45 minutes).
 * Returns minutes (1 to 24 hours), or null if it can't be read.
 */
export function parseDuration(input: string): number | null {
  const t = input.trim().toLowerCase().replace(/\s+/g, "").replace(",", ".");
  if (!t) return null;
  let m: number | null = null;
  let r: RegExpMatchArray | null;
  if ((r = t.match(/^(\d{1,2}):(\d{1,2})$/))) m = Number(r[1]) * 60 + Number(r[2]);
  else if ((r = t.match(/^(\d+(?:\.\d+)?)h(?:(\d{1,2})m?)?$/))) m = Number(r[1]) * 60 + Number(r[2] ?? 0);
  else if ((r = t.match(/^(\d+)m(?:in(?:s|utes?)?)?$/))) m = Number(r[1]);
  else if ((r = t.match(/^\d+\.\d+$/))) m = Number(t) * 60;
  else if ((r = t.match(/^\d+$/))) m = Number(t) < 10 ? Number(t) * 60 : Number(t);
  if (m === null || !Number.isFinite(m)) return null;
  m = Math.round(m);
  return m >= 1 && m <= 24 * 60 ? m : null;
}

/** 90 → "1:30". */
export function fmtMinutes(min: number): string {
  const sign = min < 0 ? "-" : "";
  const a = Math.abs(Math.round(min));
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}

/** Hours as a decimal with up to 3 places, for invoice quantities: 20 minutes is 0.333. */
export const hoursQty = (min: number) => Math.round((min / 60) * 1000) / 1000;

export interface TimeForInvoice { id: string; minutes: number; date: string; description: string | null; taskId: string | null; taskTitle: string | null; person: string }

/**
 * Turns unbilled time into invoice lines at the hourly rate. "task" gives one line per task (and one for time
 * with no task); "entry" gives one line per time entry. Each line says which dates it covers.
 */
export function timeInvoiceLines(entries: TimeForInvoice[], opts: { project: string; rateMinor: number; groupBy: "task" | "entry" }) {
  const span = (es: TimeForInvoice[]) => {
    const ds = es.map((e) => e.date).sort();
    const f = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    return ds[0] === ds.at(-1) ? f(ds[0]) : `${f(ds[0])} to ${f(ds.at(-1)!)}`;
  };
  if (opts.groupBy === "entry") {
    return [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((e) => ({
      description: `${opts.project}: ${e.taskTitle ?? e.description ?? "Work"}${e.taskTitle && e.description ? ` (${e.description})` : ""}\n${span([e])} · ${e.person} · ${fmtMinutes(e.minutes)}`,
      quantity: hoursQty(e.minutes), unitMinor: opts.rateMinor, ids: [e.id],
    }));
  }
  const groups = new Map<string, TimeForInvoice[]>();
  for (const e of entries) groups.set(e.taskId ?? "", [...(groups.get(e.taskId ?? "") ?? []), e]);
  return [...groups.values()].map((es) => {
    const minutes = es.reduce((n, e) => n + e.minutes, 0);
    return {
      description: `${opts.project}: ${es[0].taskTitle ?? "General work"}\n${span(es)} · ${fmtMinutes(minutes)} hours`,
      quantity: hoursQty(minutes), unitMinor: opts.rateMinor, ids: es.map((e) => e.id),
    };
  });
}

/** Adds whole months to a YYYY-MM-DD date, keeping month ends sensible. */
export function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

export type RenewalState = "none" | "upcoming" | "due" | "overdue";

/**
 * Where a contract is in its renewal: "due" once inside its notice period, "overdue" once its end date has passed
 * (and it doesn't renew itself), "upcoming" within 90 days, otherwise "none".
 */
export function renewalState(c: { status: string; endDate: string | null; noticeDays: number }, today: string): RenewalState {
  if (c.status !== "ACTIVE" || !c.endDate) return "none";
  const left = dayDiff(c.endDate, today);
  if (left < 0) return "overdue";
  if (left <= c.noticeDays) return "due";
  return left <= 90 ? "upcoming" : "none";
}

/** Days from today to the end date (negative once passed). */
export const daysLeft = (endDate: string, today: string) => dayDiff(endDate, today);

/** For a contract that renews itself: the new end date once the current one has passed (catching up if needed). */
export function renewedEnd(endDate: string, months: number, today: string): { endDate: string; terms: number } {
  let end = endDate, terms = 0;
  while (end < today && terms < 50) { end = addMonths(end, months); terms++; }
  return { endDate: end, terms };
}
