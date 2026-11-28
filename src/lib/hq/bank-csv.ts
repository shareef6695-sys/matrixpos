// Reads bank statement CSVs from UK banks (Barclays, HSBC, Lloyds, NatWest, Monzo, Starling, Revolut, Wise, Tide...).
import { parseMoney } from "./money";

export interface StatementLine { date: string; description: string; amountMinor: number }

/** Splits CSV text into rows, handling quoted fields with commas and line breaks. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** "28/11/2026", "28-11-2026", "2026-11-28", "28 Nov 2026" or "28/11/26" to "2026-11-28". UK day-first. */
export function parseStatementDate(v: string): string | null {
  const t = v.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, "");
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return ymd(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = t.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2}|\d{4})$/);
  if (m) {
    const mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].toLowerCase());
    if (mon >= 0) return ymd(m[3].length === 2 ? 2000 + +m[3] : +m[3], mon + 1, +m[1]);
  }
  return null;
}
function ymd(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const find = (head: string[], ...names: RegExp[]) => head.findIndex((h) => names.some((n) => n.test(h)));

/**
 * Finds the date, description and amount columns from the header row. Works with one signed "Amount" column,
 * or separate "Paid in" / "Paid out" (also "Money in/out", "Credit/Debit") columns. Returns an error message
 * if the file can't be understood, so nothing half-imported is saved.
 */
export function parseStatement(text: string, currency: string): { lines: StatementLine[]; skipped: number } | { error: string } {
  const rows = csvRows(text);
  if (rows.length < 2) return { error: "The file is empty or isn't a CSV" };
  if (rows.length > 5001) return { error: "Import at most 5,000 lines at a time" };
  const hi = rows.findIndex((r) => r.some((c) => /date/i.test(c)));
  if (hi < 0 || hi > 10) return { error: "Couldn't find a header row with a Date column" };
  const head = rows[hi].map((h) => h.trim().toLowerCase());
  const di = find(head, /^(transaction |posting |value )?date$/, /date/);
  const desc = [find(head, /description|details|narrative|merchant|payee|name|memo/), find(head, /reference|^ref/), find(head, /^type$|transaction type/)].filter((i) => i >= 0);
  const ai = find(head, /^amount( \(?gbp\)?)?$/, /^amount/, /^value$/);
  const inI = find(head, /paid in|money in|credit|^in$|deposit/);
  const outI = find(head, /paid out|money out|debit|^out$|withdraw/);
  if (di < 0 || (ai < 0 && (inI < 0 || outI < 0))) return { error: "Couldn't find the Date and Amount (or Paid in / Paid out) columns" };
  const lines: StatementLine[] = [];
  let skipped = 0;
  for (const r of rows.slice(hi + 1)) {
    const date = parseStatementDate(r[di] ?? "");
    const num = (v: string | undefined) => {
      let raw = String(v ?? "").trim();
      let sign = 1;
      if (/^\(.*\)$/.test(raw)) { raw = raw.slice(1, -1); sign = -1; } // (12.50) means money out
      const suffix = raw.match(/\s*(CR|DR)$/i);
      if (suffix) { raw = raw.slice(0, -suffix[0].length); if (suffix[1].toUpperCase() === "DR") sign = -1; }
      if (!raw) return 0;
      const n = parseMoney(raw, currency);
      return n === null ? null : sign * n;
    };
    let amount: number | null;
    if (ai >= 0) amount = num(r[ai]);
    else {
      const a = num(r[inI]), b = num(r[outI]);
      amount = a === null || b === null ? null : Math.abs(a) - Math.abs(b);
    }
    const description = desc.map((i) => (r[i] ?? "").trim()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(" · ").slice(0, 300);
    if (!date || amount === null || amount === 0) { skipped++; continue; }
    lines.push({ date, description: description || "(no description)", amountMinor: amount });
  }
  if (!lines.length) return { error: "No lines with a date and an amount were found" };
  return { lines, skipped };
}
