import "server-only";
import { db } from "./db";
import { currencies } from "@/lib/hq/money";
import { FREQUENCY_LABEL } from "@/lib/hq/labels";
import { londonDate } from "@/lib/dates";

export async function contractFormData() {
  const [clients, recurring] = await Promise.all([
    db.hqClient.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.hqRecurring.findMany({ include: { client: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    clients, currencies: currencies(), today: londonDate(),
    recurring: recurring.map((r) => ({ id: r.id, clientId: r.clientId, label: `${r.client.name}: ${r.title ?? "Invoice"} (${FREQUENCY_LABEL[r.frequency].toLowerCase()})` })),
  };
}
