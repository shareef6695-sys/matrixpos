import { describe, expect, it } from "vitest";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";
import { homeJsonLd, SITE_URL } from "../src/lib/site";
import { LANDING_PAGES } from "../src/lib/landing";
import { PLANS } from "../src/lib/plans";

describe("SEO", () => {
  it("lists the home page and every landing page in the sitemap", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain(`${SITE_URL}/`);
    for (const p of LANDING_PAGES) expect(urls).toContain(`${SITE_URL}/${p.slug}`);
    expect(urls.some((u) => u.includes("/admin") || u.includes("/till"))).toBe(false);
  });

  it("keeps private areas out of search and points to the sitemap", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.disallow).toContain("/admin");
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("publishes one offer per plan at the real monthly price", () => {
    const software = homeJsonLd([["Q", "A"]]).find((d) => d["@type"] === "SoftwareApplication") as { offers: { price: string; priceCurrency: string }[] };
    expect(software.offers.map((o) => o.price)).toEqual(PLANS.map((p) => (p.monthlyPence / 100).toFixed(2)));
    expect(software.offers.every((o) => o.priceCurrency === "GBP")).toBe(true);
  });

  it("keeps landing page titles and descriptions a sensible length", () => {
    for (const p of LANDING_PAGES) {
      expect(p.title.length).toBeLessThanOrEqual(60);
      expect(p.description.length).toBeLessThanOrEqual(170);
    }
  });
});
