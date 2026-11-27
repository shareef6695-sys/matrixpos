"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items: [string, string, ("OWNER" | "MANAGER")[]][] = [
  ["/admin", "Dashboard", ["OWNER", "MANAGER"]],
  ["/admin/products", "Products", ["OWNER", "MANAGER"]],
  ["/admin/stock", "Stock", ["OWNER", "MANAGER"]],
  ["/admin/promotions", "Offers", ["OWNER", "MANAGER"]],
  ["/admin/purchasing", "Suppliers & orders", ["OWNER", "MANAGER"]],
  ["/admin/sales", "Sales", ["OWNER", "MANAGER"]],
  ["/admin/reports", "Reports", ["OWNER", "MANAGER"]],
  ["/admin/accounts", "Accounts", ["OWNER", "MANAGER"]],
  ["/admin/customers", "Customers", ["OWNER", "MANAGER"]],
  ["/admin/staff", "Staff", ["OWNER", "MANAGER"]],
  ["/admin/stores", "Stores & tills", ["OWNER"]],
  ["/admin/settings", "Settings", ["OWNER"]],
  ["/admin/billing", "Plan & billing", ["OWNER"]],
];

export function AdminNav({ role, platform = false }: { role: string; platform?: boolean }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">
      {items.filter(([, , roles]) => roles.includes(role as "OWNER")).map(([href, label]) => {
        const active = href === "/admin" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-50"}`}>
            {label}
          </Link>
        );
      })}
      {platform && (
        <Link href="/platform" className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">MatrixPOS HQ</Link>
      )}
    </nav>
  );
}
