// Money in any currency, held as integer minor units (pence, cents, fils, yen...).

let codes: Set<string> | null = null;
/** Every ISO 4217 currency the runtime knows. */
export function currencies(): string[] {
  const list = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : ["GBP", "USD", "EUR"];
  return ["GBP", ...list.filter((c) => c !== "GBP")];
}
export function isCurrency(c: string) {
  codes ??= new Set(currencies());
  return codes.has(c);
}

/** Digits after the decimal point: 2 for GBP, 0 for JPY, 3 for KWD. */
export function minorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function formatMoney(minor: number, currency = "GBP"): string {
  const d = minorDigits(currency);
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(minor / 10 ** d);
  } catch {
    return `${currency} ${(minor / 10 ** d).toFixed(d)}`;
  }
}

/** "1,250.50" in the currency's own decimals, for form fields. */
export function minorToInput(minor: number, currency = "GBP"): string {
  const d = minorDigits(currency);
  return (minor / 10 ** d).toFixed(d);
}

/** Parses "1,250.5" or "£1250.50" into minor units. Null if it isn't a number or has too many decimals. */
export function parseMoney(input: string, currency = "GBP"): number | null {
  const s = String(input ?? "").trim().replace(/[,\s]/g, "").replace(/^[^\d.-]+/, "");
  if (!s) return null;
  const d = minorDigits(currency);
  const m = s.match(/^(-?)(\d+)(?:\.(\d*))?$/);
  if (!m || (m[3] ?? "").length > d) return null;
  const minor = parseInt(m[2], 10) * 10 ** d + parseInt((m[3] ?? "").padEnd(d, "0") || "0", 10);
  if (!Number.isSafeInteger(minor) || minor > 1e13) return null;
  return m[1] ? -minor : minor;
}

/** Converts an amount to pence, given how many units of its currency one pound buys. */
export function toGbpPence(minor: number, currency: string, perGbp: number): number {
  if (currency === "GBP") return minor;
  if (!(perGbp > 0)) return 0;
  return Math.round((minor / 10 ** minorDigits(currency) / perGbp) * 100);
}

export interface LineInput { description: string; quantity: number; unitMinor: number; discountPct: number; taxPct: number }
export interface LineTotals { amountMinor: number; taxMinor: number; grossMinor: number }

/**
 * Exact line maths in integers: quantity to 3 decimals, discount and tax to 2 decimals.
 * Amount = quantity x unit price, less the discount, rounded half up to the minor unit; tax is worked out per line.
 */
export function lineTotals(l: LineInput): LineTotals & { grossBeforeDiscount: number } {
  const q = BigInt(Math.round(l.quantity * 1000));
  const disc = BigInt(Math.round(l.discountPct * 100));
  const tax = BigInt(Math.round(l.taxPct * 100));
  const unit = BigInt(l.unitMinor);
  const roundDiv = (n: bigint, d: bigint) => (n >= 0n ? (n * 2n + d) / (2n * d) : -((-n * 2n + d) / (2n * d)));
  const before = roundDiv(q * unit, 1000n);
  const amount = roundDiv(q * unit * (10000n - disc), 1000n * 10000n);
  const taxMinor = roundDiv(amount * tax, 10000n);
  return { grossBeforeDiscount: Number(before), amountMinor: Number(amount), taxMinor: Number(taxMinor), grossMinor: Number(amount + taxMinor) };
}

export function documentTotals(lines: LineInput[]) {
  let subtotal = 0, net = 0, tax = 0;
  for (const l of lines) {
    const t = lineTotals(l);
    subtotal += t.grossBeforeDiscount;
    net += t.amountMinor;
    tax += t.taxMinor;
  }
  return { subtotalMinor: subtotal, discountMinor: subtotal - net, taxMinor: tax, totalMinor: net + tax };
}
