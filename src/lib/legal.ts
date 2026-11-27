// Legal details shown on the privacy, terms and data processing pages.
export const LEGAL = {
  company: "Matrix Infotech Ltd.",
  product: "MatrixPOS",
  /** Registered office, shown on the legal pages. */
  address: "Fifth Floor, 167-169 Great Portland Street, London, W1W 5PF",
  companyNumber: "15056659",
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
  address: (process.env.INVOICE_ADDRESS || "Fifth Floor|167-169 Great Portland Street|London|W1W 5PF").split(/\s*\|\s*|\n/).filter(Boolean),
  companyNumber: process.env.INVOICE_COMPANY_NUMBER || "15056659",
  vatNumber: process.env.INVOICE_VAT_NUMBER || "",
  email: legalEmail(),
  bank: (process.env.INVOICE_BANK_DETAILS ?? "").split(/\s*\|\s*|\n/).filter(Boolean),
  paymentDays: Number(process.env.INVOICE_PAYMENT_DAYS || 14),
  /** Matrix Infotech Ltd. isn't VAT registered yet, so no VAT is charged. Once registered, set CHARGE_VAT=true and INVOICE_VAT_NUMBER. */
  chargeVat: (process.env.CHARGE_VAT ?? "false").toLowerCase() === "true",
});
