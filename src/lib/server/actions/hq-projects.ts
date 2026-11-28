"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { requireHq, hqAudit, nextInvoiceNumber, publicToken, documentRate, type HqSession } from "@/lib/server/hq";
import { billTo } from "@/lib/server/hq-docs";
import { hqPeople } from "@/lib/server/hq-people";
import { nextTerm } from "@/lib/server/hq-contracts";
import { isCurrency, parseMoney, documentTotals } from "@/lib/hq/money";
import { parseDuration, timeInvoiceLines } from "@/lib/hq/projects";
import { londonDate, londonDayStart, addDays } from "@/lib/dates";
import type { FormState } from "./auth";

const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);
const opt = (f: FormData, k: string, max = 500) => str(f, k, max) || null;
const ymd = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? londonDayStart(s) : null);
const back = (path: string, msg?: string | null): never => redirect(msg ? `${path}?error=${encodeURIComponent(msg)}` : path);

const STATUSES = ["PLANNED", "ACTIVE", "ON_HOLD", "DONE", "CANCELLED"] as const;
const BILLING = ["FIXED", "HOURLY", "NONE"] as const;
const TASK_STATUS = ["TODO", "DOING", "REVIEW", "DONE"] as const;
const PRIORITY = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

/** Only HQ people can be put in charge of a project or given a task. */
async function personOrNull(id: string | null) {
  if (!id) return null;
  return (await hqPeople()).some((p) => p.id === id) ? id : undefined;
}

// ---------------- Projects ----------------

export async function saveProject(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("projects.edit");
  const id = opt(f, "id", 40);
  const name = str(f, "name", 160);
  if (!name) return { error: "Give the project a name" };
  const clientId = opt(f, "clientId", 40);
  const client = clientId ? await db.hqClient.findUnique({ where: { id: clientId } }) : null;
  if (clientId && !client) return { error: "Choose a client" };
  const currency = str(f, "currency", 3).toUpperCase() || client?.currency || "GBP";
  if (!isCurrency(currency)) return { error: "Choose a currency" };
  const status = z.enum(STATUSES).safeParse(str(f, "status") || "ACTIVE");
  const billing = z.enum(BILLING).safeParse(str(f, "billing") || "FIXED");
  if (!status.success || !billing.success) return { error: "Choose the status and how it's billed" };
  const budget = str(f, "budget") ? parseMoney(str(f, "budget"), currency) : 0;
  const rate = str(f, "rate") ? parseMoney(str(f, "rate"), currency) : 0;
  if (budget === null || budget < 0 || budget > 1e12) return { error: "Enter the price or budget as a number" };
  if (rate === null || rate < 0 || rate > 1e10) return { error: "Enter the hourly rate as a number" };
  if (billing.data === "HOURLY" && !rate) return { error: "Enter the hourly rate for an hourly project" };
  const hoursRaw = str(f, "budgetHours");
  const budgetHours = hoursRaw ? Number(hoursRaw) : null;
  if (budgetHours !== null && (!Number.isFinite(budgetHours) || budgetHours < 0 || budgetHours > 100000)) return { error: "Enter the budgeted hours as a number" };
  const managerId = await personOrNull(opt(f, "managerId", 40));
  if (managerId === undefined) return { error: "Choose who is in charge from the list" };
  const startDate = opt(f, "startDate") ? ymd(str(f, "startDate")) : null;
  const dueDate = opt(f, "dueDate") ? ymd(str(f, "dueDate")) : null;
  if (startDate && dueDate && dueDate < startDate) return { error: "The due date can't be before the start" };
  const data = {
    name, clientId: client?.id ?? null, status: status.data, billing: billing.data, currency, budgetMinor: budget, rateMinor: rate, budgetHours,
    startDate, dueDate, description: opt(f, "description", 4000), managerId,
  };
  let pid = id;
  if (id) {
    const { count } = await db.hqProject.updateMany({ where: { id }, data });
    if (!count) return { error: "Project not found" };
  } else {
    const quoteId = opt(f, "quoteId", 40);
    pid = (await db.hqProject.create({ data: { ...data, quoteId, createdById: h.userId } })).id;
  }
  await hqAudit(h, id ? "project.update" : "project.create", { projectId: pid! });
  revalidatePath("/platform/projects");
  if (id) return { ok: "Project saved" };
  redirect(`/platform/projects/${pid}`);
}

