import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { logout } from "@/lib/server/actions/auth";
import { db } from "@/lib/server/db";
import { Logo } from "@/components/Logo";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireAdmin();
  const org = await db.organization.findUnique({ where: { id: s.orgId }, select: { name: true } });
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/admin"><Logo className="text-lg" /></Link>
          <Link href="/till" className="btn-primary px-3 py-1.5 text-xs lg:hidden">Till</Link>
        </div>
        <div className="hidden px-4 pb-3 text-xs text-slate-500 lg:block">{org?.name}</div>
        <AdminNav role={s.role} />
        <div className="hidden border-t border-slate-100 p-4 lg:block">
          <Link href="/till" className="btn-primary mb-3 w-full">Open till</Link>
          <div className="text-xs text-slate-500">{s.name} · {s.role.toLowerCase()}</div>
          <form action={logout}><button className="mt-1 text-xs font-semibold text-slate-600 hover:text-slate-900">Sign out</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
