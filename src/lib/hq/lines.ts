import { z } from "zod";
import { documentTotals, lineTotals, parseMoney } from "./money";

const raw = z.array(z.object({
  itemId: z.string().max(40).optional().nullable(),
  description: z.string().max(2000),
  quantity: z.union([z.string(), z.number()]),
  unit: z.union([z.string(), z.number()]),
  discountPct: z.union([z.string(), z.number()]).optional(),
  taxPct: z.union([z.string(), z.number()]).optional(),
})).max(100);

export interface ParsedLine { itemId: string | null; position: number; description: string; quantity: number; unitMinor: number; discountPct: number; taxPct: number; amountMinor: number }

const num = (v: string | number | undefined) => (v === undefined || v === "" ? 0 : Number(String(v).replace(/,/g, "")));

/**
 * Checks the lines sent from the quote or invoice form and works out every amount on the server.
 * Totals typed or tampered with in the browser are never used. Tax is only allowed once VAT is switched on.
 */
export function parseLines(json: string, currency: string, allowTax: boolean): { lines: ParsedLine[]; totals: ReturnType<typeof documentTotals> } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(json || "[]");
  } catch {
    return { error: "The lines couldn't be read. Please try again." };
  }
  const p = raw.safeParse(data);
  if (!p.success) return { error: "Up to 100 lines, each with a description, quantity and price" };
  const lines: ParsedLine[] = [];
  for (const [i, l] of p.data.entries()) {
    const description = l.description.trim();
    if (!description && !String(l.unit).trim()) continue; // an empty row
    const n = i + 1;
    if (!description) return { error: `Line ${n}: add a description` };
    const quantity = num(l.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 1e-6)
      return { error: `Line ${n}: the quantity must be more than 0, with up to 3 decimals` };
    const unitMinor = parseMoney(String(l.unit), currency);
    if (unitMinor === null || unitMinor < 0 || unitMinor > 1e11) return { error: `Line ${n}: enter the price as a number` };
    const discountPct = num(l.discountPct);
    if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) return { error: `Line ${n}: the discount must be 0 to 100%` };
    const taxPct = allowTax ? num(l.taxPct) : 0;
    if (!Number.isFinite(taxPct) || taxPct < 0 || taxPct > 100) return { error: `Line ${n}: the tax must be 0 to 100%` };
    const clean = { description, quantity: Math.round(quantity * 1000) / 1000, unitMinor, discountPct: Math.round(discountPct * 100) / 100, taxPct: Math.round(taxPct * 100) / 100 };
    const t = lineTotals(clean);
    // Kept well inside the range where JavaScript numbers are exact.
    if (t.grossBeforeDiscount + t.taxMinor > 1e13) return { error: `Line ${n}: that amount is too large` };
    lines.push({ ...clean, itemId: l.itemId || null, position: lines.length, amountMinor: t.amountMinor });
  }
  if (!lines.length) return { error: "Add at least one line" };
  if (lines.reduce((n, l) => n + l.amountMinor, 0) > 1e13) return { error: "The total is too large" };
  return { lines, totals: documentTotals(lines) };
}
