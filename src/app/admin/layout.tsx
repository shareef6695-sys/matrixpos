import { PoweredBy } from "@/components/PoweredBy";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { logout } from "@/lib/server/actions/auth";
import { db } from "@/lib/server/db";
import { Logo } from "@/components/Logo";
import { AdminNav } from "./AdminNav";
import { accessFor, planById } from "@/lib/plans";
import { isPlatformAdmin } from "@/lib/server/billing";
import { acceptTerms } from "@/lib/server/actions/account";
import { ResendVerification } from "./account/ResendVerification";
import { LEGAL } from "@/lib/legal";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireAdmin("MANAGER", { allowLocked: true });
  const org = await db.organization.findUnique({ where: { id: s.orgId }, select: { name: true, plan: true, billingStatus: true, trialEndsAt: true, termsVersion: true } });
  const me = await db.user.findUnique({ where: { id: s.userId }, select: { email: true, emailVerifiedAt: true } });
  const access = org ? accessFor(org) : null;
  const platform = await isPlatformAdmin();
  const banner = !access || platform ? null
    : access.message ? { tone: access.allowed ? "amber" : "red", text: access.message }
    : access.trialDaysLeft != null && access.trialDaysLeft <= 7
      ? { tone: "brand", text: `${access.trialDaysLeft} day${access.trialDaysLeft === 1 ? "" : "s"} left of your free ${planById(org!.plan).name} trial.` }
      : null;
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/admin"><Logo className="text-lg" /></Link>
          <Link href="/till" className="btn-primary px-3 py-1.5 text-xs lg:hidden">Till</Link>
        </div>
        <div className="hidden px-4 pb-3 text-xs text-slate-500 lg:block">{org?.name}</div>
        <AdminNav role={s.role} platform={platform} />
        <div className="hidden border-t border-slate-100 p-4 lg:block">
          <Link href="/till" className="btn-primary mb-3 w-full">Open till</Link>
          <Link href="/admin/account" className="block text-xs text-slate-500 hover:text-slate-900">{s.name} · {s.role.toLowerCase()} · My account</Link>
          <form action={logout}><button className="mt-1 text-xs font-semibold text-slate-600 hover:text-slate-900">Sign out</button></form>
          <PoweredBy className="mt-4" />
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        {banner && (
          <div className={`mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ${banner.tone === "red" ? "border-red-200 bg-red-50 text-red-900" : banner.tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-brand-100 bg-brand-50 text-brand-900"}`}>
            <span>{banner.text}</span>
            {s.role === "OWNER" && <Link href="/admin/billing" className="font-semibold underline">Plan & billing</Link>}
          </div>
        )}
        {me?.email && !me.emailVerifiedAt && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            <span>Please confirm your email address. We sent a link to <b>{me.email}</b>.</span>
            <ResendVerification className="font-semibold underline" />
          </div>
        )}
        {s.role === "OWNER" && org && org.termsVersion !== LEGAL.version && (
          <form action={acceptTerms} className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
            <span>
              Please review and accept our <Link href="/terms" target="_blank" className="underline">terms</Link>,{" "}
              <Link href="/privacy" target="_blank" className="underline">privacy policy</Link> and{" "}
              <Link href="/dpa" target="_blank" className="underline">data processing agreement</Link>.
            </span>
            <button className="btn-primary py-1.5 text-sm">I accept</button>
          </form>
        )}
        {children}
      </main>
    </div>
  );
}
