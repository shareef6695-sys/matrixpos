import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MatrixPOS", template: "%s · MatrixPOS" },
  description: "Point of sale for UK supermarkets, convenience stores and small businesses.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
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
