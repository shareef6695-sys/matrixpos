"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/server/db";
import { compare, hash, getAdmin, passwordProblem, requireAdmin } from "@/lib/server/auth";
import { audit } from "@/lib/server/till";
import { consumeToken } from "@/lib/server/tokens";
import { CLOSURE_DAYS, cancelCardSubscription, deleteOrganization, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/server/account";
import { sendEmail } from "@/lib/server/email";
import { clearAttempts, clientIp, isLimited, overLimit, recordAttempt } from "@/lib/server/ratelimit";
import { newSecret, verifyTotp } from "@/lib/server/totp";
import { openSecret, sealSecret } from "@/lib/server/secret-box";
import { requirePlatformAdmin } from "@/lib/server/billing";
import { ADMIN_COOKIE } from "@/lib/session";
import { LEGAL } from "@/lib/legal";
import { startSession, type FormState } from "./auth";

/** The public demo login is shared, so nobody may change its password, two-step sign-in or close it. */
const DEMO = "Not available on the demo account.";
const PW_LIMIT = "Too many wrong passwords. Please wait 15 minutes and try again.";
const isDemo = (email: string | null | undefined) => !!email?.endsWith("@demo.matrixpos.uk");

// ---------------- Email verification ----------------

export async function resendVerification(): Promise<FormState> {
  const s = await requireAdmin("MANAGER", { allowLocked: true });
  if (await isLimited(`verify:${s.userId}`, 3, 60)) return { error: "We've sent a few already. Check your spam folder, or try again in an hour." };
  await recordAttempt([`verify:${s.userId}`], false);
  const user = await db.user.findUniqueOrThrow({ where: { id: s.userId } });
  if (user.emailVerifiedAt) return { ok: "Your email is already confirmed." };
  return (await sendVerificationEmail(user)) ? { ok: `We've sent a new link to ${user.email}.` } : { error: "We couldn't send the email. Please try again later." };
}

// ---------------- Forgotten password ----------------

export async function forgotPassword(_: FormState, f: FormData): Promise<FormState> {
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter your email address" };
  const ip = await clientIp();
  // At most 3 reset requests an hour for one email address, and 3 an hour from one IP address.
  if ((await isLimited(`reset:${email}`, 3, 60)) || (await isLimited(`resetip:${ip}`, 3, 60)))
    return { error: "Too many requests. Please try again in an hour." };
  await recordAttempt([`reset:${email}`, `resetip:${ip}`], false);
  const user = await db.user.findUnique({ where: { email } });
  if (user?.active && user.passwordHash && !isDemo(user.email) && (user.role === "OWNER" || user.role === "MANAGER")) await sendPasswordResetEmail(user);
  // Same answer either way, so nobody can find out which emails have accounts.
  return { ok: "If that email has a MatrixPOS account, we've sent a link to reset the password. It works for 1 hour." };
}

export async function resetPassword(_: FormState, f: FormData): Promise<FormState> {
  if (await overLimit(`reset-submit:${await clientIp()}`, 10, 60)) return { error: "Too many attempts. Please try again in an hour." };
  const password = String(f.get("password") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== String(f.get("confirm") ?? "")) return { error: "The two passwords don't match" };
  const userId = await consumeToken(String(f.get("token") ?? ""), "RESET_PASSWORD");
  if (!userId) return { error: "This link has expired or was already used. Please ask for a new one." };
  // Opening the link proves they own the email address.
  // Bumping sessionVersion signs this person out on every device.
  const user = await db.user.update({ where: { id: userId }, data: { passwordHash: await hash(password), emailVerifiedAt: new Date(), sessionVersion: { increment: 1 } } });
  if (user.email) await clearAttempts([`email:${user.email}`]);
  await audit(user.organizationId, user.id, "password.reset");
  if (user.email) await sendEmail({ to: user.email, subject: "Your MatrixPOS password was changed", text: `Hi ${user.name},\n\nYour MatrixPOS password was just changed. If this wasn't you, reset it straight away and contact us.` });
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/login?reset=1");
}

export async function changePassword(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireAdmin("MANAGER", { allowLocked: true });
  const user = await db.user.findUniqueOrThrow({ where: { id: s.userId } });
  if (isDemo(user.email)) return { error: DEMO };
  if (await isLimited(`pwcheck:${user.id}`, 5, 15)) return { error: PW_LIMIT };
  const current = String(f.get("current") ?? "");
  const password = String(f.get("password") ?? "");
  if (!user.passwordHash || !(await compare(current, user.passwordHash))) { await recordAttempt([`pwcheck:${user.id}`], false); return { error: "Your current password isn't right" }; }
  const problem = passwordProblem(password);
  if (problem) return { error: `New ${problem.toLowerCase()}` };
  if (password !== String(f.get("confirm") ?? "")) return { error: "The two new passwords don't match" };
  // Signs out every other device, and keeps this one signed in with a fresh session.
  const updated = await db.user.update({ where: { id: user.id }, data: { passwordHash: await hash(password), sessionVersion: { increment: 1 } } });
  await startSession(updated);
  await audit(s.orgId, s.userId, "password.change");
  return { ok: "Password changed." };
}

// ---------------- Two-step sign-in ----------------

export async function startTotp(): Promise<FormState & { secret?: string }> {
  const s = await requireAdmin("MANAGER", { allowLocked: true });
  const me = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { email: true } });
  if (isDemo(me.email)) return { error: DEMO };
  const secret = newSecret();
  await db.user.update({ where: { id: s.userId }, data: { totpSecret: sealSecret(secret), totpEnabledAt: null } });
  revalidatePath("/admin/account");
  return { secret };
}

