/** All money is integer pence. */
export function formatGBP(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(Math.round(pence));
  return `${sign}£${Math.floor(abs / 100).toLocaleString("en-GB")}.${String(abs % 100).padStart(2, "0")}`;
}

/** Parse "1.99", "£1.99", "199p" into pence. Returns null if invalid. */
export function parseGBP(input: string): number | null {
  const s = input.trim().replace(/[£,\s]/g, "");
  if (!s) return null;
  if (/^-?\d+p$/i.test(s)) return parseInt(s, 10);
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const negative = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const pence = parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, "0") || "0", 10);
  return negative ? -pence : pence;
}

export function formatWeight(grams: number): string {
  return `${(grams / 1000).toFixed(3)} kg`;
}

/** Split `total` across `weights` proportionally, using largest remainder so parts sum exactly to total. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum === 0) {
    const out = weights.map(() => 0);
    out[0] = total;
    return out;
  }
  const raw = weights.map((w) => (total * w) / sum);
  const floored = raw.map((r) => Math.floor(r));
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) floored[order[k].i]++;
  return floored;
}
