"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function HqNav({ items }: { items: [string, string][] }) {
  const path = usePathname();
  return (
    <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
      {items.map(([href, label]) => {
        const active = href === "/platform" ? path === href || /^\/platform\/c[a-z0-9]{20,}$/.test(path) : path.startsWith(href);
        return (
          <Link key={href} href={href} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-violet-50 text-violet-800" : "text-slate-600 hover:bg-slate-50"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
