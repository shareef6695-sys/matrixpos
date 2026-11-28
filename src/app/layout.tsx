import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s · MatrixPOS" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "POS system UK", "EPOS system", "POS system for small supermarket UK", "convenience store till system",
    "corner shop EPOS", "off-licence EPOS", "cloud POS", "retail till system", "Challenge 25 till",
  ],
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_GB",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  // Set GOOGLE_SITE_VERIFICATION / BING_SITE_VERIFICATION to verify Search Console and Bing Webmaster Tools.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
};

// Every page is rendered per request, so it carries the Content-Security-Policy nonce set in middleware.
export const dynamic = "force-dynamic";

export const viewport: Viewport = { themeColor: "#0f766e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="antialiased">{children}</body>
    </html>
  );
}
