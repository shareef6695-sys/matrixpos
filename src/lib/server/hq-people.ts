import "server-only";
import { db } from "./db";
import { platformEmails } from "./billing";

/** Everyone who can be put in charge of a client or lead: the HQ owners and active HQ staff. */
export async function hqPeople(): Promise<{ id: string; name: string }[]> {
  const emails = platformEmails();
  return db.user.findMany({
    where: { active: true, OR: [{ hqMember: { isNot: null } }, ...(emails.length ? [{ email: { in: emails }, role: "OWNER" as const }] : [])] },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
}
