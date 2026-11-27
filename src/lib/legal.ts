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
