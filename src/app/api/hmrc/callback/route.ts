import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { hqAudit, hqSession } from "@/lib/server/hq";
import { appUrl } from "@/lib/server/email";
import { hmrcExchange, hqSettings } from "@/lib/server/hq-vat";
import { db } from "@/lib/server/db";
import { logError } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** HMRC sends the owner back here after they've signed in and agreed. */
export async function GET(req: NextRequest) {
  const h = await hqSession();
  if (!h) return new Response("Not found", { status: 404 });
  const base = await appUrl();
  const back = (r: string) => NextResponse.redirect(`${base}/platform/accounts/vat?hmrc=${r}`);
  if (h.role !== "OWNER") return back("denied");
  const p = req.nextUrl.searchParams;
  const expected = (await hqSettings())?.hmrcOauthState;
  if (!expected || !same(p.get("state") ?? "", expected)) return back("expired");
  await db.hqSettings.update({ where: { id: "hq" }, data: { hmrcOauthState: null } });
  const code = p.get("code");
  if (!code) return back(p.get("error") === "access_denied" ? "cancelled" : "failed");
  try {
    await hmrcExchange(code, base);
    await hqAudit(h, "hmrc.connect");
    return back("connected");
  } catch (e) {
    await logError("hmrc callback", e);
    return back("failed");
  }
}
