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

// ---------------- The books ----------------

export const SOURCE_LABEL: Record<string, string> = {
  INVOICE: "Invoice", INVOICE_VOID: "Invoice voided", PAYMENT: "Payment received", CREDIT_NOTE: "Credit note", BILL: "Bill",
  BILL_VOID: "Bill voided", BILL_PAYMENT: "Bill paid", BANK: "Bank line", MANUAL: "Journal",
};

export function sourceLink(source: string, sourceId: string | null, ref?: { invoiceId?: string; billId?: string; accountId?: string }) {
  if (!sourceId) return null;
  if (source === "INVOICE" || source === "INVOICE_VOID") return `/platform/invoices/${sourceId}`;
  if (source === "CREDIT_NOTE") return `/platform/credit-notes/${sourceId}`;
  if (source === "BILL" || source === "BILL_VOID") return `/platform/bills/${sourceId}`;
  if (source === "PAYMENT" && ref?.invoiceId) return `/platform/invoices/${ref.invoiceId}`;
  if (source === "BILL_PAYMENT" && ref?.billId) return `/platform/bills/${ref.billId}`;
  if (source === "BANK" && ref?.accountId) return `/platform/bank/${ref.accountId}`;
  return null;
}

export const BILL_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Unpaid", cls: "bg-amber-100 text-amber-800" },
  PARTIAL: { label: "Part paid", cls: "bg-sky-100 text-sky-800" },
  PAID: { label: "Paid", cls: "bg-emerald-100 text-emerald-800" },
  VOID: { label: "Void", cls: "bg-slate-200 text-slate-600" },
};

export const FREQUENCY_LABEL = { WEEKLY: "Every week", MONTHLY: "Every month", QUARTERLY: "Every 3 months", YEARLY: "Every year" } as const;

// ---------------- Projects and contracts ----------------

export const PROJECT_STATUS: Record<string, { label: string; cls: string }> = {
  PLANNED: { label: "Planned", cls: "bg-slate-100 text-slate-700" },
  ACTIVE: { label: "Active", cls: "bg-sky-100 text-sky-800" },
  ON_HOLD: { label: "On hold", cls: "bg-amber-100 text-amber-800" },
  DONE: { label: "Done", cls: "bg-emerald-100 text-emerald-800" },
  CANCELLED: { label: "Cancelled", cls: "bg-slate-200 text-slate-600" },
};
export const BILLING_LABEL = { FIXED: "Fixed price", HOURLY: "Hourly", NONE: "Not billed" } as const;
export const TASK_STATUS_LABEL = { TODO: "To do", DOING: "In progress", REVIEW: "Review", DONE: "Done" } as const;
export const PRIORITY: Record<string, { label: string; cls: string }> = {
  LOW: { label: "Low", cls: "bg-slate-100 text-slate-600" },
  NORMAL: { label: "Normal", cls: "bg-slate-100 text-slate-700" },
  HIGH: { label: "High", cls: "bg-amber-100 text-amber-800" },
  URGENT: { label: "Urgent", cls: "bg-red-100 text-red-800" },
};
export const CONTRACT_KIND_LABEL = {
  SUPPORT: "Support", HOSTING: "Hosting", MAINTENANCE: "Maintenance / care plan", LICENCE: "Third-party licence", DEVELOPMENT: "Development", SERVICE: "Service", OTHER: "Other",
} as const;
export const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-slate-100 text-slate-700" },
  ACTIVE: { label: "Active", cls: "bg-emerald-100 text-emerald-800" },
  ENDED: { label: "Ended", cls: "bg-slate-200 text-slate-600" },
  CANCELLED: { label: "Cancelled", cls: "bg-slate-200 text-slate-600" },
};
export const RENEWAL: Record<string, { label: string; cls: string }> = {
  upcoming: { label: "Renews soon", cls: "bg-sky-100 text-sky-800" },
  due: { label: "Renewal due", cls: "bg-amber-100 text-amber-800" },
  overdue: { label: "Ended, not renewed", cls: "bg-red-100 text-red-800" },
};
