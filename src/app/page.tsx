import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/marketing";
import { PricingCards } from "@/components/Pricing";
import { TRIAL_DAYS } from "@/lib/plans";
import { seller } from "@/lib/legal";
import { LANDING_PAGES } from "@/lib/landing";
import { JsonLd, homeJsonLd } from "@/lib/site";
import { showDemoLogin } from "@/lib/server/demo";

export const metadata = { alternates: { canonical: "/" } };

const faqs: [string, string][] = [
  ["Do I need a card to start?", `No. Every plan is free for ${TRIAL_DAYS} days and we don't ask for card details. Pick a plan when you're happy.`],
  ["Do you take a cut of my card payments?", "No. You keep your own card provider (Stripe, SumUp, Dojo or any standalone machine) and its rates. MatrixPOS is a flat monthly fee."],
  ["Do I need to buy special hardware?", "No. Use the tablet, laptop or till PC you already have, with any USB or Bluetooth barcode scanner and receipt printer."],
  ["Can I change plan later?", "Yes, up or down at any time. Your products, sales and accounts stay exactly where they are."],
  ["Where is my data kept?", "On servers in the United Kingdom, backed up every night."],
  ["What kind of shops use MatrixPOS?", "Independent supermarkets, mini markets, convenience stores, corner shops, off-licences, delis and butchers, and other small retailers across the UK."],
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
      <JsonLd data={homeJsonLd(faqs)} />
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-10 text-center sm:pt-20">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
          The POS system built for <span className="text-brand-700">UK supermarkets and convenience stores</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          MatrixPOS is a cloud EPOS till that runs on the tablet, laptop or till PC you already have. Built for independent supermarkets, corner shops, off-licences and every small retailer in the UK.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="btn-primary px-6 py-3 text-base">Create your shop</Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">{showDemoLogin() ? "Try the demo" : "Sign in"}</Link>
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
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="mb-6 text-center text-2xl font-bold text-slate-900">Made for your kind of shop</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {LANDING_PAGES.map((p) => (
            <Link key={p.slug} href={`/${p.slug}`} className="card transition hover:ring-2 hover:ring-brand-600">
              <h3 className="font-semibold text-slate-900">{p.navLabel}</h3>
              <p className="mt-2 text-sm text-slate-600">{p.h1}.</p>
              <span className="mt-3 inline-block text-sm font-semibold text-brand-700">Learn more →</span>
            </Link>
          ))}
        </div>
      </section>
      <section id="pricing" className="scroll-mt-6 border-t border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Simple pricing, less than the big names</h2>
            <p className="mt-3 text-slate-600">One flat price per business, not per till. No contracts, no setup fees and no share of your card takings.</p>
          </div>
          <PricingCards vat={seller().chargeVat} />
          <p className="mt-6 text-center text-xs text-slate-500">{seller().chargeVat ? "Prices exclude VAT. " : "No VAT to add. "}Yearly plans are paid up front.</p>
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
      <SiteFooter />
    </main>
  );
}
