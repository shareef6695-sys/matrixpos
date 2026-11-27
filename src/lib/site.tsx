// Public site details used for SEO: canonical URLs, sitemap, Open Graph and structured data.
import { PLANS, TRIAL_DAYS } from "./plans";
import { LEGAL } from "./legal";

/** The public address of the marketing site. Set SITE_URL to override. */
export const SITE_URL = (process.env.SITE_URL || "https://pos.matrixinfo.co.uk").replace(/\/$/, "");

export const SITE_NAME = "MatrixPOS";
export const SITE_TITLE = "MatrixPOS | POS System for UK Supermarkets & Convenience Stores";
export const SITE_DESCRIPTION =
  `Cloud EPOS till for UK supermarkets, convenience stores and small shops. Barcode scanning, UK VAT, Challenge 25, works offline. From £12/month, ${TRIAL_DAYS}-day free trial.`;

/** The company's main website. */
export const COMPANY_URL = "https://matrixinfo.co.uk";

const pounds = (pence: number) => (pence / 100).toFixed(2);

/** schema.org data for the home page: the company, the software with its prices, and the FAQs. */
export function homeJsonLd(faqs: [string, string][]) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: LEGAL.company,
      url: COMPANY_URL,
      logo: `${SITE_URL}/icon.svg`,
      address: {
        "@type": "PostalAddress",
        streetAddress: "Fifth Floor, 167-169 Great Portland Street",
        addressLocality: "London",
        postalCode: "W1W 5PF",
        addressCountry: "GB",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Point of sale",
      operatingSystem: "Web browser, Windows, macOS, Android, iPadOS",
      areaServed: { "@type": "Country", name: "United Kingdom" },
      publisher: { "@id": `${SITE_URL}/#organization` },
      offers: PLANS.map((p) => ({
        "@type": "Offer",
        name: `${p.name} plan`,
        description: p.tagline,
        price: pounds(p.monthlyPence),
        priceCurrency: "GBP",
        url: `${SITE_URL}/signup?plan=${p.id}`,
        availability: "https://schema.org/InStock",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: pounds(p.monthlyPence),
          priceCurrency: "GBP",
          billingDuration: "P1M",
          unitText: "MONTH",
        },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
}

/** Renders schema.org data as a script tag. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
