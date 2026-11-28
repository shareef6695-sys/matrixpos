"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { ensureChart } from "@/lib/server/accounting";
import { compare, hash, cookieOpts } from "@/lib/server/auth";
import { applyPlanToSettings } from "@/lib/server/billing";
import { sendVerificationEmail } from "@/lib/server/account";
import { clientIp, isLimited, recordAttempt } from "@/lib/server/ratelimit";
import { verifyTotp } from "@/lib/server/totp";
import { TRIAL_DAYS } from "@/lib/plans";
import { LEGAL } from "@/lib/legal";
import {
  ADMIN_COOKIE, ADMIN_MAX_AGE, DEVICE_COOKIE, TILL_COOKIE, MFA_COOKIE, MFA_MAX_AGE, sign, verify, type MfaSession,
} from "@/lib/session";

export type FormState = { error?: string; ok?: string } | undefined;

const safeNext = (n: string) => (n.startsWith("/") && !n.startsWith("//") ? n : "/admin");
const TOO_MANY = "Too many sign-in attempts. Please wait 15 minutes, or reset your password.";

export async function startSession(user: { id: string; organizationId: string; role: "OWNER" | "MANAGER" | "SUPERVISOR" | "CASHIER"; name: string; sessionVersion: number }) {
  const token = await sign({ kind: "admin", userId: user.id, orgId: user.organizationId, role: user.role, name: user.name, v: user.sessionVersion }, ADMIN_MAX_AGE);
  (await cookies()).set(ADMIN_COOKIE, token, cookieOpts(ADMIN_MAX_AGE));
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = await clientIp();
  const keys = [`email:${email}`, `ip:${ip}`];
  if ((await isLimited(keys[0], 5, 15)) || (await isLimited(keys[1], 30, 15))) return { error: TOO_MANY };

  const user = await db.user.findUnique({ where: { email } });
  if (!user?.passwordHash || !user.active || !(await compare(password, user.passwordHash))) {
    await recordAttempt(keys, false);
    return { error: "Email or password is incorrect." };
  }
  if (user.role === "CASHIER" || user.role === "SUPERVISOR")
    return { error: "This account can only sign in at the till with a PIN." };
  await recordAttempt(keys, true);
  const next = safeNext(String(form.get("next") ?? ""));

  if (user.totpEnabledAt && user.totpSecret) {
    const t = await sign({ kind: "mfa", userId: user.id, next }, MFA_MAX_AGE);
    (await cookies()).set(MFA_COOKIE, t, cookieOpts(MFA_MAX_AGE));
    redirect("/login/verify");
  }
  await startSession(user);
  redirect(next);
}

/** Second step of sign-in for accounts with an authenticator app. */
export async function verifyLoginCode(_: FormState, form: FormData): Promise<FormState> {
  const jar = await cookies();
  const pending = await verify<MfaSession>(jar.get(MFA_COOKIE)?.value, "mfa");
  if (!pending) return { error: "That took too long. Please sign in again." };
  const key = `mfa:${pending.userId}`;
  if (await isLimited(key, 5, 15)) return { error: TOO_MANY };
  const user = await db.user.findUnique({ where: { id: pending.userId } });
  if (!user?.active || !user.totpSecret) return { error: "Please sign in again." };
  if (!verifyTotp(user.totpSecret, String(form.get("code") ?? ""))) {
    await recordAttempt([key], false);
    return { error: "That code isn't right. Check your authenticator app and try again." };
  }
  await recordAttempt([key], true);
  jar.delete(MFA_COOKIE);
  await startSession(user);
  redirect(safeNext(pending.next));
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/login");
}

const signupSchema = z.object({
  business: z.string().trim().min(2, "Enter your business name").max(80),
  storeName: z.string().trim().min(2, "Enter your shop name").max(80),
  postcode: z.string().trim().max(10).optional(),
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits"),
  vatNumber: z.string().trim().max(14).optional(),
  plan: z.enum(["STARTER", "BUSINESS", "ENTERPRISE"]).default("BUSINESS"),
  terms: z.literal("on", { errorMap: () => ({ message: "Please accept the terms, privacy policy and data processing agreement" }) }),
});

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const ip = await clientIp();
  if (await isLimited(`signup:${ip}`, 10, 60)) return { error: "Too many sign-ups from this connection. Please try again later." };
  if (await db.user.findUnique({ where: { email: d.email } })) return { error: "An account with that email already exists. Try signing in or resetting your password." };

  const base = d.business.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "shop";
  let slug = base;
  for (let i = 2; await db.organization.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;

  const org = await db.organization.create({
    data: {
      name: d.business, slug, vatNumber: d.vatNumber || null,
      termsAcceptedAt: new Date(), termsVersion: LEGAL.version,
      // Everyone starts on a free trial. The platform owner's own business is never locked once their email is confirmed.
      plan: d.plan, billingStatus: "TRIAL", trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
      settings: { create: {} },
      stores: { create: { name: d.storeName, code: "S1", postcode: d.postcode || null, registers: { create: { name: "Till 1", number: 1 } } } },
      categories: { create: [{ name: "General", sortOrder: 0 }] },
    },
    include: { stores: true },
  });
  // Counts towards the sign-up limit per connection (recorded as a "failure" so it is counted).
  await recordAttempt([`signup:${ip}`], false);
  await ensureChart(org.id);
  await applyPlanToSettings(org.id, org.plan);
  const user = await db.user.create({
    data: {
      organizationId: org.id, name: d.name, email: d.email, role: "OWNER",
      passwordHash: await hash(d.password), pinHash: await hash(d.pin),
      stores: { create: { storeId: org.stores[0].id } },
    },
  });
  await sendVerificationEmail(user);
  await startSession(user);
  const jar = await cookies();
  jar.delete(DEVICE_COOKIE);
  jar.delete(TILL_COOKIE);
  redirect("/admin?welcome=1");
}
