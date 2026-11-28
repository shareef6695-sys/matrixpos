"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { requireHq, hqAudit } from "@/lib/server/hq";
import { isCurrency, parseMoney } from "@/lib/hq/money";
import { londonDayStart } from "@/lib/dates";
import { STARTER_CATALOGUE } from "@/lib/hq/starter-catalogue";
import { LEAD_STAGES } from "@/lib/hq/labels";
import type { FormState } from "./auth";

const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);
const opt = (f: FormData, k: string, max = 500) => str(f, k, max) || null;
const ymd = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? londonDayStart(s) : null);
const currencyOf = (f: FormData) => {
  const c = str(f, "currency", 3).toUpperCase() || "GBP";
  return isCurrency(c) ? c : null;
};
const email = (f: FormData, k = "email") => {
  const e = opt(f, k, 200)?.toLowerCase() ?? null;
  return e && !/^\S+@\S+\.\S+$/.test(e) ? undefined : e;
};

// ---------------- Clients ----------------

export async function saveClient(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("clients.edit");
  const id = opt(f, "id", 40);
  const name = str(f, "name", 160);
  if (!name) return { error: "Enter the client's name" };
  const currency = currencyOf(f);
  if (!currency) return { error: "Choose a currency" };
  const e = email(f);
  if (e === undefined) return { error: "Enter a valid email" };
  const days = parseInt(str(f, "paymentDays") || "14", 10);
  if (!Number.isInteger(days) || days < 0 || days > 365) return { error: "Payment terms must be 0 to 365 days" };
  const ownerId = opt(f, "ownerId", 40);
  const data = {
    name, isCompany: f.get("isCompany") !== "person", email: e, phone: opt(f, "phone", 40), website: opt(f, "website", 200),
    addressLine1: opt(f, "addressLine1", 200), addressLine2: opt(f, "addressLine2", 200), town: opt(f, "town", 100), postcode: opt(f, "postcode", 20),
    country: str(f, "country", 80) || "United Kingdom", vatNumber: opt(f, "vatNumber", 30), companyNo: opt(f, "companyNo", 30),
    currency, paymentDays: days, notes: opt(f, "notes", 4000), ownerId,
  };
  if (id) {
    if (!(await db.hqClient.findUnique({ where: { id } }))) return { error: "Client not found" };
    await db.hqClient.update({ where: { id }, data: { ...data, archived: f.get("archived") === "on" } });
    await hqAudit(h, "client.update", { clientId: id });
    revalidatePath(`/platform/clients/${id}`);
    return { ok: "Saved" };
  }
  const c = await db.hqClient.create({ data });
  await hqAudit(h, "client.create", { clientId: c.id });
  redirect(`/platform/clients/${c.id}`);
}

export async function saveContact(f: FormData) {
  const h = await requireHq("clients.edit");
  const clientId = str(f, "clientId", 40);
  const id = opt(f, "id", 40);
  if (!(await db.hqClient.findUnique({ where: { id: clientId } }))) return;
  if (f.get("op") === "delete" && id) {
    await db.hqContact.deleteMany({ where: { id, clientId } });
  } else {
    const name = str(f, "name", 120);
    const e = email(f);
    if (!name || e === undefined) return;
    const data = { name, email: e, phone: opt(f, "phone", 40), jobTitle: opt(f, "jobTitle", 80), isPrimary: f.get("isPrimary") === "on" };
    await db.$transaction(async (tx) => {
      if (data.isPrimary) await tx.hqContact.updateMany({ where: { clientId }, data: { isPrimary: false } });
      if (id) await tx.hqContact.updateMany({ where: { id, clientId }, data });
      else await tx.hqContact.create({ data: { ...data, clientId } });
    });
  }
  await hqAudit(h, "client.contact", { clientId });
  revalidatePath(`/platform/clients/${clientId}`);
}

