import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { db } from "./db";
import { billTo } from "./hq-docs";
import { seller } from "@/lib/legal";
import { formatMoney } from "@/lib/hq/money";
import { fmtDate } from "@/lib/dates";
import type { DocData } from "@/components/hq/HqDocument";

export type DocKind = "quote" | "invoice" | "credit";

/** A quote, invoice or credit note ready to render, with what's needed to send it. */
export interface LoadedDoc { d: DocData; token: string; clientId: string | null; phone: string | null; draft: boolean }

const lines = { orderBy: { position: "asc" as const } };

export async function loadDoc(kind: DocKind, where: { id: string } | { publicToken: string }): Promise<LoadedDoc | null> {
  if (kind === "invoice") {
    const inv = await db.hqInvoice.findUnique({ where: where as { id: string }, include: { lines, client: { include: { contacts: true } } } });
    if (!inv) return null;
    const to = inv.status === "DRAFT" ? billTo(inv.client) : inv;
    return {
      token: inv.publicToken, clientId: inv.clientId, phone: phoneOf(inv.client), draft: inv.status === "DRAFT",
      d: {
        kind: "invoice", number: inv.number, title: inv.title, status: inv.status, currency: inv.currency, issueDate: inv.issueDate, endDate: inv.dueDate,
        subtotalMinor: inv.subtotalMinor, discountMinor: inv.discountMinor, taxMinor: inv.taxMinor, totalMinor: inv.totalMinor, paidMinor: inv.paidMinor,
        notes: inv.notes, terms: inv.terms, billToName: to.billToName ?? inv.client.name, billToAddress: to.billToAddress, billToEmail: to.billToEmail, billToVatNumber: to.billToVatNumber, lines: inv.lines,
      },
    };
  }
  if (kind === "quote") {
    const q = await db.hqQuote.findUnique({ where: where as { id: string }, include: { lines, client: { include: { contacts: true } } } });
    if (!q) return null;
    const to = billTo(q.client);
    return {
      token: q.publicToken, clientId: q.clientId, phone: phoneOf(q.client), draft: q.status === "DRAFT",
      d: {
        kind: "quote", number: q.number, title: q.title, status: q.status, currency: q.currency, issueDate: q.issueDate, endDate: q.expiryDate,
        subtotalMinor: q.subtotalMinor, discountMinor: q.discountMinor, taxMinor: q.taxMinor, totalMinor: q.totalMinor, notes: q.notes, terms: q.terms,
        billToName: to.billToName, billToAddress: to.billToAddress, billToEmail: to.billToEmail, billToVatNumber: to.billToVatNumber, lines: q.lines,
      },
    };
  }
  const c = await db.hqCreditNote.findUnique({ where: where as { id: string }, include: { lines, invoice: { include: { client: { include: { contacts: true } } } } } });
  if (!c) return null;
  const inv = c.invoice;
  return {
    token: c.publicToken, clientId: inv.clientId, phone: phoneOf(inv.client), draft: false,
    d: {
      kind: "credit", against: inv.number, number: c.number, title: c.reason, status: c.status, currency: c.currency, issueDate: c.date, endDate: null,
      subtotalMinor: c.subtotalMinor, discountMinor: c.discountMinor, taxMinor: c.taxMinor, totalMinor: c.totalMinor,
      notes: null, terms: null, billToName: inv.billToName ?? inv.client.name, billToAddress: inv.billToAddress, billToEmail: inv.billToEmail, billToVatNumber: inv.billToVatNumber, lines: c.lines,
    },
  };
}

export function phoneOf(c: { phone: string | null; contacts?: { phone: string | null; isPrimary: boolean }[] }) {
  const contact = c.contacts?.find((x) => x.isPrimary && x.phone) ?? c.contacts?.find((x) => x.phone);
  return c.phone || contact?.phone || null;
}

export const pdfName = (d: DocData) => `${d.kind === "credit" ? "Credit note" : d.kind === "quote" ? "Quote" : d.status === "PAID" ? "Receipt" : "Invoice"} ${d.number}.pdf`;

// ---------------- Drawing ----------------

