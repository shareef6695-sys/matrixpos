export const LEAD_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"] as const;
export const LEAD_STAGE_LABEL: Record<(typeof LEAD_STAGES)[number], string> = {
  NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", PROPOSAL: "Proposal sent", WON: "Won", LOST: "Lost",
};

export const ITEM_KIND_LABEL = { SERVICE: "Service", SUBSCRIPTION: "Subscription", PRODUCT: "Product", THIRD_PARTY: "Third-party app" } as const;

export const PAYMENT_METHODS = ["BANK", "CARD", "STRIPE", "PAYPAL", "CASH", "CHEQUE", "OTHER"] as const;
export const PAYMENT_METHOD_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = {
  BANK: "Bank transfer", CARD: "Card", STRIPE: "Stripe", PAYPAL: "PayPal", CASH: "Cash", CHEQUE: "Cheque", OTHER: "Other",
};

export const QUOTE_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-slate-100 text-slate-700" },
  SENT: { label: "Sent", cls: "bg-sky-100 text-sky-800" },
  ACCEPTED: { label: "Accepted", cls: "bg-emerald-100 text-emerald-800" },
  DECLINED: { label: "Declined", cls: "bg-red-100 text-red-800" },
  INVOICED: { label: "Invoiced", cls: "bg-violet-100 text-violet-800" },
};

export const INVOICE_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-slate-100 text-slate-700" },
  SENT: { label: "Unpaid", cls: "bg-amber-100 text-amber-800" },
  PARTIAL: { label: "Part paid", cls: "bg-sky-100 text-sky-800" },
  PAID: { label: "Paid", cls: "bg-emerald-100 text-emerald-800" },
  VOID: { label: "Void", cls: "bg-slate-200 text-slate-600" },
};
