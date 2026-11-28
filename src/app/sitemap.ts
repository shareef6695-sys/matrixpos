import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { LANDING_PAGES } from "@/lib/landing";
import { LEGAL } from "@/lib/legal";

/** Public pages only. Add new marketing pages here (landing pages are picked up automatically). */
export default function sitemap(): MetadataRoute.Sitemap {
  const legal = new Date(LEGAL.version);
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    ...LANDING_PAGES.map((p) => ({ url: `${SITE_URL}/${p.slug}`, changeFrequency: "monthly" as const, priority: 0.9 })),
    { url: `${SITE_URL}/signup`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/privacy`, lastModified: legal, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: legal, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/dpa`, lastModified: legal, changeFrequency: "yearly", priority: 0.2 },
  ];
}
