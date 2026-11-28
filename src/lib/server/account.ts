import "server-only";
import { db } from "./db";
import { randomBytes } from "node:crypto";
import { createToken } from "./tokens";
import { hashPin } from "./auth";
import { appUrl, sendEmail } from "./email";
import { stripe, stripeBillingEnabled } from "./stripe-billing";
import { safeError } from "@/lib/server/redact";

/** Stops any card subscription straight away (used when an account is closed). */
export async function cancelCardSubscription(orgId: string) {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { stripeSubscriptionId: true } });
  if (!org?.stripeSubscriptionId || !stripeBillingEnabled()) return;
  await stripe().subscriptions.cancel(org.stripeSubscriptionId).catch((e) => console.error("Stripe cancel failed", safeError(e)));
  await db.organization.update({ where: { id: orgId }, data: { stripeSubscriptionId: null } }).catch(() => {});
}

export const CLOSURE_DAYS = 30;
/** Password reset links are short-lived: 15 minutes, used once, and asking again cancels the previous link. */
export const RESET_TOKEN_MINUTES = 15;

export async function sendVerificationEmail(user: { id: string; name: string; email: string | null }) {
  if (!user.email) return false;
  const token = await createToken(user.id, "VERIFY_EMAIL", 60 * 24 * 3);
  const link = `${await appUrl()}/verify-email?token=${token}`;
  return sendEmail({
    to: user.email,
    subject: "Confirm your email for MatrixPOS",
    text: `Hi ${user.name},\n\nPlease confirm this is your email address so we can reach you about your account and you can reset your password if you forget it.\n\n${link}\n\nThe link works for 3 days. If you didn't create a MatrixPOS account, you can ignore this email.`,
  });
}

export async function sendPasswordResetEmail(user: { id: string; name: string; email: string | null }) {
  if (!user.email) return false;
  const token = await createToken(user.id, "RESET_PASSWORD", RESET_TOKEN_MINUTES);
  const link = `${await appUrl()}/reset-password?token=${token}`;
  return sendEmail({
    to: user.email,
    subject: "Reset your MatrixPOS password",
    text: `Hi ${user.name},\n\nSomeone asked to reset the password for your MatrixPOS account. To choose a new password, open this link:\n\n${link}\n\nThe link works for ${RESET_TOKEN_MINUTES} minutes and can be used once. If it wasn't you, ignore this email and your password stays the same.`,
  });
}

/**
 * Permanently deletes a business and everything in it: stores, staff, customers, sales, accounts and logs.
 * (We are the shop's processor, so its data goes at the end of the service, as the DPA says. Shops keep
 * their own 6-year VAT records by downloading their data first.) MatrixPOS's own subscription invoices to
 * the business are our tax records: they are kept, unlinked from the business and without the email address.
 */
export async function deleteOrganization(orgId: string) {
  await cancelCardSubscription(orgId);
  await db.$transaction(async (tx) => {
    await tx.subscriptionInvoice.updateMany({ where: { organizationId: orgId }, data: { billToEmail: null } });
    await tx.journalEntry.deleteMany({ where: { organizationId: orgId } });
    await tx.sale.deleteMany({ where: { organizationId: orgId } });
    await tx.purchaseOrder.deleteMany({ where: { organizationId: orgId } });
    await tx.shift.deleteMany({ where: { store: { organizationId: orgId } } });
    await tx.organization.delete({ where: { id: orgId } });
  }, { timeout: 60_000 });
}

/** Deletes businesses whose owners asked to close them more than 30 days ago, and old sign-in records. */
export async function dailyCleanup() {
  const cutoff = new Date(Date.now() - CLOSURE_DAYS * 86_400_000);
  const due = await db.organization.findMany({ where: { closureRequestedAt: { lte: cutoff } }, select: { id: true, name: true } });
  for (const o of due) await deleteOrganization(o.id);
  const day = new Date(Date.now() - 86_400_000);
  const attempts = await db.loginAttempt.deleteMany({ where: { createdAt: { lt: day } } });
  const tokens = await db.authToken.deleteMany({ where: { OR: [{ expiresAt: { lt: day } }, { usedAt: { lt: day } }] } });
  // Card machine attempts that never became part of a saved sale are kept 90 days for reconciliation.
  await db.cardPayment.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) }, usedAt: null } });
  const revoked = await db.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  // Tills only sync sales made in the last 14 days, so older price lists are no longer needed.
  const snapshots = await db.pricingSnapshot.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
  // Invoices of deleted businesses are kept for 6 years after the end of the financial year, so at most 7 years.
  const invoiceCutoff = new Date(Date.now() - INVOICE_RETENTION_YEARS * 365.25 * 86_400_000);
  const invoices = await db.subscriptionInvoice.deleteMany({ where: { organizationId: null, issuedAt: { lt: invoiceCutoff } } });
  return { deletedBusinesses: due.length, loginAttempts: attempts.count, tokens: tokens.count, revokedTokens: revoked.count, pricingSnapshots: snapshots.count, expiredInvoices: invoices.count };
}

export const INVOICE_RETENTION_YEARS = 7;
export const ERASED_STAFF_NAME = "Former staff member";

/**
 * UK GDPR right to erasure for a staff member. Their sales, shifts and audit entries stay (the shop needs them
 * for its VAT and till records), but everything that identifies them is removed: name, email, password,
 * PIN, two-step secret, sign-in links and store links, and their name inside audit log details.
 * They are switched off and signed out everywhere.
 */
export async function eraseStaffMember(orgId: string, userId: string) {
  const user = await db.user.findFirst({ where: { id: userId, organizationId: orgId }, select: { id: true, name: true, email: true } });
  if (!user) return false;
  const unusablePin = await hashPin(randomBytes(32).toString("hex"));
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: ERASED_STAFF_NAME, email: null, passwordHash: null, pinHash: unusablePin, totpSecret: null, totpEnabledAt: null,
        emailVerifiedAt: null, active: false, sessionVersion: { increment: 1 },
      },
    });
    await tx.authToken.deleteMany({ where: { userId: user.id } });
    await tx.userStore.deleteMany({ where: { userId: user.id } });
    // Older audit entries stored names inside their details; replace this person's name and email there.
    const needles = [user.name, user.email].filter((x): x is string => !!x && x.length >= 2);
    if (needles.length) {
      const logs = await tx.auditLog.findMany({ where: { organizationId: orgId }, select: { id: true, detail: true } });
      for (const l of logs) {
        if (l.detail == null) continue;
        const text = JSON.stringify(l.detail);
        let scrubbed = text;
        for (const n of needles) scrubbed = scrubbed.split(JSON.stringify(n).slice(1, -1)).join("[REDACTED]");
        if (scrubbed !== text) await tx.auditLog.update({ where: { id: l.id }, data: { detail: JSON.parse(scrubbed) } });
      }
    }
  }, { timeout: 60_000 });
  return true;
}
