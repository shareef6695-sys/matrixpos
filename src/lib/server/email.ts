import "server-only";
import { headers } from "next/headers";
import { COMPANY } from "@/components/PoweredBy";
import { redact, safeError } from "@/lib/server/redact";

export interface Email { to: string; subject: string; text: string; html?: string; attachments?: { filename: string; content: Uint8Array; contentType: string }[] }

/** Which way email is sent: Resend's API, any SMTP mailbox (Zoho, Hostinger, Microsoft 365, Gmail...), or nowhere. */
export function emailMode() {
  if (process.env.RESEND_API_KEY) return "resend" as const;
  if (process.env.SMTP_HOST) return "smtp" as const;
  return "none" as const;
}

const from = () => process.env.EMAIL_FROM || "MatrixPOS <no-reply@matrixpos.uk>";

/** Sends an email. Returns false if it couldn't be sent (and logs why). Without a provider, development prints it to the console. */
export async function sendEmail(e: Email): Promise<boolean> {
  const html = e.html ?? layout(e.subject, e.text);
  try {
    const mode = emailMode();
    if (mode === "resend") {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: from(), to: [e.to], subject: e.subject, text: e.text, html, ...(e.attachments?.length ? { attachments: e.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64"), content_type: a.contentType })) } : {}) }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
      return true;
    }
    if (mode === "smtp") {
      const nodemailer = await import("nodemailer");
      const port = Number(process.env.SMTP_PORT || 465);
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port, secure: port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      });
      await t.sendMail({ from: from(), to: e.to, subject: e.subject, text: e.text, html, attachments: e.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType })) });
      return true;
    }
    // Emails hold verification and password reset links. Only on your own computer (next dev) is the
    // text printed with its links so you can click them. A preview deploy with EMAIL_LOG=1 prints it
    // with links, emails and phone numbers masked, because Vercel keeps those logs. Never on the live site.
    // The recipient address is never printed.
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[email to [REDACTED]] ${e.subject}${e.attachments?.length ? ` (attached: ${e.attachments.map((a) => `${a.filename}, ${a.content.length} bytes`).join("; ")})` : ""}\n${e.text.replace(e.to, "[REDACTED]")}\n`);
      return true;
    }
    if (process.env.EMAIL_LOG === "1" && process.env.VERCEL_ENV !== "production") {
      console.log(`[email to [REDACTED]] ${e.subject}\n${redact(e.text)}`);
      return true;
    }
    console.error("Email not sent: set RESEND_API_KEY or SMTP_HOST");
    return false;
  } catch (err) {
    console.error("Email failed", safeError(err));
    return false;
  }
}

/** The site's own address, for links in emails. */
export async function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  // On the live site, never build email links from the request's Host headers: a forged header would put
  // someone else's domain in a password reset link. Use the production domain Vercel gives us instead.
  const live = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === "production" : process.env.NODE_ENV === "production";
  if (live && process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function layout(title: string, text: string) {
  const body = esc(text)
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open link</a><br><span style="font-size:12px;color:#64748b">$1</span>')
    .replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
<div style="font-weight:800;font-size:20px;margin-bottom:16px">Matrix<span style="color:#0f766e">POS</span></div>
<h1 style="font-size:18px;margin:0 0 12px">${esc(title)}</h1><div style="font-size:14px;line-height:1.6">${body}</div></div>
<p style="text-align:center;font-size:12px;color:#64748b">Powered by ${esc(COMPANY)}</p></body></html>`;
}
