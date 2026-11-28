import { cookies } from "next/headers";
import { PoweredBy } from "@/components/PoweredBy";
import { requireHq } from "@/lib/server/hq";
import { ROLE_LABEL, type HqPermission } from "@/lib/hq/roles";
import { HqShell, type IconName, type NavGroup } from "./HqShell";

export const metadata = { title: "Matrix HQ", robots: { index: false } };

const NAV: { title: string | null; items: [string, string, IconName, HqPermission][] }[] = [
  { title: null, items: [["/platform/home", "Dashboard", "home", "dashboard.view"]] },
  { title: "Sales", items: [
    ["/platform/leads", "Leads", "leads", "leads.view"],
    ["/platform/clients", "Clients", "clients", "clients.view"],
    ["/platform/quotes", "Quotes", "quotes", "quotes.view"],
  ] },
  { title: "Money", items: [
    ["/platform/invoices", "Invoices", "invoices", "invoices.view"],
    ["/platform/currencies", "Currencies", "currencies", "invoices.view"],
  ] },
  { title: "Setup", items: [
    ["/platform/catalogue", "Catalogue", "catalogue", "catalogue.view"],
    ["/platform/team", "HQ staff", "team", "team.manage"],
  ] },
  { title: "MatrixPOS", items: [["/platform", "POS customers", "shops", "shops.manage"]] },
];

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  // Every page and action checks again: Next.js can render a page without re-running its layout.
  const h = await requireHq();
  // Links are only shown for what the role allows; the pages themselves enforce it on the server.
  const groups: NavGroup[] = NAV
    .map((g) => ({ title: g.title, items: g.items.filter(([, , , p]) => h.can(p)).map(([href, label, icon]) => ({ href, label, icon })) }))
    .filter((g) => g.items.length);
  const collapsed = (await cookies()).get("hq_nav")?.value === "collapsed";
  return (
    <HqShell groups={groups} who={`${h.name} · ${ROLE_LABEL[h.role].name}`} isOwner={h.role === "OWNER"} initialCollapsed={collapsed}>
      {children}
      <footer className="pt-10 text-center print:hidden"><PoweredBy /></footer>
    </HqShell>
  );
}