export async function enableTotp(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireAdmin("MANAGER", { allowLocked: true });
  const user = await db.user.findUniqueOrThrow({ where: { id: s.userId } });
  if (isDemo(user.email)) return { error: DEMO };
  if (!user.totpSecret) return { error: "Start again" };
  if (await isLimited(`mfa-setup:${user.id}`, 5, 15)) return { error: "Too many wrong codes. Please wait 15 minutes and try again." };
  if (!verifyTotp(openSecret(user.totpSecret)!, String(f.get("code") ?? ""))) {
    await recordAttempt([`mfa-setup:${user.id}`], false);
    return { error: "That code isn't right. Check the time on your phone is set automatically." };
  }
  await db.user.update({ where: { id: s.userId }, data: { totpEnabledAt: new Date() } });
  await audit(s.orgId, s.userId, "mfa.enable");
  revalidatePath("/admin/account");
  return { ok: "Two-step sign-in is on." };
}

export async function disableTotp(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireAdmin("MANAGER", { allowLocked: true });
  const user = await db.user.findUniqueOrThrow({ where: { id: s.userId } });
  if (await isLimited(`pwcheck:${user.id}`, 5, 15)) return { error: PW_LIMIT };
  if (!user.passwordHash || !(await compare(String(f.get("password") ?? ""), user.passwordHash))) { await recordAttempt([`pwcheck:${user.id}`], false); return { error: "Password isn't right" }; }
  await db.user.update({ where: { id: s.userId }, data: { totpSecret: null, totpEnabledAt: null } });
  await audit(s.orgId, s.userId, "mfa.disable");
  revalidatePath("/admin/account");
  return { ok: "Two-step sign-in is off." };
}

// ---------------- Terms ----------------

export async function acceptTerms() {
  const s = await requireAdmin("OWNER", { allowLocked: true });
  await db.organization.update({ where: { id: s.orgId }, data: { termsAcceptedAt: new Date(), termsVersion: LEGAL.version } });
  await audit(s.orgId, s.userId, "terms.accept", { version: LEGAL.version });
  revalidatePath("/admin", "layout");
}

// ---------------- Closing the account ----------------

export async function requestClosure(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireAdmin("OWNER", { allowLocked: true });
  const [org, user] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: s.orgId } }),
    db.user.findUniqueOrThrow({ where: { id: s.userId } }),
  ]);
  if (isDemo(user.email)) return { error: DEMO };
  if (String(f.get("confirmName") ?? "").trim().toLowerCase() !== org.name.trim().toLowerCase()) return { error: "Type your business name exactly to confirm" };
  if (await isLimited(`pwcheck:${user.id}`, 5, 15)) return { error: PW_LIMIT };
  if (!user.passwordHash || !(await compare(String(f.get("password") ?? ""), user.passwordHash))) { await recordAttempt([`pwcheck:${user.id}`], false); return { error: "Password isn't right" }; }
  await cancelCardSubscription(org.id);
  await db.organization.update({ where: { id: org.id }, data: { closureRequestedAt: new Date(), billingStatus: "CANCELLED" } });
  await audit(org.id, user.id, "account.close.request");
  const when = new Date(Date.now() + CLOSURE_DAYS * 86_400_000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
  if (user.email) await sendEmail({ to: user.email, subject: "Your MatrixPOS account is closing", text: `Hi ${user.name},\n\nWe've closed ${org.name}. Your tills and back office are now switched off. All your data will be permanently deleted on ${when}.\n\nChanged your mind? Sign in before then and choose "Keep my account" on the Plan & billing page. Download your data from the same page if you need a copy.` });
  revalidatePath("/admin/billing");
  return { ok: `Your account is closed. Your data will be deleted on ${when}.` };
}

export async function cancelClosure() {
  const s = await requireAdmin("OWNER", { allowLocked: true });
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.orgId } });
  const now = Date.now();
  const status = org.paidUntil && org.paidUntil.getTime() > now ? "ACTIVE" : "TRIAL";
  await db.organization.update({ where: { id: s.orgId }, data: { closureRequestedAt: null, billingStatus: status } });
  await audit(s.orgId, s.userId, "account.close.cancel");
  revalidatePath("/admin", "layout");
}

/** Platform owner: delete a closing business straight away instead of waiting 30 days. */
export async function platformDeleteNow(f: FormData) {
  await requirePlatformAdmin();
  const id = String(f.get("id") ?? "");
  const org = await db.organization.findUnique({ where: { id } });
  if (!org?.closureRequestedAt) return;
  if (String(f.get("confirmName") ?? "").trim() !== org.name.trim()) redirect(`/platform/${id}?confirm=1`);
  const me = await getAdmin();
  if (me?.orgId === id) return;
  await deleteOrganization(id);
  redirect("/platform?deleted=1");
}

/** Platform owner: switch off two-step sign-in for someone who lost their phone. */
export async function platformResetMfa(f: FormData) {
  const admin = await requirePlatformAdmin();
  const userId = String(f.get("userId") ?? "");
  const user = await db.user.update({ where: { id: userId }, data: { totpSecret: null, totpEnabledAt: null } });
  await audit(user.organizationId, null, "platform.mfa.reset", { by: admin.name, userId: user.id });
  revalidatePath(`/platform/${user.organizationId}`);
}
