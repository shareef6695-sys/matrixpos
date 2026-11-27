import { PoweredBy } from "@/components/PoweredBy";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { PricingCards } from "@/components/Pricing";
import { TRIAL_DAYS } from "@/lib/plans";

const faqs = [
  ["Do I need a card to start?", `No. Every plan is free for ${TRIAL_DAYS} days and we don't ask for card details. Pick a plan when you're happy.`],
  ["Do you take a cut of my card payments?", "No. You keep your own card provider (Stripe, SumUp, Dojo or any standalone machine) and its rates. MatrixPOS is a flat monthly fee."],
  ["Do I need to buy special hardware?", "No. Use the tablet, laptop or till PC you already have, with any USB or Bluetooth barcode scanner and receipt printer."],
  ["Can I change plan later?", "Yes, up or down at any time. Your products, sales and accounts stay exactly where they are."],
  ["Where is my data kept?", "On servers in the United Kingdom, backed up every night."],
];

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
          <a href="#pricing" className="btn-secondary hidden sm:inline-flex">Pricing</a>
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
        <p className="mt-4 text-sm text-slate-500">From £12 a month. {TRIAL_DAYS}-day free trial, no card needed.</p>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(([t, d]) => (
          <div key={t} className="card">
            <h3 className="font-semibold text-slate-900">{t}</h3>
            <p className="mt-2 text-sm text-slate-600">{d}</p>
          </div>
        ))}
      </section>
      <section id="pricing" className="scroll-mt-6 border-t border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Simple pricing, less than the big names</h2>
            <p className="mt-3 text-slate-600">One flat price per business, not per till. No contracts, no setup fees and no share of your card takings.</p>
          </div>
          <PricingCards />
          <p className="mt-6 text-center text-xs text-slate-500">Prices exclude VAT. Yearly plans are paid up front.</p>
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="mb-6 text-center text-2xl font-bold text-slate-900">Questions</h2>
        <div className="space-y-3">
          {faqs.map(([q, a]) => (
            <details key={q} className="card group">
              <summary className="cursor-pointer list-none font-semibold text-slate-900">{q}</summary>
              <p className="mt-2 text-sm text-slate-600">{a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link href="/signup" className="btn-primary px-6 py-3 text-base">Start your free trial</Link>
        </div>
      </section>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        MatrixPOS · Data hosted in the United Kingdom · UK GDPR ready
        <div className="mt-2 flex justify-center gap-4 font-semibold text-slate-600">
          <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
          <Link href="/terms" className="hover:text-slate-900">Terms</Link>
          <Link href="/dpa" className="hover:text-slate-900">Data processing</Link>
        </div>
        <PoweredBy className="mt-1" />
      </footer>
    </main>
  );
}
