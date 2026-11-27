import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verify, type AdminSession } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const s = await verify<AdminSession>(req.cookies.get(ADMIN_COOKIE)?.value, "admin");
  if (!s) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/platform/:path*"] };
