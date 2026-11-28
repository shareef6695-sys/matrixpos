import "server-only";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { safeError } from "./redact";

/**
 * An error whose message was written for the person using MatrixPOS ("No Stripe reader is linked to this till").
 * Only these messages are ever sent to a browser. Any other error is logged on the server with an
 * error reference, and the browser gets a generic message with that reference.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

/** The request's id (from middleware or Vercel), or a new one. Quoted to support, and found in the server logs. */
export async function errorRef(): Promise<string> {
  try {
    const id = (await headers()).get("x-request-id");
    if (id) return id;
  } catch {
    // Not inside a request.
  }
  return randomBytes(6).toString("hex");
}

/** Logs the full error (redacted, with its stack) on the server only. Returns the reference to show the user. */
export async function logError(where: string, e: unknown): Promise<string> {
  const ref = await errorRef();
  console.error(`[error ref=${ref}] ${where}:`, safeError(e));
  return ref;
}

/** A message safe to show in the browser: a UserError's own message, otherwise `fallback` plus an error reference. */
export async function publicMessage(e: unknown, where: string, fallback = "Something went wrong"): Promise<string> {
  if (e instanceof UserError) return e.message;
  return `${fallback}. Error reference: ${await logError(where, e)}`;
}

type Handler<A extends unknown[]> = (...args: A) => Promise<Response>;

/**
 * Wraps an API route handler. An unexpected error becomes a 500 with a generic message and an error
 * reference; the details go to the server log only. UserErrors become a 400 with their message.
 */
export function apiRoute<A extends unknown[]>(where: string, handler: Handler<A>): Handler<A> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (e) {
      // redirect() and notFound() work by throwing; let Next.js handle them.
      if (e && typeof e === "object" && "digest" in e && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR)/.test(String((e as { digest: unknown }).digest))) throw e;
      if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
      const ref = await logError(where, e);
      return NextResponse.json({ error: "Something went wrong. Please try again.", ref }, { status: 500, headers: { "x-request-id": ref } });
    }
  };
}
