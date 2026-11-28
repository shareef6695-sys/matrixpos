import "server-only";
import { headers } from "next/headers";
import { COMPANY } from "@/components/PoweredBy";
import { safeError } from "@/lib/server/redact";

export interface Email { to: string; subject: string; text: string; html?: string }

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
        body: JSON.stringify({ from: from(), to: [e.to], subject: e.subject, text: e.text, html }),
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
      await t.sendMail({ from: from(), to: e.to, subject: e.subject, text: e.text, html });
      return true;
    }
    // Emails hold sign-in, verification and password reset links, so their text is only printed
    // in local development or a preview deploy, never on the live site.
    if (process.env.NODE_ENV !== "production" || (process.env.EMAIL_LOG === "1" && process.env.VERCEL_ENV !== "production")) {
      console.log(`\n[email to ${e.to}] ${e.subject}\n${e.text}\n`);
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
