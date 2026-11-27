import Link from "next/link";
import { Logo } from "./Logo";
import { PoweredBy } from "./PoweredBy";
import { LEGAL, legalEmail } from "@/lib/legal";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <Link href="/"><Logo className="text-xl" /></Link>
        <nav className="flex gap-4 text-sm font-semibold text-slate-600">
          <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
          <Link href="/terms" className="hover:text-slate-900">Terms</Link>
          <Link href="/dpa" className="hover:text-slate-900">DPA</Link>
        </nav>
      </header>
      <article className="mx-auto max-w-3xl px-4 pb-16 text-[15px] leading-relaxed text-slate-700 [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">Last updated {LEGAL.updated}</p>
        {children}
      </article>
      <footer className="border-t border-slate-200 py-6 text-center"><PoweredBy /></footer>
    </main>
  );
}

export function Contact() {
  const email = legalEmail();
  return email ? <a href={`mailto:${email}`} className="font-semibold text-brand-700">{email}</a> : <>the contact details on our website</>;
}
