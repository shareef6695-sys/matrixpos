import type { NextRequest } from "next/server";
import { hqSession } from "@/lib/server/hq";
import { apiRoute } from "@/lib/server/errors";
import { docPdf, loadDoc, pdfName, pdfResponse, type DocKind } from "@/lib/server/hq-pdf";

export const dynamic = "force-dynamic";

/** A quote, invoice or credit note as a PDF for HQ staff (drafts included). ?download=1 saves it instead of showing it. */
export const GET = apiRoute("GET /api/hq/pdf", async (req: NextRequest, ctx: { params: Promise<{ kind: string; id: string }> }) => {
  const { kind, id } = await ctx.params;
  const h = await hqSession();
  if (!h || !["quote", "invoice", "credit"].includes(kind) || !h.can(kind === "quote" ? "quotes.view" : "invoices.view")) return new Response("Not found", { status: 404 });
  const doc = await loadDoc(kind as DocKind, { id: id.slice(0, 40) });
  if (!doc) return new Response("Not found", { status: 404 });
  return pdfResponse(await docPdf(doc.d), pdfName(doc.d), req.nextUrl.searchParams.has("download"));
});
