import "server-only";
/**
 * Integrated card terminal adapters. Each business turns on the providers it uses in Settings and
 * stores its own API keys; each till stores its reader / terminal id.
 *
 * Flow for every provider: start(amount) -> poll status(ref) until APPROVED / DECLINED -> optional cancel(ref).
 * These calls follow each provider's published REST API; test with your sandbox keys before going live.
 */
import type { OrgSettings, Register } from "@prisma/client";

export type ProviderId = "STRIPE_TERMINAL" | "SUMUP" | "DOJO";
export type PaymentState = "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED";

export interface StartResult { ref: string }
export interface StatusResult { state: PaymentState; reference?: string; message?: string }

interface Ctx { settings: OrgSettings; register: Register }

async function call(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body?.error?.message ?? body?.message ?? `Provider error ${res.status}`);
  return body;
}

// ---- Stripe Terminal (server-driven integration) ----
const stripe = {
  headers(ctx: Ctx) {
    if (!ctx.settings.stripeSecretKey) throw new Error("Stripe secret key is not set in Settings");
    return { Authorization: `Bearer ${ctx.settings.stripeSecretKey}`, "Content-Type": "application/x-www-form-urlencoded" };
  },
  reader(ctx: Ctx) {
    if (!ctx.register.stripeReaderId) throw new Error("No Stripe reader is linked to this till");
    return ctx.register.stripeReaderId;
  },
  async start(ctx: Ctx, amountPence: number, saleId: string): Promise<StartResult> {
    const pi = await call("https://api.stripe.com/v1/payment_intents", {
      method: "POST", headers: stripe.headers(ctx),
      body: new URLSearchParams({ amount: String(amountPence), currency: "gbp", "payment_method_types[]": "card_present", capture_method: "automatic", "metadata[sale_id]": saleId }),
    });
    await call(`https://api.stripe.com/v1/terminal/readers/${stripe.reader(ctx)}/process_payment_intent`, {
      method: "POST", headers: stripe.headers(ctx), body: new URLSearchParams({ payment_intent: pi.id }),
    });
    return { ref: pi.id };
  },
  async status(ctx: Ctx, ref: string): Promise<StatusResult> {
    const pi = await call(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(ref)}`, { headers: stripe.headers(ctx) });
    if (pi.status === "succeeded") return { state: "APPROVED", reference: pi.id };
    if (pi.status === "canceled") return { state: "CANCELLED" };
    if (pi.last_payment_error) return { state: "DECLINED", message: pi.last_payment_error.message };
    return { state: "PENDING" };
  },
  async cancel(ctx: Ctx, ref: string) {
    await call(`https://api.stripe.com/v1/terminal/readers/${stripe.reader(ctx)}/cancel_action`, { method: "POST", headers: stripe.headers(ctx) }).catch(() => {});
    await call(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(ref)}/cancel`, { method: "POST", headers: stripe.headers(ctx) }).catch(() => {});
  },
};

// ---- SumUp Cloud API (Solo readers) ----
const sumup = {
  base(ctx: Ctx) {
    if (!ctx.settings.sumupApiKey || !ctx.settings.sumupMerchantCode) throw new Error("SumUp API key and merchant code are not set in Settings");
    if (!ctx.register.sumupReaderId) throw new Error("No SumUp reader is linked to this till");
    return {
      url: `https://api.sumup.com/v0.1/merchants/${encodeURIComponent(ctx.settings.sumupMerchantCode)}`,
      headers: { Authorization: `Bearer ${ctx.settings.sumupApiKey}`, "Content-Type": "application/json" },
      reader: ctx.register.sumupReaderId,
    };
  },
  async start(ctx: Ctx, amountPence: number): Promise<StartResult> {
    const b = sumup.base(ctx);
    const r = await call(`${b.url}/readers/${encodeURIComponent(b.reader)}/checkout`, {
      method: "POST", headers: b.headers,
      body: JSON.stringify({ total_amount: { value: amountPence, currency: "GBP", minor_unit: 2 } }),
    });
    return { ref: r?.data?.client_transaction_id };
  },
  async status(ctx: Ctx, ref: string): Promise<StatusResult> {
    const b = sumup.base(ctx);
    const r = await call(`${b.url}/transactions?client_transaction_id=${encodeURIComponent(ref)}`, { headers: b.headers }).catch(() => null);
    const st = r?.status ?? r?.transaction?.status;
    if (st === "SUCCESSFUL") return { state: "APPROVED", reference: r.transaction_code ?? ref };
    if (st === "FAILED") return { state: "DECLINED" };
    if (st === "CANCELLED") return { state: "CANCELLED" };
    return { state: "PENDING" };
  },
  async cancel(ctx: Ctx) {
    const b = sumup.base(ctx);
    await call(`${b.url}/readers/${encodeURIComponent(b.reader)}/terminate`, { method: "POST", headers: b.headers }).catch(() => {});
  },
};

// ---- Dojo (Payment intents + terminal sessions) ----
const dojo = {
  headers(ctx: Ctx) {
    if (!ctx.settings.dojoApiKey) throw new Error("Dojo API key is not set in Settings");
    return { Authorization: `Basic ${ctx.settings.dojoApiKey}`, version: "2024-02-05", "Content-Type": "application/json" };
  },
  terminal(ctx: Ctx) {
    if (!ctx.register.dojoTerminalId) throw new Error("No Dojo terminal is linked to this till");
    return ctx.register.dojoTerminalId;
  },
  async start(ctx: Ctx, amountPence: number, saleId: string): Promise<StartResult> {
    const pi = await call("https://api.dojo.tech/payment-intents", {
      method: "POST", headers: dojo.headers(ctx),
      body: JSON.stringify({ amount: { value: amountPence, currencyCode: "GBP" }, reference: saleId, captureMode: "Auto" }),
    });
    const session = await call("https://api.dojo.tech/terminal-sessions", {
      method: "POST", headers: dojo.headers(ctx),
      body: JSON.stringify({ terminalId: dojo.terminal(ctx), details: { sale: { paymentIntentId: pi.id } }, sessionType: "Sale" }),
    });
    return { ref: session.id };
  },
  async status(ctx: Ctx, ref: string): Promise<StatusResult> {
    const s = await call(`https://api.dojo.tech/terminal-sessions/${encodeURIComponent(ref)}`, { headers: dojo.headers(ctx) });
    if (s.status === "Captured" || s.status === "Authorized") return { state: "APPROVED", reference: s.details?.sale?.paymentIntentId ?? ref };
    if (s.status === "Declined" || s.status === "Expired") return { state: "DECLINED" };
    if (s.status === "Canceled") return { state: "CANCELLED" };
    return { state: "PENDING" };
  },
  async cancel(ctx: Ctx, ref: string) {
    await call(`https://api.dojo.tech/terminal-sessions/${encodeURIComponent(ref)}/cancel`, { method: "PUT", headers: dojo.headers(ctx) }).catch(() => {});
  },
};

export const providers = { STRIPE_TERMINAL: stripe, SUMUP: sumup, DOJO: dojo } as const;

export function providerEnabled(settings: OrgSettings, id: ProviderId) {
  return id === "STRIPE_TERMINAL" ? settings.enableStripeTerminal : id === "SUMUP" ? settings.enableSumUp : settings.enableDojo;
}
