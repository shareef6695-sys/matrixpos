import type { NextRequest } from "next/server";
import { apiRoute } from "@/lib/server/errors";
import { docPdf, loadDoc, pdfName, pdfResponse, type DocKind } from "@/lib/server/hq-pdf";

export const dynamic = "force-dynamic";

/** A client's PDF of a quote, invoice or credit note, from the secret link they were sent. Drafts are never shown. */
export const GET = apiRoute("GET /api/doc", async (req: NextRequest, ctx: { params: Promise<{ kind: string; token: string }> }) => {
  const { kind, token } = await ctx.params;
  if (!["quote", "invoice", "credit"].includes(kind) || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return new Response("Not found", { status: 404 });
  const doc = await loadDoc(kind as DocKind, { publicToken: token });
  if (!doc || doc.draft) return new Response("Not found", { status: 404 });
  return pdfResponse(await docPdf(doc.d), pdfName(doc.d), req.nextUrl.searchParams.has("download"));
});
