// Legal details shown on the privacy, terms and data processing pages.
export const LEGAL = {
  company: "Matrix Infotech Ltd.",
  product: "MatrixPOS",
  /** Bump when the terms, privacy policy or DPA change: owners are asked to accept again. */
  version: "2026-11-27",
  updated: "27 November 2026",
};

/** Contact address for privacy and legal questions. */
export const legalEmail = () =>
  process.env.LEGAL_CONTACT_EMAIL || process.env.BILLING_CONTACT_EMAIL || (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(/[,;\s]+/).filter(Boolean)[0] || "";

/** Details printed on MatrixPOS's invoices to shops. Set these in the environment. */
export const seller = () => ({
  name: LEGAL.company,
  address: (process.env.INVOICE_ADDRESS ?? "").split(/\s*\|\s*|\n/).filter(Boolean),
  companyNumber: process.env.INVOICE_COMPANY_NUMBER || "",
  vatNumber: process.env.INVOICE_VAT_NUMBER || "",
  email: legalEmail(),
  bank: (process.env.INVOICE_BANK_DETAILS ?? "").split(/\s*\|\s*|\n/).filter(Boolean),
  paymentDays: Number(process.env.INVOICE_PAYMENT_DAYS || 14),
  /** UK VAT at 20% is added unless CHARGE_VAT is "false" (for a business that isn't VAT registered). */
  chargeVat: (process.env.CHARGE_VAT ?? "true").toLowerCase() !== "false",
});
