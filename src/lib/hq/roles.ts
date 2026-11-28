// Who can do what in Matrix HQ. The platform owner (PLATFORM_ADMIN_EMAILS) is OWNER; staff get one HqRole.
// Every page and server action checks these on the server: hiding a link is never the protection.

export type HqRoleName = "OWNER" | "MANAGER" | "SALES" | "ACCOUNTS" | "PROJECTS" | "VIEWER";

export const PERMISSIONS = [
  "clients.view", "clients.edit",
  "leads.view", "leads.edit",
  "catalogue.view", "catalogue.edit",
  "quotes.view", "quotes.edit",
  "invoices.view", "invoices.edit", "payments.edit",
  "fx.edit",
  "accounts.view", // the books: ledger, bank, bills, reports
  "accounts.edit", // post journals, bills, bank matching, lock dates
  "dashboard.view",
  "team.manage", // add and remove HQ staff
  "shops.manage", // the MatrixPOS shop customers and their billing
] as const;
export type HqPermission = (typeof PERMISSIONS)[number];

const VIEW: HqPermission[] = ["clients.view", "leads.view", "catalogue.view", "quotes.view", "invoices.view", "accounts.view", "dashboard.view"];

export const ROLE_PERMISSIONS: Record<HqRoleName, readonly HqPermission[]> = {
  OWNER: PERMISSIONS,
  MANAGER: PERMISSIONS.filter((p) => p !== "team.manage" && p !== "shops.manage"),
  SALES: ["clients.view", "clients.edit", "leads.view", "leads.edit", "catalogue.view", "quotes.view", "quotes.edit", "invoices.view", "dashboard.view"],
  ACCOUNTS: ["clients.view", "clients.edit", "catalogue.view", "catalogue.edit", "quotes.view", "invoices.view", "invoices.edit", "payments.edit", "fx.edit", "accounts.view", "accounts.edit", "dashboard.view"],
  PROJECTS: ["clients.view", "catalogue.view"],
  VIEWER: VIEW,
};

export const ROLE_LABEL: Record<HqRoleName, { name: string; about: string }> = {
  OWNER: { name: "Owner", about: "Everything, including HQ staff and the POS shop customers" },
  MANAGER: { name: "Manager", about: "Every business module, but not HQ staff or POS shop customers" },
  SALES: { name: "Sales", about: "Clients, leads and quotes. Can see invoices" },
  ACCOUNTS: { name: "Accounts", about: "Clients, invoices, payments, bills, bank, the books and reports, catalogue and exchange rates. Can see quotes" },
  PROJECTS: { name: "Project staff", about: "Can see clients and the catalogue (projects and time tracking come in phase 3)" },
  VIEWER: { name: "Read only", about: "Can see the business modules, but can't change anything" },
};

/** The roles an owner can give to staff (OWNER comes only from PLATFORM_ADMIN_EMAILS). */
export const STAFF_ROLES = ["MANAGER", "SALES", "ACCOUNTS", "PROJECTS", "VIEWER"] as const;

export const can = (role: HqRoleName, p: HqPermission) => ROLE_PERMISSIONS[role]?.includes(p) ?? false;
