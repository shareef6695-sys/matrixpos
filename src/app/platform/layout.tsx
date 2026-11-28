import { PoweredBy } from "@/components/PoweredBy";
import Link from "next/link";
import { requireHq } from "@/lib/server/hq";
import { Logo } from "@/components/Logo";
import { logout } from "@/lib/server/actions/auth";
import { ROLE_LABEL, type HqPermission } from "@/lib/hq/roles";
import { HqNav } from "./HqNav";

export const metadata = { title: "Matrix HQ", robots: { index: false } };

const NAV: [string, string, HqPermission][] = [
  ["/platform/home", "Dashboard", "dashboard.view"],
  ["/platform/leads", "Leads", "leads.view"],
  ["/platform/clients", "Clients", "clients.view"],
  ["/platform/quotes", "Quotes", "quotes.view"],
  ["/platform/invoices", "Invoices", "invoices.view"],
  ["/platform/catalogue", "Catalogue", "catalogue.view"],
  ["/platform/currencies", "Currencies", "invoices.view"],
  ["/platform", "POS customers", "shops.manage"],
  ["/platform/team", "HQ staff", "team.manage"],
];

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  // Every page and action checks again: Next.js can render a page without re-running its layout.
  const h = await requireHq();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/platform/home" className="flex items-center gap-2">
            <Logo className="text-lg" />
            <span className="badge bg-violet-100 text-violet-800">HQ</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-slate-500 sm:inline">{h.name} · {ROLE_LABEL[h.role].name}</span>
            {h.role === "OWNER" && <Link href="/admin" className="font-semibold text-slate-700 hover:text-slate-900">My shop</Link>}
            <form action={logout}><button className="btn-secondary px-3 py-1.5 text-xs">Sign out</button></form>
          </div>
        </div>
        <HqNav items={NAV.filter(([, , p]) => h.can(p)).map(([href, label]) => [href, label])} />
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6 print:p-0">{children}</main>
      <footer className="pb-6 text-center print:hidden"><PoweredBy /></footer>
    </div>
  );
}
