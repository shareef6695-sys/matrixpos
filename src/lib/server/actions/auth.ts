"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { ensureChart } from "@/lib/server/accounting";
import { applyPlanToSettings, platformEmails } from "@/lib/server/billing";
import { TRIAL_DAYS } from "@/lib/plans";
import { compare, hash, cookieOpts } from "@/lib/server/auth";
import { ADMIN_COOKIE, ADMIN_MAX_AGE, DEVICE_COOKIE, TILL_COOKIE, sign } from "@/lib/session";

export type FormState = { error?: string; ok?: string } | undefined;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.passwordHash || !user.active || !(await compare(password, user.passwordHash)))
    return { error: "Email or password is incorrect." };
  if (user.role === "CASHIER" || user.role === "SUPERVISOR")
    return { error: "This account can only sign in at the till with a PIN." };
  const token = await sign({ kind: "admin", userId: user.id, orgId: user.organizationId, role: user.role, name: user.name }, ADMIN_MAX_AGE);
  (await cookies()).set(ADMIN_COOKIE, token, cookieOpts(ADMIN_MAX_AGE));
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/admin");
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
  password: z.string().min(8, "Password must be at least 8 characters"),
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits"),
  vatNumber: z.string().trim().max(14).optional(),
  plan: z.enum(["STARTER", "BUSINESS", "ENTERPRISE"]).default("BUSINESS"),
});

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (await db.user.findUnique({ where: { email: d.email } })) return { error: "An account with that email already exists." };

  const base = d.business.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "shop";
  let slug = base;
  for (let i = 2; await db.organization.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;

  const org = await db.organization.create({
    data: {
      name: d.business, slug, vatNumber: d.vatNumber || null,
      // The platform owner's own business is always active; everyone else starts on a free trial.
      ...(platformEmails().includes(d.email)
        ? { plan: "ENTERPRISE" as const, billingStatus: "ACTIVE" as const, billingNote: "Platform owner" }
        : { plan: d.plan, billingStatus: "TRIAL" as const, trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) }),
      settings: { create: {} },
      stores: { create: { name: d.storeName, code: "S1", postcode: d.postcode || null, registers: { create: { name: "Till 1", number: 1 } } } },
      categories: { create: [{ name: "General", sortOrder: 0 }] },
    },
    include: { stores: true },
  });
  await ensureChart(org.id);
  await applyPlanToSettings(org.id, org.plan);
  const user = await db.user.create({
    data: {
      organizationId: org.id, name: d.name, email: d.email, role: "OWNER",
      passwordHash: await hash(d.password), pinHash: await hash(d.pin),
      stores: { create: { storeId: org.stores[0].id } },
    },
  });
  const token = await sign({ kind: "admin", userId: user.id, orgId: org.id, role: "OWNER", name: user.name }, ADMIN_MAX_AGE);
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, cookieOpts(ADMIN_MAX_AGE));
  jar.delete(DEVICE_COOKIE);
  jar.delete(TILL_COOKIE);
  redirect("/admin?welcome=1");
}
