import { cookies } from "next/headers";
import { TILL_COOKIE } from "@/lib/session";
import { json } from "@/lib/server/till";
import { apiRoute } from "@/lib/server/errors";

export const POST = apiRoute("POST /api/till/logout", async () => {
  (await cookies()).delete(TILL_COOKIE);
  return json({ ok: true });
});
