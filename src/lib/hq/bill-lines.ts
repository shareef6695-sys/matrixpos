import { z } from "zod";
import { parseMoney } from "./money";

const raw = z.array(z.object({
  description: z.string().max(500),
  accountId: z.string().max(40),
  amount: z.union([z.string(), z.number()]),
  taxPct: z.union([z.string(), z.number()]).optional(),
})).max(50);

export interface BillLineIn { position: number; description: string; accountId: string; netMinor: number; taxPct: number; taxMinor: number }

/** Checks bill lines from the form. Amounts are before VAT; VAT is worked out per line (only once VAT registered). */
export function parseBillLines(json: string, currency: string, allowTax: boolean): { lines: BillLineIn[]; netMinor: number; taxMinor: number; totalMinor: number } | { error: string } {
  let data: unknown;
  try { data = JSON.parse(json || "[]"); } catch { return { error: "The lines couldn't be read. Please try again." }; }
  const p = raw.safeParse(data);
  if (!p.success) return { error: "Up to 50 lines, each with an account and an amount" };
  const lines: BillLineIn[] = [];
  for (const [i, l] of p.data.entries()) {
    if (!l.description.trim() && !String(l.amount).trim()) continue;
    const n = i + 1;
    if (!l.accountId) return { error: `Line ${n}: choose what it was for` };
    const net = parseMoney(String(l.amount), currency);
    if (net === null || net <= 0 || net > 1e12) return { error: `Line ${n}: enter the amount (more than zero)` };
    const taxPct = allowTax ? Number(String(l.taxPct ?? "0").replace(/,/g, "") || 0) : 0;
    if (!Number.isFinite(taxPct) || taxPct < 0 || taxPct > 100) return { error: `Line ${n}: VAT must be 0 to 100%` };
    const taxMinor = Math.round((net * Math.round(taxPct * 100)) / 10000);
    lines.push({ position: lines.length, description: l.description.trim() || "Expense", accountId: l.accountId, netMinor: net, taxPct, taxMinor });
  }
  if (!lines.length) return { error: "Add at least one line" };
  const netMinor = lines.reduce((a, l) => a + l.netMinor, 0);
  const taxMinor = lines.reduce((a, l) => a + l.taxMinor, 0);
  if (netMinor + taxMinor <= 0) return { error: "The total must be more than zero" };
  return { lines, netMinor, taxMinor, totalMinor: netMinor + taxMinor };
}

/** Adds one period to a date (YYYY-MM-DD), keeping month ends sensible (31 Jan + 1 month = 28/29 Feb). */
export function addPeriod(ymd: string, freq: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY", anchorDay?: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (freq === "WEEKLY") return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
  const months = freq === "MONTHLY" ? 1 : freq === "QUARTERLY" ? 3 : 12;
  const want = anchorDay ?? d;
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(want, last))).toISOString().slice(0, 10);
}