export async function deleteProject(f: FormData) {
  const h = await requireHq("projects.edit");
  const p = await db.hqProject.findUnique({ where: { id: str(f, "id", 40) }, include: { _count: { select: { invoices: true, bills: true } }, time: { where: { invoiceId: { not: null } }, take: 1 } } });
  if (!p) return;
  if (p._count.invoices || p._count.bills || p.time.length) back(`/platform/projects/${p.id}`, "This project has invoices, bills or billed time, so it can't be deleted. Set it to Done or Cancelled instead.");
  await db.hqProject.delete({ where: { id: p.id } });
  await hqAudit(h, "project.delete", { projectId: p.id, name: p.name });
  redirect("/platform/projects");
}

// ---------------- Tasks ----------------

export async function saveTask(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("projects.edit");
  const id = opt(f, "id", 40);
  const project = await db.hqProject.findUnique({ where: { id: str(f, "projectId", 40) } });
  if (!project) return { error: "Project not found" };
  const title = str(f, "title", 200);
  if (!title) return { error: "Give the task a title" };
  const status = z.enum(TASK_STATUS).safeParse(str(f, "status") || "TODO");
  const priority = z.enum(PRIORITY).safeParse(str(f, "priority") || "NORMAL");
  if (!status.success || !priority.success) return { error: "Choose the status and priority" };
  const assigneeId = await personOrNull(opt(f, "assigneeId", 40));
  if (assigneeId === undefined) return { error: "Choose who it's for from the list" };
  const est = str(f, "estimate") ? parseDuration(str(f, "estimate")) : null;
  if (str(f, "estimate") && est === null) return { error: "Enter the estimate like 2:30 or 3h (up to 24 hours)" };
  const data = {
    title, description: opt(f, "description", 4000), status: status.data, priority: priority.data, assigneeId,
    dueDate: opt(f, "dueDate") ? ymd(str(f, "dueDate")) : null, estimateMinutes: est, doneAt: status.data === "DONE" ? new Date() : null,
  };
  if (id) {
    const { count } = await db.hqTask.updateMany({ where: { id, projectId: project.id }, data });
    if (!count) return { error: "Task not found" };
  } else {
    const last = await db.hqTask.aggregate({ where: { projectId: project.id }, _max: { position: true } });
    await db.hqTask.create({ data: { ...data, projectId: project.id, position: (last._max.position ?? 0) + 1, createdById: h.userId } });
  }
  await hqAudit(h, id ? "task.update" : "task.create", { projectId: project.id });
  revalidatePath(`/platform/projects/${project.id}`);
  return { ok: id ? "Task saved" : "Task added" };
}

/** Moves a task along the board. The person it's assigned to can move their own task. */
export async function moveTask(f: FormData) {
  const h = await requireHq();
  const t = await db.hqTask.findUnique({ where: { id: str(f, "id", 40) } });
  if (!t) return;
  if (!h.can("projects.edit") && !(h.can("time.log") && t.assigneeId === h.userId)) redirect("/platform/home?denied=1");
  const status = z.enum(TASK_STATUS).safeParse(str(f, "status"));
  if (!status.success) return;
  await db.hqTask.update({ where: { id: t.id }, data: { status: status.data, doneAt: status.data === "DONE" ? new Date() : null } });
  revalidatePath(`/platform/projects/${t.projectId}`);
  revalidatePath("/platform/time");
}

export async function deleteTask(f: FormData) {
  const h = await requireHq("projects.edit");
  const t = await db.hqTask.findUnique({ where: { id: str(f, "id", 40) } });
  if (!t) return;
  await db.hqTask.delete({ where: { id: t.id } });
  await hqAudit(h, "task.delete", { projectId: t.projectId });
  revalidatePath(`/platform/projects/${t.projectId}`);
}

