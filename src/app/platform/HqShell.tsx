"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { logout } from "@/lib/server/actions/auth";

export interface NavGroup { title: string | null; items: { href: string; label: string; icon: IconName }[] }
export type IconName = "home" | "leads" | "clients" | "quotes" | "invoices" | "currencies" | "catalogue" | "team" | "shops" | "recurring" | "bank" | "bills" | "suppliers" | "books" | "reports" | "projects" | "time" | "contracts";

// Outline icons, 24x24, drawn with the current text colour.
const ICONS: Record<IconName | "collapse" | "menu" | "close" | "logout", string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  leads: "M3 4h18l-7 8.5V19l-4 2v-8.5z",
  clients: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.87M16 3.13a3.5 3.5 0 0 1 0 6.75",
  quotes: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5",
  invoices: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6M9 16h3",
  currencies: "M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.8 7 7s2.2 3 5 3.5 5 1.5 5 3.8-2.2 3.7-5 3.7-5-1.2-5-3.2",
  catalogue: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  team: "M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 8v6M22 11h-6",
  shops: "M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6",
  recurring: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  bank: "M3 10h18L12 4zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18",
  bills: "M6 2h9l5 5v15H6zM15 2v5h5M9 13h6M9 17h6",
  suppliers: "M1 4h14v11H1zM15 8h4l3 3v4h-7M5.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M18.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  books: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5",
  reports: "M3 3v18h18M7 16v-5M12 16V7M17 16v-8",
  projects: "M3 7h18v13H3zM8 7V4h8v3M3 12h18",
  time: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2",
  contracts: "M9 12l2 2 4-4M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2",
  collapse: "M15 6l-6 6 6 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3",
  close: "M6 6l12 12M18 6 6 18",
};

function Icon({ name, className = "h-5 w-5" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** HQ's page frame: a left sidebar that collapses to icons (remembered in a cookie), and a slide-out menu on phones. */
export function HqShell({ groups, who, isOwner, initialCollapsed, children }: {
  groups: NavGroup[]; who: string; isOwner: boolean; initialCollapsed: boolean; children: React.ReactNode;
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    // Only a layout preference, so a plain cookie is fine (no personal data).
    document.cookie = `hq_nav=${next ? "collapsed" : "open"}; path=/platform; max-age=31536000; samesite=lax`;
  };
  // The most specific link wins, so Reports (under Books) doesn't light up Books too.
  const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const under = (href: string) => path === href || path.startsWith(`${href}/`);
  const active = (href: string) => (href === "/platform" ? path === href || /^\/platform\/c[a-z0-9]{20,}$/.test(path)
    : under(href) && !hrefs.some((o) => o.length > href.length && o.startsWith(href) && under(o)));

  const nav = (compact: boolean, onPick?: () => void) => (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && (compact ? <div className="mx-3 mb-2 border-t border-slate-200" /> : <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.title}</div>)}
          <ul className="space-y-0.5">
            {g.items.map((it) => (
              <li key={it.href}>
                <Link
                  href={it.href}
                  onClick={onPick}
                  title={compact ? it.label : undefined}
                  aria-label={compact ? it.label : undefined}
                  aria-current={active(it.href) ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg py-2 text-sm font-medium ${compact ? "justify-center px-2" : "px-3"} ${active(it.href) ? "bg-violet-50 text-violet-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
                >
                  <Icon name={it.icon} />
                  {!compact && <span className="truncate">{it.label}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (compact: boolean) => (
    <div className={`border-t border-slate-200 p-3 text-sm ${compact ? "space-y-2 text-center" : "space-y-2"}`}>
      {!compact && <div className="truncate px-1 text-xs text-slate-500">{who}</div>}
      {isOwner && <Link href="/admin" title="My shop" className={`block rounded-lg px-1 py-1 font-semibold text-slate-700 hover:text-slate-900 ${compact ? "text-xs" : ""}`}>{compact ? "Shop" : "My shop"}</Link>}
      <form action={logout}>
        {compact
          ? <button className="mx-auto flex rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Sign out" aria-label="Sign out"><Icon name="logout" /></button>
          : <button className="btn-secondary w-full py-1.5 text-xs">Sign out</button>}
      </form>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Desktop sidebar */}
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 print:hidden lg:flex ${collapsed ? "w-[68px]" : "w-60"}`}>
        <div className={`flex items-center border-b border-slate-200 py-3 ${collapsed ? "flex-col gap-2 px-2" : "justify-between px-4"}`}>
          <Link href="/platform/home" className="flex items-center gap-2" title="Matrix HQ">
            {collapsed ? <span className="badge bg-violet-100 text-violet-800">HQ</span> : <><Logo className="text-lg" /><span className="badge bg-violet-100 text-violet-800">HQ</span></>}
          </Link>
          <button type="button" onClick={toggle} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={collapsed ? "Expand menu" : "Collapse menu"} title={collapsed ? "Expand menu" : "Collapse menu"} aria-expanded={!collapsed}>
            <Icon name="collapse" className={`h-5 w-5 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          </button>
        </div>
        {nav(collapsed)}
        {footer(collapsed)}
      </aside>

      {/* Phone and tablet top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 print:hidden lg:hidden">
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Open menu" aria-expanded={open}><Icon name="menu" className="h-6 w-6" /></button>
        <Link href="/platform/home" className="flex items-center gap-2"><Logo className="text-lg" /><span className="badge bg-violet-100 text-violet-800">HQ</span></Link>
        <span className="w-9" />
      </header>

      {/* Slide-out menu */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <span className="flex items-center gap-2"><Logo className="text-lg" /><span className="badge bg-violet-100 text-violet-800">HQ</span></span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close menu"><Icon name="close" /></button>
            </div>
            {nav(false, () => setOpen(false))}
            {footer(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 print:p-0">{children}</main>
      </div>
    </div>
  );
}
