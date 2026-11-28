import "server-only";
import type { HqClient, HqContact, Prisma } from "@prisma/client";
import { db } from "./db";
import { appUrl, sendEmail } from "./email";
import { safeError } from "./redact";
import { seller } from "@/lib/legal";
import { formatMoney } from "@/lib/hq/money";
import { fmtDate } from "@/lib/dates";

/** The document as a PDF attachment. If the PDF can't be made, the email still goes with its link. */
async function pdfFor(kind: "quote" | "invoice", id: string) {
  try {
    const { docPdf, loadDoc, pdfName } = await import("./hq-pdf");
    const doc = await loadDoc(kind, { id });
    return doc ? [{ filename: pdfName(doc.d), content: await docPdf(doc.d), contentType: "application/pdf" }] : [];
  } catch (e) {
    console.error("PDF attachment failed", safeError(e));
    return [];
  }
}

/** Who a document goes to: the client's details, and the primary contact's email if the client has none. */
export function billTo(c: HqClient & { contacts?: HqContact[] }) {
  const contact = c.contacts?.find((x) => x.isPrimary) ?? c.contacts?.[0];
  return {
    billToName: c.name,
    billToAddress: [c.addressLine1, c.addressLine2, c.town, c.postcode, c.country !== "United Kingdom" ? c.country : null].filter(Boolean).join(", ") || null,
    billToEmail: c.email || contact?.email || null,
    billToVatNumber: c.vatNumber,
  };
}

export async function emailQuote(id: string) {
  const q = await db.hqQuote.findUniqueOrThrow({ where: { id }, include: { client: { include: { contacts: true } } } });
  const to = billTo(q.client).billToEmail;
  if (!to) return "The client has no email address. Add one on the client, or copy the link and send it yourself.";
  const s = seller();
  const link = `${await appUrl()}/q/${q.publicToken}`;
  const ok = await sendEmail({
    to,
    attachments: await pdfFor("quote", id),
    subject: `Quote ${q.number}${q.title ? `: ${q.title}` : ""} from ${s.name}`,
    text: [
      `Hello ${q.client.name},`, "",
      `Here is our quote ${q.number} for ${formatMoney(q.totalMinor, q.currency)}${q.expiryDate ? `, valid until ${fmtDate(q.expiryDate)}` : ""}.`, "",
      "The quote is attached as a PDF. You can also view it, and accept or decline it, here:", link, "",
      `Thank you,`, s.name,
    ].join("\n"),
  });
  return ok ? null : "The email couldn't be sent. Check the email settings, or copy the link and send it yourself.";
}

export async function emailHqInvoice(id: string) {
  const inv = await db.hqInvoice.findUniqueOrThrow({ where: { id } });
  if (!inv.billToEmail) return "The client has no email address. Add one on the client, or copy the link and send it yourself.";
  const s = seller();
  const link = `${await appUrl()}/i/${inv.publicToken}`;
  const due = inv.totalMinor - inv.paidMinor;
  const paid = inv.status === "PAID";
  const lines = [
    `Hello ${inv.billToName},`, "",
    paid
      ? `Thank you for your payment. Invoice ${inv.number} for ${formatMoney(inv.totalMinor, inv.currency)} is now paid in full.`
      : `Here is invoice ${inv.number} for ${formatMoney(due, inv.currency)}, due by ${fmtDate(inv.dueDate)}.`,
    "", "It is attached as a PDF. You can also view or print it here:", link,
  ];
  if (!paid && s.bank.length) lines.push("", "Please pay by bank transfer, using the invoice number as the reference:", ...s.bank);
  lines.push("", "Thank you,", s.name);
  const ok = await sendEmail({ to: inv.billToEmail, attachments: await pdfFor("invoice", id), subject: `${paid ? "Receipt" : "Invoice"} ${inv.number} from ${s.name}`, text: lines.join("\n") });
  return ok ? null : "The email couldn't be sent. Check the email settings, or copy the link and send it yourself.";
}

/** Re-adds the payments and sets the invoice's paid amount and status from them. */
export async function settleInvoice(tx: Prisma.TransactionClient, id: string) {
  const inv = await tx.hqInvoice.findUniqueOrThrow({ where: { id }, include: { payments: { orderBy: { date: "asc" } } } });
  if (inv.status === "VOID" || inv.status === "DRAFT") return inv;
  const paid = inv.payments.reduce((n, p) => n + p.amountMinor, 0);
  const status = paid >= inv.totalMinor ? "PAID" : paid > 0 ? "PARTIAL" : "SENT";
  return tx.hqInvoice.update({
    where: { id },
    data: { paidMinor: paid, status, paidAt: status === "PAID" ? inv.payments.at(-1)?.date ?? new Date() : null },
  });
}