// ---------------- Time ----------------

function mayLog(h: HqSession) {
  return h.can("time.log") || h.can("projects.edit");
}

async function projectAndTask(projectId: string, taskId: string | null) {
  const project = await db.hqProject.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Choose a project" };
  if (project.status === "DONE" || project.status === "CANCELLED") return { error: "That project is closed. Reopen it to log time." };
  const task = taskId ? await db.hqTask.findFirst({ where: { id: taskId, projectId } }) : null;
  if (taskId && !task) return { error: "That task isn't on this project" };
  return { project, task };
}

export async function logTime(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq();
  if (!mayLog(h)) redirect("/platform/home?denied=1");
  const pt = await projectAndTask(str(f, "projectId", 40), opt(f, "taskId", 40));
  if ("error" in pt) return { error: pt.error };
  const minutes = parseDuration(str(f, "duration", 20));
  if (!minutes) return { error: "Enter the time like 1:30, 1h30 or 90m (up to 24 hours)" };
  const date = ymd(str(f, "date")) ?? londonDayStart(londonDate());
  if (date > londonDayStart(addDays(londonDate(), 1))) return { error: "Time can't be logged in the future" };
  // Managers can log time for someone else; everyone else logs their own.
  let userId = h.userId;
  const forId = opt(f, "userId", 40);
  if (forId && forId !== h.userId) {
    if (!h.can("projects.edit")) return { error: "You can only log your own time" };
    if (!(await personOrNull(forId))) return { error: "Choose who did the work" };
    userId = forId;
  }
  await db.hqTimeEntry.create({
    data: { projectId: pt.project.id, taskId: pt.task?.id ?? null, userId, date, minutes, description: opt(f, "description", 500), billable: pt.project.billing !== "NONE" && (f.has("billableShown") ? f.get("billable") === "on" : true) },
  });
  revalidatePath("/platform/time");
  revalidatePath(`/platform/projects/${pt.project.id}`);
  return { ok: "Time logged" };
}

export async function deleteTime(f: FormData) {
  const h = await requireHq();
  const e = await db.hqTimeEntry.findUnique({ where: { id: str(f, "id", 40) } });
  if (!e) return;
  if (!(h.can("projects.edit") || (h.can("time.log") && e.userId === h.userId))) redirect("/platform/home?denied=1");
  if (e.invoiceId) back(str(f, "back", 200).startsWith("/platform/") ? str(f, "back", 200) : "/platform/time", "This time is on an invoice. Void or delete the invoice first.");
  await db.hqTimeEntry.delete({ where: { id: e.id } });
  revalidatePath("/platform/time");
  revalidatePath(`/platform/projects/${e.projectId}`);
}

export async function startTimer(f: FormData) {
  const h = await requireHq();
  if (!mayLog(h)) redirect("/platform/home?denied=1");
  const pt = await projectAndTask(str(f, "projectId", 40), opt(f, "taskId", 40));
  if ("error" in pt) back("/platform/time", pt.error);
  const { project, task } = pt as Exclude<typeof pt, { error: string }>;
  await stopRunning(h.userId);
  await db.hqTimer.create({ data: { userId: h.userId, projectId: project.id, taskId: task?.id ?? null, description: opt(f, "description", 500) } });
  revalidatePath("/platform/time");
  revalidatePath(`/platform/projects/${project.id}`);
}

/** Stops someone's timer and logs the time (at least a minute; over 12 hours is capped, as it was surely left running). */
async function stopRunning(userId: string) {
  const t = await db.hqTimer.findUnique({ where: { userId }, include: { project: true } });
  if (!t) return null;
  const minutes = Math.min(12 * 60, Math.max(1, Math.round((Date.now() - t.startedAt.getTime()) / 60000)));
  await db.$transaction([
    db.hqTimer.delete({ where: { id: t.id } }),
    db.hqTimeEntry.create({ data: { projectId: t.projectId, taskId: t.taskId, userId, date: londonDayStart(londonDate(t.startedAt)), minutes, description: t.description, billable: t.project.billing !== "NONE" } }),
  ]);
  return t.projectId;
}

