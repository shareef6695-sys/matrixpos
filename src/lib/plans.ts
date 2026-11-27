// Subscription plans. Prices are in pence, excluding VAT. Edit here to change pricing everywhere.

export type PlanId = "STARTER" | "BUSINESS" | "ENTERPRISE";
export type BillingStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";
export type BillingCycle = "MONTHLY" | "YEARLY";

/** Features that only some plans include. Others (cash, keyed card, age check, weighed items, stock, offline) are in every plan. */
export type PlanFeature = "enableAccounting" | "enablePromotions" | "enableLoyalty" | "enableStripeTerminal" | "enableSumUp" | "enableDojo";
export const PLAN_FEATURES: PlanFeature[] = ["enableAccounting", "enablePromotions", "enableLoyalty", "enableStripeTerminal", "enableSumUp", "enableDojo"];

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyPence: number;
  /** Yearly price: about two months free. */
  yearlyPence: number;
  maxStores: number | null; // null = unlimited
  maxRegisters: number | null;
  maxStaff: number | null;
  features: PlanFeature[];
  highlights: string[];
  popular?: boolean;
}

export const TRIAL_DAYS = 14;

export const PLANS: Plan[] = [
  {
    id: "STARTER",
    name: "Starter",
    tagline: "For a single corner shop or kiosk",
    monthlyPence: 1200,
    yearlyPence: 12000,
    maxStores: 1,
    maxRegisters: 2,
    maxStaff: 5,
    features: [],
    highlights: ["1 shop", "Up to 2 tills", "Up to 5 staff", "UK VAT, Challenge 25, weighed goods", "Works offline", "Any standalone card machine", "Stock, suppliers and reports"],
  },
  {
    id: "BUSINESS",
    name: "Business",
    tagline: "For busy shops and small chains",
    monthlyPence: 2400,
    yearlyPence: 24000,
    maxStores: 3,
    maxRegisters: null,
    maxStaff: null,
    features: ["enableAccounting", "enablePromotions", "enableLoyalty", "enableStripeTerminal", "enableSumUp", "enableDojo"],
    highlights: ["Up to 3 shops", "Unlimited tills and staff", "Everything in Starter", "Accounts and HMRC VAT return", "Meal deals and multibuys", "Loyalty customers", "Stripe, SumUp and Dojo readers"],
    popular: true,
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    tagline: "For supermarket groups",
    monthlyPence: 4900,
    yearlyPence: 48000,
    maxStores: null,
    maxRegisters: null,
    maxStaff: null,
    features: ["enableAccounting", "enablePromotions", "enableLoyalty", "enableStripeTerminal", "enableSumUp", "enableDojo"],
    highlights: ["Unlimited shops", "Unlimited tills and staff", "Everything in Business", "Priority support", "Help moving your products in"],
  },
];

export const planById = (id: string): Plan => PLANS.find((p) => p.id === id) ?? PLANS[1];
export const planAllows = (id: string, f: PlanFeature) => planById(id).features.includes(f);

/** Monthly recurring revenue in pence for one shop (yearly plans spread over 12 months). */
export const mrrPence = (plan: string, cycle: string) => {
  const p = planById(plan);
  return cycle === "YEARLY" ? Math.round(p.yearlyPence / 12) : p.monthlyPence;
};

export interface Access {
  /** Can the shop use the till and back office? */
  allowed: boolean;
  status: BillingStatus | "TRIAL_ENDED";
  trialDaysLeft: number | null;
  message: string | null;
}

/** Works out whether a shop may trade, from its billing fields. */
export function accessFor(org: { billingStatus: string; trialEndsAt: Date | null }, now = new Date()): Access {
  const s = org.billingStatus as BillingStatus;
  if (s === "SUSPENDED") return { allowed: false, status: s, trialDaysLeft: null, message: "This account is suspended. Please contact MatrixPOS to restore access." };
  if (s === "CANCELLED") return { allowed: false, status: s, trialDaysLeft: null, message: "This account has been cancelled. Please contact MatrixPOS to reactivate it." };
  if (s === "TRIAL") {
    const left = org.trialEndsAt ? Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / 86_400_000) : TRIAL_DAYS;
    if (left <= 0) return { allowed: false, status: "TRIAL_ENDED", trialDaysLeft: 0, message: "Your free trial has ended. Choose a plan to keep using MatrixPOS." };
    return { allowed: true, status: s, trialDaysLeft: left, message: null };
  }
  if (s === "PAST_DUE") return { allowed: true, status: s, trialDaysLeft: null, message: "Your last payment is overdue. Please pay your invoice to avoid interruption." };
  return { allowed: true, status: s, trialDaysLeft: null, message: null };
}

export const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Trial", ACTIVE: "Paying", PAST_DUE: "Overdue", SUSPENDED: "Suspended", CANCELLED: "Cancelled", TRIAL_ENDED: "Trial ended",
};

/** Status shown to the platform owner: like accessFor, but flags paying shops whose paid period has run out. */
export function displayStatus(org: { billingStatus: string; trialEndsAt: Date | null; paidUntil: Date | null }, now = new Date()) {
  const a = accessFor(org, now);
  if (a.status === "ACTIVE" && org.paidUntil && org.paidUntil < now) return "PAST_DUE";
  return a.status;
}
