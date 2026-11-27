import { PoweredBy } from "@/components/PoweredBy";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/server/billing";
import { Logo } from "@/components/Logo";
import { logout } from "@/lib/server/actions/auth";

export const metadata = { title: "MatrixPOS HQ", robots: { index: false } };

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePlatformAdmin();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/platform" className="flex items-center gap-2">
            <Logo className="text-lg" />
            <span className="badge bg-violet-100 text-violet-800">HQ</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-slate-500 sm:inline">{s.name}</span>
            <Link href="/admin" className="font-semibold text-slate-700 hover:text-slate-900">My shop</Link>
            <form action={logout}><button className="btn-secondary px-3 py-1.5 text-xs">Sign out</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      <footer className="pb-6 text-center"><PoweredBy /></footer>
    </div>
  );
}
