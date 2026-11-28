/**
 * Masks anything that looks like a credential before text is logged or sent back to a browser.
 * Card provider errors and SMTP failures can echo parts of a request; this keeps keys, tokens,
 * passwords in connection strings and Authorization headers out of logs and API responses.
 * It also masks email addresses, UK mobile numbers and one-time tokens in links as "[REDACTED]".
 */
const PATTERNS: [RegExp, string][] = [
  [/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]+/g, "$1_$2_[redacted]"],
  [/\bwhsec_[A-Za-z0-9]+/g, "whsec_[redacted]"],
  [/\bre_[A-Za-z0-9_]{16,}/g, "re_[redacted]"],
  [/\bsup_sk_[A-Za-z0-9_-]+/g, "sup_sk_[redacted]"],
  [/(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, "[redacted-jwt]"],
  [/(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|smtps?):\/\/([^:/@\s]+):[^@\s]+@/gi, "$1://$2:[redacted]@"],
  // Personal data. Provider errors (SMTP, Resend, Stripe) often echo the recipient or customer back.
  [/\b(token|code|pin|password)=([^\s&"']+)/gi, "$1=[REDACTED]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, "[REDACTED]"],
  [/(?<![\w-])(?:\+44\s?7\d{3}|07\d{3})\s?\d{3}\s?\d{3}(?![\w-])/g, "[REDACTED]"],
];

export function redact(text: string): string {
  let out = text;
  for (const [re, sub] of PATTERNS) out = out.replace(re, sub);
  return out;
}

/** An error's message, redacted, for logging or for a JSON error response. */
export function safeErrorMessage(e: unknown, fallback = "Something went wrong"): string {
  return e instanceof Error && e.message ? redact(e.message) : fallback;
}

/** Use in console.error(...) so stack traces and messages never carry a secret. */
export function safeError(e: unknown): string {
  if (e instanceof Error) return redact(e.stack ?? `${e.name}: ${e.message}`);
  return redact(String(e));
}

