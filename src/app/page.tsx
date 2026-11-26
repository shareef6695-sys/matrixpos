import Link from "next/link";
import { Logo } from "@/components/Logo";

const features = [
  ["Fast till", "Scan any USB or Bluetooth barcode scanner, quick-pick buttons for loose items, quantity shortcuts like 6*barcode."],
  ["UK VAT built in", "20%, 5%, zero-rated and exempt goods, VAT receipts with your VAT number and a VAT summary for your returns."],
  ["Offers that just work", "Meal deals, 3 for £2, buy one get one free and percentage discounts, applied automatically."],
  ["Weighed and labelled goods", "Price-per-kg items and deli or butcher scale labels with price or weight in the barcode."],
  ["Challenge 25", "Age-restricted products prompt the cashier to check ID before payment."],
  ["Every way to pay", "Cash with change, split payments, and card via Stripe Terminal, SumUp, Dojo or any standalone terminal."],
  ["Works offline", "If the internet drops, the till keeps selling and syncs every sale when it's back."],
  ["Multi-branch", "Shared catalogue, stock per store, transfers, purchase orders and reports by branch."],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-brand-50">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo className="text-xl" />
        <nav className="flex gap-2">
          <Link href="/till" className="btn-secondary">Open till</Link>
          <Link href="/login" className="btn-secondary">Sign in</Link>
          <Link href="/signup" className="btn-primary hidden sm:inline-flex">Start free</Link>
        </nav>
      </header>
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-10 text-center sm:pt-20">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
          The point of sale built for <span className="text-brand-700">British shops</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          MatrixPOS runs on the tablet, laptop or till PC you already have. Built for supermarkets, convenience stores, off-licences, cafés and every small business in the UK.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="btn-primary px-6 py-3 text-base">Create your shop</Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">Try the demo</Link>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(([t, d]) => (
          <div key={t} className="card">
            <h3 className="font-semibold text-slate-900">{t}</h3>
            <p className="mt-2 text-sm text-slate-600">{d}</p>
          </div>
        ))}
      </section>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        MatrixPOS · Data hosted in the United Kingdom · UK GDPR ready
      </footer>
    </main>
  );
}
