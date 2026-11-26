import { cookies } from "next/headers";
import { TILL_COOKIE } from "@/lib/session";
import { json } from "@/lib/server/till";

export async function POST() {
  (await cookies()).delete(TILL_COOKIE);
  return json({ ok: true });
}
