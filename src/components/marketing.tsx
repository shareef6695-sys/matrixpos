import Link from "next/link";
import { Logo } from "./Logo";
import { PoweredBy } from "./PoweredBy";
import { LANDING_PAGES } from "@/lib/landing";

export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
      <Link href="/" aria-label="MatrixPOS home"><Logo className="text-xl" /></Link>
      <nav className="flex gap-2">
        <Link href="/#pricing" className="btn-secondary hidden sm:inline-flex">Pricing</Link>
        <Link href="/till" className="btn-secondary">Open till</Link>
        <Link href="/login" className="btn-secondary">Sign in</Link>
        <Link href="/signup" className="btn-primary hidden sm:inline-flex">Start free</Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-500">
      <nav aria-label="Who MatrixPOS is for" className="mb-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-semibold text-slate-600">
        {LANDING_PAGES.map((p) => (
          <Link key={p.slug} href={`/${p.slug}`} className="hover:text-slate-900">{p.navLabel}</Link>
        ))}
      </nav>
      MatrixPOS · Data hosted in the United Kingdom · UK GDPR ready
      <div className="mt-2 flex justify-center gap-4 font-semibold text-slate-600">
        <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
        <Link href="/terms" className="hover:text-slate-900">Terms</Link>
        <Link href="/dpa" className="hover:text-slate-900">Data processing</Link>
      </div>
      <PoweredBy className="mt-1" />
    </footer>
  );
}
