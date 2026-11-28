import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { hqSession } from "@/lib/server/hq";
import { appUrl } from "@/lib/server/email";
import { hmrcAuthorizeUrl, hmrcConfigured } from "@/lib/server/hq-vat";

export const dynamic = "force-dynamic";

/** Starts the HMRC sign-in for Making Tax Digital. Owner only. */
export async function GET() {
  const h = await hqSession();
  if (!h) return new Response("Not found", { status: 404 });
  if (h.role !== "OWNER" || !hmrcConfigured()) return NextResponse.redirect(`${await appUrl()}/platform/accounts/vat?hmrc=denied`);
  const state = randomBytes(24).toString("base64url");
  await db.hqSettings.upsert({ where: { id: "hq" }, create: { id: "hq", hmrcOauthState: state }, update: { hmrcOauthState: state } });
  return NextResponse.redirect(hmrcAuthorizeUrl(await appUrl(), state));
}
