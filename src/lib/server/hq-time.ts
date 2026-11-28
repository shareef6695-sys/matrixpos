import "server-only";
import { db } from "./db";

/** Open projects with their open tasks, for the time and timer forms. */
export async function projectPicks() {
  const ps = await db.hqProject.findMany({
    where: { status: { in: ["PLANNED", "ACTIVE", "ON_HOLD"] } },
    include: { client: { select: { name: true } }, tasks: { where: { status: { not: "DONE" } }, select: { id: true, title: true }, orderBy: { position: "asc" } } },
    orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
  });
  return ps.map((p) => ({ id: p.id, name: p.name, client: p.client?.name ?? null, billed: p.billing !== "NONE", tasks: p.tasks }));
}

/** User id → name for HQ people shown on time and tasks. */
export async function peopleNames(ids: (string | null)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  return new Map((await db.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
}
