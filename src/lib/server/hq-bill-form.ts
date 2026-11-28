import "server-only";
import { db } from "./db";
import { accountOptions } from "./hq-forms";
import { currencies } from "@/lib/hq/money";
import { seller } from "@/lib/legal";

export async function billFormData() {
  const [opts, suppliers] = await Promise.all([
    accountOptions(),
    db.hqSupplier.findMany({ where: { archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true } }),
  ]);
  return { accounts: opts.nonBank, banks: opts.banks, suppliers, currencies: currencies(), chargeVat: seller().chargeVat };
}