// The standard PDF fonts only cover Western European characters; anything else is shown as "?".
const OK = /[\n\r\x20-\x7e\xa0-\xff€‘’“”–—•…]/;
const clean = (s: string) => [...s.replace(/\t/g, "  ").replace(/[  ]/g, " ")].map((c) => (OK.test(c) ? c : "?")).join("");

const A4 = { w: 595.28, h: 841.89 }, M = 50;
const INK = rgb(0.12, 0.16, 0.22), MUTED = rgb(0.39, 0.45, 0.55), BRAND = rgb(0.36, 0.13, 0.71), RULE = rgb(0.82, 0.85, 0.89);

/** Splits text into lines no wider than `width`, keeping the line breaks typed. */
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const para of clean(text).split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
      if (line) out.push(line);
      // A single word longer than the line is cut.
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
        let n = w.length - 1;
        while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > width) n--;
        out.push(w.slice(0, n));
        w = w.slice(n);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

/** The same quote, invoice or credit note as the page shows, as an A4 PDF. */
export async function docPdf(d: DocData): Promise<Uint8Array> {
  const s = seller();
  const pdf = await PDFDocument.create();
  pdf.setTitle(clean(pdfName(d).replace(/\.pdf$/, "")));
  pdf.setAuthor(clean(s.name));
  pdf.setCreator("Matrix HQ");
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const text = (t: string, x: number, size = 9.5, f = reg, color = INK) => page.drawText(clean(t), { x, y, size, font: f, color });
  const right = (t: string, xr: number, size = 9.5, f = reg, color = INK) => page.drawText(clean(t), { x: xr - f.widthOfTextAtSize(clean(t), size), y, size, font: f, color });
  const room = (h: number) => { if (y - h < M + 20) { page = pdf.addPage([A4.w, A4.h]); y = A4.h - M; } };
  const money = (n: number) => formatMoney(n, d.currency);

  const paid = d.kind === "invoice" && d.status === "PAID";
  const heading = d.kind === "credit" ? (d.status === "VOID" ? "Credit note (cancelled)" : "Credit note") : d.kind === "quote" ? "Quote" : paid ? "Receipt" : d.status === "VOID" ? "Invoice (cancelled)" : "Invoice";

  // Seller on the left, the document on the right.
  const top = y;
  text(s.name, M, 16, bold, BRAND); y -= 18;
  for (const l of [...s.address, s.email, s.companyNumber ? `Registered in England and Wales, company no. ${s.companyNumber}` : "", s.vatNumber ? `VAT no. ${s.vatNumber}` : ""].filter(Boolean)) { text(l, M, 9, reg, MUTED); y -= 12; }
  const leftEnd = y;
  y = top;
  right(heading, A4.w - M, 18, bold); y -= 18;
  right(d.number, A4.w - M, 10, bold); y -= 18;
  right(`Date: ${fmtDate(d.issueDate)}`, A4.w - M); y -= 13;
  if (d.against) { right(`Against invoice: ${d.against}`, A4.w - M); y -= 13; }
  if (d.endDate) { right(`${d.kind === "quote" ? "Valid until" : "Due"}: ${fmtDate(d.endDate)}`, A4.w - M); y -= 13; }
  y = Math.min(y, leftEnd) - 18;

  text(d.kind === "quote" ? "PREPARED FOR" : d.kind === "credit" ? "CREDITED TO" : "BILL TO", M, 8, bold, MUTED); y -= 13;
  text(d.billToName, M, 10.5, bold); y -= 13;
  for (const l of [...(d.billToAddress ? wrap(d.billToAddress, reg, 9.5, 300) : []), d.billToEmail ?? "", d.billToVatNumber ? `VAT no. ${d.billToVatNumber}` : ""].filter(Boolean)) { text(l, M, 9.5); y -= 12; }
  if (d.title) { y -= 10; for (const l of wrap(d.title, bold, 11.5, A4.w - 2 * M)) { text(l, M, 11.5, bold); y -= 15; } }
  y -= 12;

  // Lines
  const anyDiscount = d.lines.some((l) => Number(l.discountPct) > 0);
  const anyTax = d.lines.some((l) => Number(l.taxPct) > 0);
  const cols: { label: string; w: number; get: (l: DocData["lines"][number]) => string }[] = [
    { label: "QTY", w: 40, get: (l) => Number(l.quantity).toLocaleString("en-GB", { maximumFractionDigits: 3 }) },
    { label: "PRICE", w: 75, get: (l) => money(l.unitMinor) },
    ...(anyDiscount ? [{ label: "DISC", w: 40, get: (l: DocData["lines"][number]) => (Number(l.discountPct) ? `${Number(l.discountPct)}%` : "") }] : []),
    ...(anyTax ? [{ label: "VAT", w: 35, get: (l: DocData["lines"][number]) => `${Number(l.taxPct)}%` }] : []),
    { label: "AMOUNT", w: 80, get: (l) => money(l.amountMinor) },
  ];
  const descW = A4.w - 2 * M - cols.reduce((n, c) => n + c.w, 0) - 10;
  const header = () => {
    text("DESCRIPTION", M, 8, bold, MUTED);
    let x = M + descW + 10;
    for (const c of cols) { x += c.w; right(c.label, x, 8, bold, MUTED); }
    y -= 6; page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.8, color: RULE }); y -= 14;
  };
  header();
  for (const l of d.lines) {
    const desc = wrap(l.description, reg, 9.5, descW);
    room(desc.length * 12 + 8);
    if (y === A4.h - M) header();
    const rowTop = y;
    let x = M + descW + 10;
    for (const c of cols) { x += c.w; right(c.get(l), x); }
    for (const t of desc) { text(t, M); y -= 12; }
    y = Math.min(y, rowTop - 12) - 4;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: A4.w - M, y: y + 6 }, thickness: 0.4, color: RULE });
    y -= 6;
  }

  // Totals
  const total = (label: string, n: string, b = false, size = 9.5) => { room(16); right(label, A4.w - M - 95, size, b ? bold : reg); right(n, A4.w - M, size, b ? bold : reg); y -= size + 5; };
  y -= 4;
  if (d.discountMinor > 0) { total("Subtotal", money(d.subtotalMinor)); total("Discount", `-${money(d.discountMinor)}`); }
  if (d.taxMinor > 0) total("VAT", money(d.taxMinor));
  total(`${d.kind === "credit" ? "Total credited" : "Total"} (${d.currency})`, money(d.totalMinor), true, 11.5);
  const due = d.totalMinor - (d.paidMinor ?? 0);
  if (d.kind === "invoice" && (d.paidMinor ?? 0) > 0) { total("Paid", `-${money(d.paidMinor!)}`); total("Left to pay", money(due), true); }
  y -= 10;

  const para = (t: string, size = 9.5, f = reg, color = INK) => { for (const l of wrap(t, f, size, A4.w - 2 * M)) { room(size + 4); text(l, M, size, f, color); y -= size + 3; } y -= 6; };
  if (!d.taxMinor && !s.chargeVat) para(`${s.name} is not registered for VAT, so no VAT is charged.`, 8.5, reg, MUTED);
  if (d.notes) para(d.notes);
  if (d.kind === "invoice" && due > 0 && d.status !== "VOID" && s.bank.length) {
    para("How to pay", 10, bold);
    para(`By bank transfer, using ${d.number} as the reference.`);
    for (const l of s.bank) para(l);
  }
  if (d.terms) { para("Terms", 8.5, bold, MUTED); para(d.terms, 8.5, reg, MUTED); }

  // Page numbers when it runs over a page.
  const pages = pdf.getPages();
  if (pages.length > 1) pages.forEach((p, i) => { const t = `Page ${i + 1} of ${pages.length}`; p.drawText(t, { x: A4.w - M - reg.widthOfTextAtSize(t, 8), y: M - 20, size: 8, font: reg, color: MUTED }); });
  return pdf.save();
}

/** The response for a PDF: shown in the browser to preview and print, or downloaded. */
export function pdfResponse(bytes: Uint8Array, name: string, download: boolean) {
  const safe = name.replace(/[^\w .-]/g, "");
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${safe}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
      "referrer-policy": "no-referrer",
    },
  });
}
