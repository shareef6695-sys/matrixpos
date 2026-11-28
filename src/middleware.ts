import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verify, type AdminToken } from "@/lib/session";

/**
 * Content-Security-Policy with a fresh nonce on every page. Next.js reads the nonce from this
 * request header and puts it on its own <script> tags; any other inline or third-party script is blocked.
 * MatrixPOS loads no third-party scripts: Stripe Checkout and the billing portal are pages on stripe.com
 * we redirect to, and card terminals (Stripe Terminal, SumUp, Dojo) are driven from the server.
 */
function csp(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    // Forms post to this site only. A billing form redirects to Stripe's hosted pages.
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Calls to our API from a page on another website are refused (no CORS). Webhooks and cron jobs send no Origin. */
function crossOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestId = req.headers.get("x-vercel-id")?.split("::").pop() || crypto.randomUUID();

  if (pathname.startsWith("/api/")) {
    if (req.method === "OPTIONS" || (req.method !== "GET" && req.method !== "HEAD" && crossOrigin(req))) {
      return NextResponse.json({ error: "Cross-origin requests are not allowed" }, { status: 403, headers: { "x-request-id": requestId } });
    }
    const headers = new Headers(req.headers);
    headers.set("x-request-id", requestId);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/platform")) {
    const s = await verify<AdminToken>(req.cookies.get(ADMIN_COOKIE)?.value, "admin");
    if (!s) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("x-request-id", requestId);
  headers.set("Content-Security-Policy", policy);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", policy);
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  // Everything except Next.js build files and the static files in public/.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js).*)"],
};
