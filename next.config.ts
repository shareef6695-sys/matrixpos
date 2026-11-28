import type { NextConfig } from "next";
import { assertEnv } from "./src/lib/env";

// A production deploy on Vercel fails at build time if a critical setting is missing,
// so the current live version keeps running instead of a broken one replacing it.
if (process.env.VERCEL_ENV === "production") assertEnv("production build");

const security = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // One year, including subdomains. Only browsers on HTTPS honour it.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing in MatrixPOS uses these browser features, so no page (or injected script) can.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // The Content-Security-Policy is set per request in src/middleware.ts, because it carries a fresh nonce.
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      { source: "/:path*", headers: security },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
