"use client";
import { get, set, del } from "idb-keyval";
import type { Bootstrap, QueuedSale } from "./types";

const BOOT = "mpos:bootstrap";
const QUEUE = "mpos:queue";
const SEQ = "mpos:seq";

export const saveBootstrap = (b: Bootstrap) => set(BOOT, b).catch(() => {});
export const loadBootstrap = () => get<Bootstrap>(BOOT).catch(() => undefined);
export const clearBootstrap = () => del(BOOT).catch(() => {});

export async function queued(): Promise<QueuedSale[]> {
  return (await get<QueuedSale[]>(QUEUE).catch(() => undefined)) ?? [];
}

/**
 * Queues a sale until the server has it. Display-only fields (cashier and loyalty customer names, offer names)
 * are left out, so the browser's storage never holds a shopper's name. The receipt on screen uses the in-memory copy.
 */
export async function enqueue(sale: QueuedSale) {
  const { _cashier, _promotions, _customer, ...stored } = sale;
  void _cashier; void _promotions; void _customer;
  const q = await queued();
  q.push(stored);
  await set(QUEUE, q);
}

/** Sends queued sales; keeps any the server rejects with a network error. Returns remaining count. */
export async function flush(): Promise<{ remaining: number; failed: { id: string; error?: string }[] }> {
  const q = await queued();
  if (!q.length) return { remaining: 0, failed: [] };
  let res: Response;
  try {
    res = await fetch("/api/till/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sales: q.map(({ _cashier, _promotions, _customer, ...s }) => s) }),
    });
  } catch {
    return { remaining: q.length, failed: [] };
  }
  if (!res.ok) return { remaining: q.length, failed: [] };
  const { results } = (await res.json()) as { results: { id: string; ok: boolean; error?: string }[] };
  const done = new Set(results.filter((r) => r.ok).map((r) => r.id));
  const failed = results.filter((r) => !r.ok);
  // Sales the server rejects for a data reason are kept so a manager can see them, but don't block the queue forever.
  const rest = q.filter((s) => !done.has(s.id));
  await set(QUEUE, rest);
  return { remaining: rest.length, failed };
}

/** Receipt sequence for this till. Never goes backwards, even across reloads. */
export async function nextReceiptNo(storeCode: string, registerNo: number, serverLast: number) {
  const local = (await get<number>(SEQ).catch(() => undefined)) ?? 0;
  const n = Math.max(local, serverLast) + 1;
  await set(SEQ, n).catch(() => {});
  return `${storeCode}-${registerNo}-${String(n).padStart(6, "0")}`;
}

export const resetSeq = () => del(SEQ).catch(() => {});
