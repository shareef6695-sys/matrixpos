import "server-only";
import type { HqLine } from "@prisma/client";
import { db } from "./db";
import { latestRates } from "./hq";
import { currencies, minorToInput } from "@/lib/hq/money";
import { seller } from "@/lib/legal";
import { londonDate } from "@/lib/dates";

/** What the quote and invoice editor needs: clients, catalogue, currencies and the latest rates. */
export async function documentFormData(alsoProject?: string | null) {
  const [clients, items, rates, projects] = await Promise.all([
    db.hqClient.findMany({ where: { archived: false }, select: { id: true, name: true, currency: true, paymentDays: true }, orderBy: { name: "asc" } }),
    db.hqItem.findMany({ where: { active: true }, select: { id: true, name: true, description: true, currency: true, priceMinor: true, unit: true }, orderBy: { name: "asc" } }),
    latestRates(),
    db.hqProject.findMany({ where: { OR: [{ status: { in: ["PLANNED", "ACTIVE", "ON_HOLD"] } }, ...(alsoProject ? [{ id: alsoProject }] : [])] }, select: { id: true, name: true, clientId: true }, orderBy: { name: "asc" } }),
  ]);
  return { clients, items, rates, projects, currencies: currencies(), chargeVat: seller().chargeVat };
}

export const linesForForm = (lines: HqLine[], currency: string) =>
  lines.map((l) => ({
    itemId: l.itemId, description: l.description, quantity: String(Number(l.quantity)), unit: minorToInput(l.unitMinor, currency),
    discountPct: Number(l.discountPct) ? String(Number(l.discountPct)) : "", taxPct: Number(l.taxPct) ? String(Number(l.taxPct)) : "",
  }));

export const ymd = (d: Date | null | undefined) => (d ? londonDate(d) : undefined);

/** Accounts for the pickers on bills, journals and bank lines. */
export async function accountOptions() {
  const { ensureHqChart } = await import("./hq-books");
  await ensureHqChart();
  const all = await db.hqAccount.findMany({ where: { archived: false }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, type: true, isBank: true, currency: true } });
  return { all, banks: all.filter((a) => a.isBank), nonBank: all.filter((a) => !a.isBank) };
}
