import "server-only";
import { db } from "./db";
import { createToken } from "./tokens";
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
  const token = await createToken(user.id, "RESET_PASSWORD", 60);
  const link = `${await appUrl()}/reset-password?token=${token}`;
  return sendEmail({
    to: user.email,
    subject: "Reset your MatrixPOS password",
    text: `Hi ${user.name},\n\nSomeone asked to reset the password for your MatrixPOS account. To choose a new password, open this link:\n\n${link}\n\nThe link works for 1 hour and can be used once. If it wasn't you, ignore this email and your password stays the same.`,
  });
}

/** Permanently deletes a business and everything in it. */
export async function deleteOrganization(orgId: string) {
  await cancelCardSubscription(orgId);
  await db.$transaction(async (tx) => {
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
  return { deletedBusinesses: due.map((o) => o.name), loginAttempts: attempts.count, tokens: tokens.count };
}