/** A note, call or meeting on a client's or lead's timeline. */
export async function addNote(f: FormData) {
  const clientId = opt(f, "clientId", 40);
  const leadId = opt(f, "leadId", 40);
  const h = await requireHq(leadId ? "leads.edit" : "clients.edit");
  const body = str(f, "body", 4000);
  const kind = ["NOTE", "CALL", "EMAIL", "MEETING"].includes(str(f, "kind")) ? str(f, "kind") : "NOTE";
  if (!body || (!clientId && !leadId)) return;
  if (clientId && !(await db.hqClient.findUnique({ where: { id: clientId } }))) return;
  if (leadId && !(await db.hqLead.findUnique({ where: { id: leadId } }))) return;
  await db.hqNote.create({ data: { clientId, leadId, kind, body, userId: h.userId, userName: h.name } });
  revalidatePath(clientId ? `/platform/clients/${clientId}` : `/platform/leads/${leadId}`);
}

// ---------------- Leads ----------------

export async function saveLead(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("leads.edit");
  const id = opt(f, "id", 40);
  const title = str(f, "title", 200);
  if (!title) return { error: "Say what the lead wants, e.g. \"Booking app for a dental clinic\"" };
  const currency = currencyOf(f);
  if (!currency) return { error: "Choose a currency" };
  const value = str(f, "value") ? parseMoney(str(f, "value"), currency) : 0;
  if (value === null || value < 0) return { error: "Enter the expected value as a number" };
  const e = email(f);
  if (e === undefined) return { error: "Enter a valid email" };
  const stage = z.enum(LEAD_STAGES).safeParse(str(f, "stage") || "NEW");
  if (!stage.success) return { error: "Choose a stage" };
  const data = {
    title, company: opt(f, "company", 160), contactName: opt(f, "contactName", 120), email: e, phone: opt(f, "phone", 40),
    source: opt(f, "source", 80), stage: stage.data, currency, valueMinor: value, expectedClose: ymd(str(f, "expectedClose")),
    ownerId: opt(f, "ownerId", 40), notes: opt(f, "notes", 4000), lostReason: stage.data === "LOST" ? opt(f, "lostReason", 300) : null,
  };
  if (id) {
    if (!(await db.hqLead.findUnique({ where: { id } }))) return { error: "Lead not found" };
    await db.hqLead.update({ where: { id }, data });
    await hqAudit(h, "lead.update", { leadId: id, stage: data.stage });
    revalidatePath(`/platform/leads/${id}`);
    revalidatePath("/platform/leads");
    return { ok: "Saved" };
  }
  const l = await db.hqLead.create({ data: { ...data, ownerId: data.ownerId ?? h.userId } });
  await hqAudit(h, "lead.create", { leadId: l.id });
  revalidatePath("/platform/leads");
  return { ok: "Lead added" };
}

export async function moveLead(f: FormData) {
  const h = await requireHq("leads.edit");
  const id = str(f, "id", 40);
  const stage = z.enum(LEAD_STAGES).safeParse(str(f, "stage"));
  if (!stage.success) return;
  const { count } = await db.hqLead.updateMany({ where: { id }, data: { stage: stage.data } });
  if (count) await hqAudit(h, "lead.stage", { leadId: id, stage: stage.data });
  revalidatePath("/platform/leads");
  revalidatePath(`/platform/leads/${id}`);
}

/** Turns a lead into a client (or links it to an existing one), then opens a new quote for them. */
export async function convertLead(f: FormData) {
  const h = await requireHq("clients.edit");
  if (!h.can("leads.edit")) redirect("/platform/home?denied=1");
  const lead = await db.hqLead.findUnique({ where: { id: str(f, "id", 40) } });
  if (!lead) return;
  let clientId = lead.clientId;
  const existing = opt(f, "clientId", 40);
  if (!clientId && existing && (await db.hqClient.findUnique({ where: { id: existing } }))) clientId = existing;
  if (!clientId) {
    const c = await db.hqClient.create({
      data: {
        name: lead.company || lead.contactName || lead.title, isCompany: !!lead.company, email: lead.email, phone: lead.phone, currency: lead.currency, ownerId: lead.ownerId,
        contacts: lead.contactName ? { create: { name: lead.contactName, email: lead.email, phone: lead.phone, isPrimary: true } } : undefined,
      },
    });
    clientId = c.id;
    await hqAudit(h, "client.create", { clientId, fromLead: lead.id });
  }
  await db.hqLead.update({ where: { id: lead.id }, data: { clientId, stage: lead.stage === "WON" || lead.stage === "LOST" ? lead.stage : "PROPOSAL" } });
  redirect(h.can("quotes.edit") ? `/platform/quotes/new?client=${clientId}&lead=${lead.id}` : `/platform/clients/${clientId}`);
}

