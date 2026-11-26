/** EAN-13 / EAN-8 / UPC-A check digit validation (GS1 mod-10). */
export function isValidGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function gtinCheckDigit(body: string): number {
  const sum = body
    .split("")
    .map(Number)
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

export type EmbeddedMode = "PRICE" | "WEIGHT" | "OFF";

export interface EmbeddedBarcode {
  plu: string;
  /** Pence when mode is PRICE, grams when mode is WEIGHT. */
  value: number;
  mode: "PRICE" | "WEIGHT";
}

/**
 * UK in-store variable-measure barcodes: EAN-13 with GS1 prefix 20-29.
 * Layout used here: 2 + format digit + 5-digit PLU + 5-digit value + check digit,
 * e.g. labels printed by deli/butcher scales. The value is pence (PRICE) or grams (WEIGHT).
 */
export function parseEmbeddedBarcode(code: string, mode: EmbeddedMode): EmbeddedBarcode | null {
  if (mode === "OFF") return null;
  if (!/^2\d{12}$/.test(code) || !isValidGtin(code)) return null;
  const plu = code.slice(2, 7).replace(/^0+(?=\d)/, "");
  const value = parseInt(code.slice(7, 12), 10);
  return { plu, value, mode };
}

/** Builds an embedded label barcode; handy for tests and for printing shelf/deli labels. */
export function buildEmbeddedBarcode(plu: string, value: number, formatDigit = 0): string {
  const body = `2${formatDigit}${plu.padStart(5, "0")}${String(value).padStart(5, "0")}`;
  return body + gtinCheckDigit(body);
}

/** Supports "3*code" or "3x code" quantity prefix typed or scanned at the till. */
export function parseScanInput(raw: string): { quantity: number; code: string } {
  const m = raw.trim().match(/^(\d{1,3})\s*[x*]\s*(.+)$/i);
  if (m) return { quantity: parseInt(m[1], 10), code: m[2].trim() };
  return { quantity: 1, code: raw.trim() };
}
