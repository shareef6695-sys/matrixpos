export type VatCode = "STANDARD" | "REDUCED" | "ZERO" | "EXEMPT";

/** UK VAT rates in basis points (2000 = 20%). */
export const VAT_RATES: Record<VatCode, number> = {
  STANDARD: 2000,
  REDUCED: 500,
  ZERO: 0,
  EXEMPT: 0,
};

export const VAT_LABELS: Record<VatCode, string> = {
  STANDARD: "Standard 20%",
  REDUCED: "Reduced 5%",
  ZERO: "Zero 0%",
  EXEMPT: "Exempt",
};

/** Letter printed next to each receipt line so customers can match lines to the VAT summary. */
export const VAT_LETTERS: Record<VatCode, string> = {
  STANDARD: "A",
  REDUCED: "B",
  ZERO: "C",
  EXEMPT: "E",
};

/** VAT contained in a VAT-inclusive amount (UK retail prices include VAT). */
export function vatFromGross(grossPence: number, rateBp: number): number {
  if (rateBp === 0) return 0;
  return Math.round((grossPence * rateBp) / (10000 + rateBp));
}

export interface VatBand {
  vatCode: VatCode;
  vatRate: number;
  grossPence: number;
  netPence: number;
  vatPence: number;
}

/** VAT summary calculated per rate band, the way HMRC expects on a VAT receipt. */
export function vatSummary(lines: { vatCode: VatCode; netPence: number }[]): VatBand[] {
  const bands = new Map<VatCode, number>();
  for (const l of lines) bands.set(l.vatCode, (bands.get(l.vatCode) ?? 0) + l.netPence);
  const order: VatCode[] = ["STANDARD", "REDUCED", "ZERO", "EXEMPT"];
  return order
    .filter((c) => bands.has(c))
    .map((vatCode) => {
      const grossPence = bands.get(vatCode)!;
      const vatRate = VAT_RATES[vatCode];
      const vatPence = vatFromGross(grossPence, vatRate);
      return { vatCode, vatRate, grossPence, netPence: grossPence - vatPence, vatPence };
    });
}
