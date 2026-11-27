import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "./marketing";
import { PricingCards } from "./Pricing";
import { JsonLd, SITE_NAME, SITE_URL } from "@/lib/site";
import { landingBySlug, type LandingPage } from "@/lib/landing";
import { TRIAL_DAYS } from "@/lib/plans";
import { seller } from "@/lib/legal";

export function landingMetadata(slug: string): Metadata {
  const p = landingBySlug(slug)!;
  return {
    title: { absolute: `${p.title} | ${SITE_NAME}` },
    description: p.description,
    alternates: { canonical: `/${p.slug}` },
    openGraph: { title: p.title, description: p.description, url: `/${p.slug}`, type: "website", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
  };
}

export function LandingTemplate({ slug }: { slug: string }) {
  const p = landingBySlug(slug) as LandingPage;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
        { "@type": "ListItem", position: 2, name: p.navLabel, item: `${SITE_URL}/${p.slug}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: p.faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-brand-50">
      <JsonLd data={jsonLd} />
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-4 pb-12 pt-10 text-center sm:pt-16">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">{p.h1}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">{p.intro}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="btn-primary px-6 py-3 text-base">Start your free trial</Link>
          <Link href="/#pricing" className="btn-secondary px-6 py-3 text-base">See pricing</Link>
        </div>
        <p className="mt-4 text-sm text-slate-500">From £12 a month. {TRIAL_DAYS}-day free trial, no card needed.</p>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {p.points.map(([t, d]) => (
          <div key={t} className="card">
            <h2 className="font-semibold text-slate-900">{t}</h2>
            <p className="mt-2 text-sm text-slate-600">{d}</p>
          </div>
        ))}
      </section>
      <section className="border-t border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="mb-8 text-center text-3xl font-extrabold tracking-tight text-slate-900">One flat price, no contract</h2>
          <PricingCards vat={seller().chargeVat} />
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="mb-6 text-center text-2xl font-bold text-slate-900">Questions</h2>
        <div className="space-y-3">
          {p.faqs.map(([q, a]) => (
            <details key={q} className="card">
              <summary className="cursor-pointer list-none font-semibold text-slate-900">{q}</summary>
              <p className="mt-2 text-sm text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
