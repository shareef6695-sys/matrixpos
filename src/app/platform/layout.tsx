import { cookies } from "next/headers";
import { PoweredBy } from "@/components/PoweredBy";
import { requireHq } from "@/lib/server/hq";
import { ROLE_LABEL, type HqPermission } from "@/lib/hq/roles";
import { HqShell, type IconName, type NavGroup } from "./HqShell";

export const metadata = { title: "Matrix HQ", robots: { index: false } };

// Modules and their sub-modules. A module with a title folds open in the sidebar; one without is a single link.
const NAV: { title: string | null; icon: IconName; items: [string, string, IconName, HqPermission][] }[] = [
  { title: null, icon: "home", items: [["/platform/home", "Dashboard", "home", "dashboard.view"]] },
  { title: "Sales", icon: "leads", items: [
    ["/platform/leads", "Leads", "leads", "leads.view"],
    ["/platform/clients", "Clients", "clients", "clients.view"],
    ["/platform/quotes", "Quotes", "quotes", "quotes.view"],
    ["/platform/contracts", "Contracts", "contracts", "contracts.view"],
  ] },
  { title: "Work", icon: "projects", items: [
    ["/platform/projects", "Projects", "projects", "projects.view"],
    ["/platform/time", "Time", "time", "time.log"],
  ] },
  { title: "Money", icon: "invoices", items: [
    ["/platform/invoices", "Invoices", "invoices", "invoices.view"],
    ["/platform/recurring", "Repeating invoices", "recurring", "invoices.view"],
    ["/platform/bills", "Bills & expenses", "bills", "accounts.view"],
    ["/platform/suppliers", "Suppliers", "suppliers", "accounts.view"],
    ["/platform/bank", "Bank", "bank", "accounts.view"],
  ] },
  { title: "Accounts", icon: "books", items: [
    ["/platform/accounts", "Overview", "books", "accounts.view"],
    ["/platform/accounts/reports", "Reports", "reports", "accounts.view"],
    ["/platform/accounts/chart", "Chart of accounts", "books", "accounts.view"],
    ["/platform/accounts/journals", "Journals", "books", "accounts.view"],
    ["/platform/accounts/vat", "VAT", "reports", "accounts.view"],
    ["/platform/accounts/year-end", "Year end", "reports", "accounts.view"],
    ["/platform/accounts/settings", "Lock date", "books", "accounts.view"],
  ] },
  { title: "Setup", icon: "catalogue", items: [
    ["/platform/currencies", "Currencies", "currencies", "invoices.view"],
    ["/platform/catalogue", "Catalogue", "catalogue", "catalogue.view"],
    ["/platform/team", "HQ staff", "team", "team.manage"],
  ] },
  { title: null, icon: "shops", items: [["/platform", "POS customers", "shops", "shops.manage"]] },
];

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  // Every page and action checks again: Next.js can render a page without re-running its layout.
  const h = await requireHq();
  // Links are only shown for what the role allows; the pages themselves enforce it on the server.
  const groups: NavGroup[] = NAV
    .map((g) => ({ title: g.title, icon: g.icon, items: g.items.filter(([, , , p]) => h.can(p)).map(([href, label, icon]) => ({ href, label, icon })) }))
    .filter((g) => g.items.length);
  const collapsed = (await cookies()).get("hq_nav")?.value === "collapsed";
  return (
    <HqShell groups={groups} who={`${h.name} · ${ROLE_LABEL[h.role].name}`} isOwner={h.role === "OWNER"} initialCollapsed={collapsed}>
      {children}
      <footer className="pt-10 text-center print:hidden"><PoweredBy /></footer>
    </HqShell>
  );
}
