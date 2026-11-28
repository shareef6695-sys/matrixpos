import { cookies } from "next/headers";
import { TILL_COOKIE, verify, type TillSession } from "@/lib/session";
import { revoke } from "@/lib/server/revocation";
import { json } from "@/lib/server/till";
import { apiRoute } from "@/lib/server/errors";

export const POST = apiRoute("POST /api/till/logout", async () => {
  const jar = await cookies();
  // Revoke the session id too, so a copied cookie can't keep using the till after the cashier signs out.
  const t = await verify<TillSession>(jar.get(TILL_COOKIE)?.value, "till");
  if (t) await revoke(t.jti, t.exp);
  jar.delete(TILL_COOKIE);
  return json({ ok: true });
});
