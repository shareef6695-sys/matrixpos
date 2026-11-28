import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** For uptime monitors (e.g. UptimeRobot): 200 when the app and database are working, 503 when not. */
export async function GET() {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, database: "ok", ms: Date.now() - started }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, database: "unreachable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
