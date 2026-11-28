import "server-only";
import type { HqLine } from "@prisma/client";
import { db } from "./db";
import { latestRates } from "./hq";
import { currencies, minorToInput } from "@/lib/hq/money";
import { seller } from "@/lib/legal";
import { londonDate } from "@/lib/dates";

/** What the quote and invoice editor needs: clients, catalogue, currencies and the latest rates. */
export async function documentFormData() {
  const [clients, items, rates] = await Promise.all([
    db.hqClient.findMany({ where: { archived: false }, select: { id: true, name: true, currency: true, paymentDays: true }, orderBy: { name: "asc" } }),
    db.hqItem.findMany({ where: { active: true }, select: { id: true, name: true, description: true, currency: true, priceMinor: true, unit: true }, orderBy: { name: "asc" } }),
    latestRates(),
  ]);
  return { clients, items, rates, currencies: currencies(), chargeVat: seller().chargeVat };
}

export const linesForForm = (lines: HqLine[], currency: string) =>
  lines.map((l) => ({
    itemId: l.itemId, description: l.description, quantity: String(Number(l.quantity)), unit: minorToInput(l.unitMinor, currency),
    discountPct: Number(l.discountPct) ? String(Number(l.discountPct)) : "", taxPct: Number(l.taxPct) ? String(Number(l.taxPct)) : "",
  }));

export const ymd = (d: Date | null | undefined) => (d ? londonDate(d) : undefined);
