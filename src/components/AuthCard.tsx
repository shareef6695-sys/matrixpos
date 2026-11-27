import { PoweredBy } from "@/components/PoweredBy";
import Link from "next/link";
import { Logo } from "./Logo";

export function AuthCard({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white to-brand-50 px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex justify-center"><Logo className="text-2xl" /></Link>
        <div className="card">
          <h1 className="mb-5 text-xl font-bold">{title}</h1>
          {children}
        </div>
        {footer && <div className="mt-4 text-center text-sm text-slate-600">{footer}</div>}
        <PoweredBy className="mt-6 text-center" />
        <div className="mt-2 flex justify-center gap-3 text-xs text-slate-500">
          <Link href="/privacy" className="hover:text-slate-800">Privacy</Link>
          <Link href="/terms" className="hover:text-slate-800">Terms</Link>
        </div>
      </div>
    </main>
  );
}
