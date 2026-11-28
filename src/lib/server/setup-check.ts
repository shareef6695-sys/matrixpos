import "server-only";
import { emailMode } from "./email";

/** Settings the live site needs, for the checklist on the HQ dashboard. */
export function setupChecks() {
  const has = (k: string) => !!process.env[k]?.trim();
  return [
    { ok: emailMode() !== "none", label: "Email sending", fix: "Add RESEND_API_KEY, or SMTP_HOST, SMTP_USER and SMTP_PASSWORD, plus EMAIL_FROM. Without it nobody can confirm their email or reset a password." },
    { ok: has("APP_URL"), label: "Site address for email links", fix: "Add APP_URL = https://pos.matrixinfo.co.uk" },
    { ok: has("CRON_SECRET"), label: "Nightly clean-up job", fix: "Add CRON_SECRET (any long random text) so closed accounts are deleted after 30 days." },
    { ok: has("INVOICE_BANK_DETAILS"), label: "Bank details on invoices", fix: "Add INVOICE_BANK_DETAILS, lines separated by |" },
    { ok: !has("STRIPE_BILLING_SECRET_KEY") || has("STRIPE_WEBHOOK_SECRET"), label: "Stripe webhook", fix: "Add STRIPE_WEBHOOK_SECRET from your Stripe webhook, or card payments won't update shops." },
  ];
}