export async function stopTimer() {
  const h = await requireHq();
  const pid = await stopRunning(h.userId);
  revalidatePath("/platform/time");
  if (pid) revalidatePath(`/platform/projects/${pid}`);
}

export async function discardTimer() {
  const h = await requireHq();
  await db.hqTimer.deleteMany({ where: { userId: h.userId } });
  revalidatePath("/platform/time");
}

/** Puts a project's unbilled hours on a new draft invoice at the project's hourly rate. */
export async function invoiceTime(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("invoices.edit");
  const project = await db.hqProject.findUnique({ where: { id: str(f, "projectId", 40) }, include: { client: { include: { contacts: true } } } });
  if (!project?.client) return { error: "Only a client project can be invoiced" };
  if (!project.rateMinor) return { error: "Set the project's hourly rate first" };
  const until = ymd(str(f, "until")) ?? londonDayStart(londonDate());
  const groupBy = str(f, "groupBy") === "entry" ? "entry" : "task";
  const entries = await db.hqTimeEntry.findMany({
    where: { projectId: project.id, billable: true, invoiceId: null, date: { lte: until } },
    include: { task: { select: { title: true } } }, orderBy: { date: "asc" },
  });
  if (!entries.length) return { error: "There's no unbilled time up to that date" };
  const names = new Map((await db.user.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.userId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const lines = timeInvoiceLines(entries.map((e) => ({ id: e.id, minutes: e.minutes, date: londonDate(e.date), description: e.description, taskId: e.taskId, taskTitle: e.task?.title ?? null, person: names.get(e.userId) ?? "" })), { project: project.name, rateMinor: project.rateMinor, groupBy });
  const issue = londonDayStart(londonDate());
  const rate = await documentRate(project.currency, "", issue);
  if (typeof rate === "string") return { error: rate };
  const rows = lines.map((l, i) => ({ position: i, description: l.description.slice(0, 2000), quantity: l.quantity, unitMinor: l.unitMinor, discountPct: 0, taxPct: 0 }));
  const totals = documentTotals(rows);
  const amounts = rows.map((r) => documentTotals([r]).totalMinor);
  const inv = await db.$transaction(async (tx) => {
    const created = await tx.hqInvoice.create({
      data: {
        number: await nextInvoiceNumber(issue), clientId: project.client!.id, projectId: project.id, title: project.name, issueDate: issue,
        dueDate: londonDayStart(addDays(londonDate(), project.client!.paymentDays)), currency: project.currency, perGbp: rate, ...totals,
        publicToken: publicToken(), createdById: h.userId, ...billTo(project.client!),
        lines: { create: rows.map((r, i) => ({ ...r, amountMinor: amounts[i] })) },
      },
    });
    await tx.hqTimeEntry.updateMany({ where: { id: { in: lines.flatMap((l) => l.ids) }, invoiceId: null }, data: { invoiceId: created.id } });
    return created;
  });
  await hqAudit(h, "project.invoice-time", { projectId: project.id, invoiceId: inv.id, entries: entries.length });
  redirect(`/platform/invoices/${inv.id}`);
}

// ---------------- Contracts ----------------

const KINDS = ["SUPPORT", "HOSTING", "MAINTENANCE", "LICENCE", "DEVELOPMENT", "SERVICE", "OTHER"] as const;

export async function saveContract(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("contracts.edit");
  const id = opt(f, "id", 40);
  const client = await db.hqClient.findUnique({ where: { id: str(f, "clientId", 40) } });
  if (!client) return { error: "Choose a client" };
  const title = str(f, "title", 200);
  if (!title) return { error: "Give the contract a title, for example Website care plan" };
  const kind = z.enum(KINDS).safeParse(str(f, "kind") || "SERVICE");
  if (!kind.success) return { error: "Choose the type" };
  const currency = str(f, "currency", 3).toUpperCase() || client.currency;
  if (!isCurrency(currency)) return { error: "Choose a currency" };
  const startDate = ymd(str(f, "startDate"));
  if (!startDate) return { error: "Choose the start date" };
  const endDate = opt(f, "endDate") ? ymd(str(f, "endDate")) : null;
  if (endDate && endDate < startDate) return { error: "The end date can't be before the start" };
  const value = str(f, "value") ? parseMoney(str(f, "value"), currency) : 0;
  const cost = str(f, "cost") ? parseMoney(str(f, "cost"), currency) : null;
  if (value === null || value < 0 || (str(f, "cost") && (cost === null || cost < 0))) return { error: "Enter amounts as numbers" };
  const renewMonths = Number(str(f, "renewMonths") || 12);
  const noticeDays = Number(str(f, "noticeDays") || 30);
  if (!Number.isInteger(renewMonths) || renewMonths < 1 || renewMonths > 120) return { error: "Renew for 1 to 120 months" };
  if (!Number.isInteger(noticeDays) || noticeDays < 0 || noticeDays > 365) return { error: "The reminder is 0 to 365 days before the end" };
  const autoRenew = f.get("autoRenew") === "on";
  if (autoRenew && !endDate) return { error: "A contract that renews itself needs an end date" };
  const recurringId = opt(f, "recurringId", 40);
  if (recurringId && !(await db.hqRecurring.findFirst({ where: { id: recurringId, clientId: client.id } }))) return { error: "That repeating invoice is for another client" };
  const data = {
    clientId: client.id, title, kind: kind.data, reference: opt(f, "reference", 120), vendor: opt(f, "vendor", 120), startDate, endDate, autoRenew, renewMonths, noticeDays,
    currency, valueMinor: value, costMinor: cost, terms: opt(f, "terms", 8000), notes: opt(f, "notes", 4000), recurringId,
  };
  let cid = id;
  if (id) {
    const before = await db.hqContract.findUnique({ where: { id } });
    if (!before) return { error: "Contract not found" };
    await db.hqContract.update({ where: { id }, data: { ...data, remindedFor: before.endDate?.getTime() === endDate?.getTime() ? before.remindedFor : null } });
  } else cid = (await db.hqContract.create({ data: { ...data, status: f.get("draft") === "on" ? "DRAFT" : "ACTIVE", createdById: h.userId } })).id;
  await hqAudit(h, id ? "contract.update" : "contract.create", { contractId: cid! });
  revalidatePath("/platform/contracts");
  if (id) return { ok: "Contract saved" };
  redirect(`/platform/contracts/${cid}`);
}

export async function contractAction(f: FormData) {
  const h = await requireHq("contracts.edit");
  const c = await db.hqContract.findUnique({ where: { id: str(f, "id", 40) } });
  if (!c) return;
  const op = str(f, "op", 20);
  const path = `/platform/contracts/${c.id}`;
  if (op === "renew") {
    if (!c.endDate) back(path, "Add an end date first");
    await db.hqContract.update({ where: { id: c.id }, data: { endDate: nextTerm(c.endDate, c.renewMonths), status: "ACTIVE", renewedCount: { increment: 1 }, remindedFor: null } });
  } else if (op === "activate") await db.hqContract.update({ where: { id: c.id }, data: { status: "ACTIVE" } });
  else if (op === "end") await db.hqContract.update({ where: { id: c.id }, data: { status: "ENDED", autoRenew: false } });
  else if (op === "cancel") await db.hqContract.update({ where: { id: c.id }, data: { status: "CANCELLED", autoRenew: false } });
  else if (op === "delete") {
    await db.hqContract.delete({ where: { id: c.id } });
    await hqAudit(h, "contract.delete", { contractId: c.id });
    redirect("/platform/contracts");
  } else return;
  await hqAudit(h, `contract.${op}`, { contractId: c.id });
  revalidatePath(path);
}
