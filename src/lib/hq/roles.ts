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
  "projects.view", // projects, tasks and everyone's time
  "projects.edit", // create projects, manage tasks, change anyone's time
  "time.log", // log and change your own time
  "contracts.view", "contracts.edit", // client contracts and renewals
  "dashboard.view",
  "team.manage", // add and remove HQ staff
  "shops.manage", // the MatrixPOS shop customers and their billing
] as const;
export type HqPermission = (typeof PERMISSIONS)[number];

const VIEW: HqPermission[] = ["clients.view", "leads.view", "catalogue.view", "quotes.view", "invoices.view", "accounts.view", "projects.view", "contracts.view", "dashboard.view"];

export const ROLE_PERMISSIONS: Record<HqRoleName, readonly HqPermission[]> = {
  OWNER: PERMISSIONS,
  MANAGER: PERMISSIONS.filter((p) => p !== "team.manage" && p !== "shops.manage"),
  SALES: ["clients.view", "clients.edit", "leads.view", "leads.edit", "catalogue.view", "quotes.view", "quotes.edit", "invoices.view", "projects.view", "contracts.view", "contracts.edit", "dashboard.view"],
  ACCOUNTS: ["clients.view", "clients.edit", "catalogue.view", "catalogue.edit", "quotes.view", "invoices.view", "invoices.edit", "payments.edit", "fx.edit", "accounts.view", "accounts.edit", "projects.view", "contracts.view", "contracts.edit", "dashboard.view"],
  PROJECTS: ["clients.view", "catalogue.view", "projects.view", "projects.edit", "time.log", "contracts.view"],
  VIEWER: VIEW,
};

export const ROLE_LABEL: Record<HqRoleName, { name: string; about: string }> = {
  OWNER: { name: "Owner", about: "Everything, including HQ staff and the POS shop customers" },
  MANAGER: { name: "Manager", about: "Every business module, but not HQ staff or POS shop customers" },
  SALES: { name: "Sales", about: "Clients, leads, quotes, contracts and renewals. Can see invoices and projects" },
  ACCOUNTS: { name: "Accounts", about: "Clients, invoices, payments, bills, bank, the books and reports, contracts, catalogue and exchange rates. Can see quotes and projects" },
  PROJECTS: { name: "Project staff", about: "Projects, tasks and time tracking. Can see clients, contracts and the catalogue" },
  VIEWER: { name: "Read only", about: "Can see the business modules, but can't change anything" },
};

/** The roles an owner can give to staff (OWNER comes only from PLATFORM_ADMIN_EMAILS). */
export const STAFF_ROLES = ["MANAGER", "SALES", "ACCOUNTS", "PROJECTS", "VIEWER"] as const;

export const can = (role: HqRoleName, p: HqPermission) => ROLE_PERMISSIONS[role]?.includes(p) ?? false;
