/** UK business days run on London time (GMT/BST), whatever timezone the server is in. */
const TZ = "Europe/London";

function offsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, timeZoneName: "shortOffset" }).formatToParts(at);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-]\d+)(?::(\d+))?/);
  return m ? parseInt(m[1], 10) * 60 + Math.sign(parseInt(m[1], 10)) * parseInt(m[2] ?? "0", 10) : 0;
}

/** "YYYY-MM-DD" for a moment, in London time. */
export function londonDate(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** UTC instant when the given London calendar day starts. */
export function londonDayStart(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  return new Date(guess.getTime() - offsetMinutes(guess) * 60_000);
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** [start, end) for a London date range, inclusive of both calendar days. */
export function londonRange(from: string, to: string) {
  return { gte: londonDayStart(from), lt: londonDayStart(addDays(to, 1)) };
}

export const fmtDateTime = (d: Date | string) =>
  new Date(d).toLocaleString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
