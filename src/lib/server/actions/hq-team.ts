"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { hashPin } from "@/lib/server/auth";
import { requireHq, hqAudit } from "@/lib/server/hq";
import { platformEmails } from "@/lib/server/billing";
import { createToken } from "@/lib/server/tokens";
import { appUrl, sendEmail } from "@/lib/server/email";
import { STAFF_ROLES } from "@/lib/hq/roles";
import type { FormState } from "./auth";

/** Invite links last 2 days (password reset links last 15 minutes; an invite may sit in an inbox overnight). */
const INVITE_MINUTES = 60 * 48;

async function sendInvite(user: { id: string; name: string; email: string }, inviter: string) {
  const token = await createToken(user.id, "RESET_PASSWORD", INVITE_MINUTES);
  const link = `${await appUrl()}/reset-password?token=${token}`;
  return sendEmail({
    to: user.email,
    subject: "You've been invited to Matrix HQ",
    text: `Hi ${user.name},\n\n${inviter} has added you to Matrix HQ, Matrix Infotech's business system. Choose your password here to get started:\n\n${link}\n\nThe link works for 2 days and can be used once. Then sign in at ${await appUrl()}/login with this email address.\n\nIf you weren't expecting this, you can ignore this email.`,
  });
}

const inviteSchema = z.object({
  name: z.string().trim().min(2, "Enter their name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(STAFF_ROLES, { errorMap: () => ({ message: "Choose a role" }) }),
});

/**
 * Adds a member of HQ staff. They get their own login in the owner's account, marked as HQ staff, so they can
 * sign in to HQ but never to a shop's back office or a till (they have no usable PIN).
 */
export async function inviteHqStaff(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("team.manage");
  const p = inviteSchema.safeParse({ name: f.get("name"), email: f.get("email"), role: f.get("role") });
  if (!p.success) return { error: p.error.issues[0].message };
  const { name, email, role } = p.data;
  if (platformEmails().includes(email)) return { error: "That address is an HQ owner already" };
  if (await db.user.findUnique({ where: { email } })) return { error: "That email already has a MatrixPOS login. Use a different address for HQ." };
  const user = await db.user.create({
    data: {
      organizationId: h.orgId, name, email, role: "MANAGER",
      // Not digits, so it can never be typed at a till.
      pinHash: await hashPin(randomBytes(24).toString("hex")),
      hqMember: { create: { role, invitedById: h.userId } },
    },
  });
  const sent = await sendInvite({ id: user.id, name, email }, h.name);
  await hqAudit(h, "staff.invite", { staffId: user.id, role });
  revalidatePath("/platform/team");
  return sent ? { ok: `Invite sent to ${email}` } : { error: "Added, but the invite email couldn't be sent. Check the email settings, then press Resend invite." };
}

export async function updateHqStaff(f: FormData) {
  const h = await requireHq("team.manage");
  const id = String(f.get("id") ?? "");
  const op = String(f.get("op") ?? "");
  const m = await db.hqMember.findUnique({ where: { id }, include: { user: true } });
  if (!m) return;
  if (op === "role") {
    const role = z.enum(STAFF_ROLES).safeParse(f.get("role"));
    if (!role.success) return;
    await db.hqMember.update({ where: { id }, data: { role: role.data } });
    await hqAudit(h, "staff.role", { staffId: m.userId, role: role.data });
  } else if (op === "disable" || op === "enable") {
    // Switching someone off also signs them out everywhere straight away.
    await db.user.update({ where: { id: m.userId }, data: { active: op === "enable", sessionVersion: { increment: 1 } } });
    await hqAudit(h, `staff.${op}`, { staffId: m.userId });
  } else if (op === "resend" && m.user.email && m.user.active) {
    await sendInvite({ id: m.userId, name: m.user.name, email: m.user.email }, h.name);
    await hqAudit(h, "staff.resend", { staffId: m.userId });
  }
  revalidatePath("/platform/team");
}
