import { PLANS } from "@/lib/plans";

/**
 * What matrixinfo.co.uk sells today (services and pricing pages, November 2026), plus the MatrixPOS plans.
 * HQ can load these once as a starting catalogue; after that they are edited in HQ like any other item.
 * Items with no price on the website are quoted after scoping, so they start at £0 to be priced on each quote.
 */
export const STARTER_CATALOGUE: {
  sku: string; name: string; kind: "SERVICE" | "SUBSCRIPTION" | "PRODUCT" | "THIRD_PARTY"; unit: string; priceMinor: number; description: string; url?: string;
}[] = [
  { sku: "WEB-STARTER", name: "Starter website", kind: "SERVICE", unit: "each", priceMinor: 39500, description: "One-page, mobile-friendly website, live in 5 working days.", url: "https://matrixinfo.co.uk/pricing" },
  { sku: "WEB-BUSINESS", name: "Business website", kind: "SERVICE", unit: "each", priceMinor: 79500, description: "Website of up to 5 pages (WordPress or Next.js), 1 to 2 weeks.", url: "https://matrixinfo.co.uk/pricing" },
  { sku: "SHOP-ONLINE", name: "Online shop", kind: "SERVICE", unit: "each", priceMinor: 129500, description: "Shopify or WooCommerce shop with up to 50 products, payments and delivery options, 2 to 3 weeks.", url: "https://matrixinfo.co.uk/pricing" },
  { sku: "APP-MVP", name: "Web app or MVP", kind: "SERVICE", unit: "each", priceMinor: 450000, description: "First version of custom web software (booking system, customer portal, dashboard), 6 to 10 weeks with 30 days of bug fixes.", url: "https://matrixinfo.co.uk/services#web-apps" },
  { sku: "APP-MOBILE", name: "Mobile app", kind: "SERVICE", unit: "each", priceMinor: 0, description: "Customer-facing or internal business app. Fixed quote after scoping.", url: "https://matrixinfo.co.uk/services" },
  { sku: "POS-CUSTOM", name: "Matrix POS custom build", kind: "SERVICE", unit: "each", priceMinor: 0, description: "Custom point of sale for shops and restaurants, with setup and training. Fixed quote after a requirements call.", url: "https://matrixinfo.co.uk/matrix-pos" },
  { sku: "CARE-PLAN", name: "Website care plan", kind: "SUBSCRIPTION", unit: "month", priceMinor: 3900, description: "Hosting, security updates, daily backups and 1 hour of small changes a month. Cancel any time.", url: "https://matrixinfo.co.uk/pricing" },
  { sku: "DEV-DAY", name: "Development day", kind: "SERVICE", unit: "day", priceMinor: 22000, description: "Additional development outside the agreed scope.", url: "https://matrixinfo.co.uk/pricing" },
  { sku: "WHITE-LABEL-DAY", name: "White-label development day", kind: "SERVICE", unit: "day", priceMinor: 22000, description: "Development for agencies under the agency's own brand.", url: "https://matrixinfo.co.uk/services" },
  { sku: "IT-CYBER", name: "Cybersecurity assessment", kind: "SERVICE", unit: "each", priceMinor: 0, description: "Security review of systems and practices. Quoted per engagement.", url: "https://matrixinfo.co.uk/services" },
  { sku: "IT-SAP", name: "SAP consulting", kind: "SERVICE", unit: "day", priceMinor: 0, description: "SAP consulting. Quoted per engagement.", url: "https://matrixinfo.co.uk/services" },
  { sku: "IT-CLOUD", name: "Cloud migration", kind: "SERVICE", unit: "each", priceMinor: 0, description: "Moving systems to the cloud. Quoted per engagement.", url: "https://matrixinfo.co.uk/services" },
  { sku: "IT-MANAGED", name: "Managed IT support", kind: "SUBSCRIPTION", unit: "month", priceMinor: 0, description: "Ongoing IT support. Quoted per client.", url: "https://matrixinfo.co.uk/services" },
  ...PLANS.flatMap((p) => [
    { sku: `POS-${p.id}-M`, name: `MatrixPOS ${p.name} plan (monthly)`, kind: "SUBSCRIPTION" as const, unit: "month", priceMinor: p.monthlyPence, description: `MatrixPOS ${p.name} subscription, billed monthly.`, url: "https://pos.matrixinfo.co.uk/signup" },
    { sku: `POS-${p.id}-Y`, name: `MatrixPOS ${p.name} plan (yearly)`, kind: "SUBSCRIPTION" as const, unit: "year", priceMinor: p.yearlyPence, description: `MatrixPOS ${p.name} subscription, billed yearly (2 months free).`, url: "https://pos.matrixinfo.co.uk/signup" },
  ]),
];
