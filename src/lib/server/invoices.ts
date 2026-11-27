import "server-only";
import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { db } from "./db";
import { appUrl, sendEmail } from "./email";
import { planById } from "@/lib/plans";
import { seller } from "@/lib/legal";
import { formatGBP } from "@/lib/pos/money";

const DAY = 86_400_000;
const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

export const vatOn = (netPence: number) => (seller().chargeVat ? Math.round(netPence * 0.2) : 0);

// Letters and digits that can't be mixed up when read out or typed (no 0/O, 1/I/L).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Invoice numbers look like MPI-2026-K7Q3M: the year plus a random code, checked to be unique. */
export async function nextNumber(now = new Date()) {
  const year = now.toLocaleDateString("en-GB", { year: "numeric", timeZone: "Europe/London" });
  for (;;) {
    const bytes = randomBytes(5);
    const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    const number = `MPI-${year}-${code}`;
    if (!(await db.subscriptionInvoice.findUnique({ where: { number } }))) return number;
  }
}

/** Who the invoice is addressed to: the business, its owner's email and its first shop's address. */
async function billTo(orgId: string) {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: orgId },
    include: { users: { where: { role: "OWNER" }, orderBy: { createdAt: "asc" }, take: 1 }, stores: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  const st = org.stores[0];
  return {
    org,
    billToName: org.name,
    billToEmail: org.users[0]?.email ?? null,
    billToAddress: st ? [st.addressLine1, st.addressLine2, st.town, st.postcode].filter(Boolean).join(", ") || null : null,
    billToVatNumber: org.vatNumber,
  };
}

function addCycle(from: Date, cycle: string) {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + (cycle === "YEARLY" ? 12 : 1));
  return d;
}

/** A bank-transfer invoice for the business's current plan, covering the next period. Emails it. */
export async function createBankInvoice(orgId: string, opts: { paid?: boolean } = {}) {
  const b = await billTo(orgId);
  const plan = planById(b.org.plan);
  const cycle = b.org.billingCycle;
  const net = cycle === "YEARLY" ? plan.yearlyPence : plan.monthlyPence;
  const vat = vatOn(net);
  const start = new Date(Math.max(Date.now(), b.org.paidUntil?.getTime() ?? 0));
  const end = addCycle(start, cycle);
  const now = new Date();
  const inv = await db.subscriptionInvoice.create({
    data: {
      organizationId: orgId, number: await nextNumber(), method: "BANK",
      description: `MatrixPOS ${plan.name} plan, ${cycle === "YEARLY" ? "yearly" : "monthly"}`,
      periodStart: start, periodEnd: end, netPence: net, vatPence: vat, totalPence: net + vat,
      dueAt: new Date(now.getTime() + seller().paymentDays * DAY),
      ...(opts.paid ? { status: "PAID" as const, paidAt: now } : {}),
      billToName: b.billToName, billToEmail: b.billToEmail, billToAddress: b.billToAddress, billToVatNumber: b.billToVatNumber,
    },
  });
  if (opts.paid) await applyPayment(inv.organizationId, end);
  await emailInvoice(inv.id);
  return inv;
}

/** Records a bank payment against an open invoice and extends the subscription. Emails a receipt. */
export async function markInvoicePaid(id: string) {
  const inv = await db.subscriptionInvoice.findUnique({ where: { id } });
  if (!inv || inv.status !== "OPEN") return null;
  await db.subscriptionInvoice.update({ where: { id }, data: { status: "PAID", paidAt: new Date() } });
  if (inv.periodEnd) await applyPayment(inv.organizationId, inv.periodEnd);
  await emailInvoice(id);
  return inv;
}

async function applyPayment(orgId: string, paidUntil: Date) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  await db.organization.update({
    where: { id: orgId },
    data: { paidUntil: org.paidUntil && org.paidUntil > paidUntil ? org.paidUntil : paidUntil, ...(org.closureRequestedAt ? {} : { billingStatus: "ACTIVE" }) },
  });
}

/** Saves (or updates) a Stripe card invoice so it shows in the shop's account, and emails it once paid. */
export async function saveStripeInvoice(inv: Stripe.Invoice, orgId: string) {
  if (!inv.id || !inv.number) return null;
  const b = await billTo(orgId);
  const line = inv.lines?.data?.[0];
  const net = inv.total_excluding_tax ?? inv.subtotal;
  const paid = inv.status === "paid";
  const data = {
    organizationId: orgId, number: inv.number, method: "CARD",
    status: paid ? ("PAID" as const) : inv.status === "void" || inv.status === "uncollectible" ? ("VOID" as const) : ("OPEN" as const),
    description: line?.description ?? "MatrixPOS subscription",
    periodStart: line?.period?.start ? new Date(line.period.start * 1000) : null,
    periodEnd: line?.period?.end ? new Date(line.period.end * 1000) : null,
    netPence: net, vatPence: inv.total - net, totalPence: inv.total,
    issuedAt: new Date((inv.status_transitions?.finalized_at ?? inv.created) * 1000),
    dueAt: inv.due_date ? new Date(inv.due_date * 1000) : null,
    paidAt: paid && inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000) : null,
    billToName: inv.customer_name || b.billToName, billToEmail: inv.customer_email || b.billToEmail,
    billToAddress: inv.customer_address ? [inv.customer_address.line1, inv.customer_address.line2, inv.customer_address.city, inv.customer_address.postal_code].filter(Boolean).join(", ") : b.billToAddress,
    billToVatNumber: inv.customer_tax_ids?.[0]?.value ?? b.billToVatNumber,
    stripeInvoiceId: inv.id, stripePdfUrl: inv.invoice_pdf ?? null,
  };
  const saved = await db.subscriptionInvoice.upsert({ where: { stripeInvoiceId: inv.id }, create: data, update: data });
  if (paid && !saved.emailedAt) await emailInvoice(saved.id);
  return saved;
}

/** Emails the invoice (or receipt, once paid) to the business owner with a link to view it. */
export async function emailInvoice(id: string) {
  const inv = await db.subscriptionInvoice.findUniqueOrThrow({ where: { id } });
  if (!inv.billToEmail) return false;
  const link = `${await appUrl()}/invoice/${inv.id}`;
  const s = seller();
  const paid = inv.status === "PAID";
  const lines = [
    `Hello ${inv.billToName},`,
    "",
    paid
      ? `Thank you for your payment of ${formatGBP(inv.totalPence)}${inv.method === "CARD" ? " by card" : ""}. Here is your receipt for invoice ${inv.number}.`
      : `Here is invoice ${inv.number} for ${formatGBP(inv.totalPence)}, due by ${inv.dueAt ? fmt(inv.dueAt) : "the due date"}.`,
    "",
    `${inv.description}${inv.periodStart && inv.periodEnd ? ` (${fmt(inv.periodStart)} to ${fmt(inv.periodEnd)})` : ""}`,
    "",
    "View, print or save it as a PDF:",
    link,
  ];
  if (!paid && inv.method === "BANK" && s.bank.length) lines.push("", "Please pay by bank transfer, using the invoice number as the reference:", ...s.bank);
  const ok = await sendEmail({ to: inv.billToEmail, subject: `${paid ? "Receipt" : "Invoice"} ${inv.number} from ${s.name}`, text: lines.join("\n") });
  if (ok) await db.subscriptionInvoice.update({ where: { id }, data: { emailedAt: new Date() } });
  return ok;
}