// ---------------- Catalogue ----------------

const KINDS = ["SERVICE", "SUBSCRIPTION", "PRODUCT", "THIRD_PARTY"] as const;

export async function saveItem(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("catalogue.edit");
  const id = opt(f, "id", 40);
  const name = str(f, "name", 160);
  if (!name) return { error: "Enter a name" };
  const currency = currencyOf(f);
  if (!currency) return { error: "Choose a currency" };
  const price = parseMoney(str(f, "price") || "0", currency);
  if (price === null || price < 0) return { error: "Enter the price as a number" };
  const cost = str(f, "cost") ? parseMoney(str(f, "cost"), currency) : null;
  if (cost !== null && cost < 0) return { error: "Enter the cost as a number" };
  if (str(f, "cost") && cost === null) return { error: "Enter the cost as a number" };
  const kind = z.enum(KINDS).safeParse(str(f, "kind"));
  if (!kind.success) return { error: "Choose a type" };
  const url = opt(f, "url", 300);
  if (url && !/^https?:\/\//i.test(url)) return { error: "The web page must start with https://" };
  const sku = opt(f, "sku", 40)?.toUpperCase() ?? null;
  if (sku) {
    const other = await db.hqItem.findUnique({ where: { sku } });
    if (other && other.id !== id) return { error: "Another item already uses that code" };
  }
  const data = {
    name, sku, kind: kind.data, description: opt(f, "description", 2000), unit: str(f, "unit", 20) || "each", currency, priceMinor: price, costMinor: cost,
    vendor: opt(f, "vendor", 120), url, active: id ? f.get("active") === "on" : true,
  };
  if (id) {
    const { count } = await db.hqItem.updateMany({ where: { id }, data });
    if (!count) return { error: "Item not found" };
  } else await db.hqItem.create({ data });
  await hqAudit(h, id ? "item.update" : "item.create", { name });
  revalidatePath("/platform/catalogue");
  return { ok: "Saved" };
}

/** Adds the services from matrixinfo.co.uk and the MatrixPOS plans, skipping any code already in the catalogue. */
export async function loadStarterCatalogue() {
  const h = await requireHq("catalogue.edit");
  const have = new Set((await db.hqItem.findMany({ where: { sku: { not: null } }, select: { sku: true } })).map((i) => i.sku));
  const add = STARTER_CATALOGUE.filter((i) => !have.has(i.sku));
  if (add.length) await db.hqItem.createMany({ data: add.map((i) => ({ ...i, currency: "GBP" })) });
  await hqAudit(h, "item.starter", { added: add.length });
  revalidatePath("/platform/catalogue");
}

// ---------------- Exchange rates ----------------

export async function saveRate(_: FormState, f: FormData): Promise<FormState> {
  const h = await requireHq("fx.edit");
  const currency = currencyOf(f);
  if (!currency || currency === "GBP") return { error: "Choose a currency other than GBP" };
  const rate = Number(str(f, "perGbp").replace(/,/g, ""));
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1e9) return { error: "Enter how many of that currency £1 buys, e.g. 1.27" };
  const date = ymd(str(f, "date"));
  if (!date) return { error: "Choose the date" };
  await db.hqFxRate.upsert({ where: { currency_date: { currency, date } }, create: { currency, date, perGbp: rate }, update: { perGbp: rate } });
  await hqAudit(h, "fx.save", { currency, rate });
  revalidatePath("/platform/currencies");
  return { ok: `£1 = ${rate} ${currency} saved` };
}

export async function deleteRate(f: FormData) {
  const h = await requireHq("fx.edit");
  const id = str(f, "id", 40);
  await db.hqFxRate.deleteMany({ where: { id } });
  await hqAudit(h, "fx.delete", { id });
  revalidatePath("/platform/currencies");
}
