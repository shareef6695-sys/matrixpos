import "server-only";
import { chargesVatOn } from "@/lib/server/hq-vat";
import { db } from "./db";
import { accountOptions } from "./hq-forms";
import { currencies } from "@/lib/hq/money";

export async function billFormData(alsoProject?: string | null) {
  const [opts, suppliers, projects] = await Promise.all([
    accountOptions(),
    db.hqSupplier.findMany({ where: { archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true } }),
    db.hqProject.findMany({ where: { OR: [{ status: { in: ["PLANNED", "ACTIVE", "ON_HOLD"] } }, ...(alsoProject ? [{ id: alsoProject }] : [])] }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { projects, accounts: opts.nonBank, banks: opts.banks, suppliers, currencies: currencies(), chargeVat: await chargesVatOn(new Date()) };
}
