// Sharing a document by WhatsApp: the pure parts, unit tested.

/**
 * A phone number as WhatsApp's link wants it: country code and digits only. UK numbers typed the
 * usual way (07700 900123) get 44 in front. Returns null if it doesn't look like a phone number.
 */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // "(0)" in "+44 (0)7700 900123" is not dialled from abroad.
  let d = phone.trim().replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = `44${d.slice(1)}`;
  d = d.replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** A wa.me link that opens WhatsApp with the message typed in. Without a number, WhatsApp asks who to send it to. */
export const waLink = (phone: string | null | undefined, text: string) => {
  const n = waNumber(phone);
  return `https://wa.me/${n ?? ""}?text=${encodeURIComponent(text)}`;
};

/** The WhatsApp message for a document, with its link. */
export function shareText(p: { kind: "quote" | "invoice" | "credit"; number: string; to: string; amount: string; date?: string | null; paid?: boolean; from: string; link: string }) {
  const what = p.kind === "quote" ? `our quote ${p.number} for ${p.amount}${p.date ? `, valid until ${p.date}` : ""}`
    : p.kind === "credit" ? `credit note ${p.number} for ${p.amount}`
    : p.paid ? `your receipt for invoice ${p.number} (${p.amount}, paid in full)`
    : `invoice ${p.number} for ${p.amount}${p.date ? `, due by ${p.date}` : ""}`;
  return `Hello ${p.to}, here is ${what}. View or download it here: ${p.link}\n\nThank you, ${p.from}`;
}
