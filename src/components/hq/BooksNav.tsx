import Link from "next/link";

const TABS = [
  ["/platform/accounts", "Overview"], ["/platform/accounts/reports", "Reports"], ["/platform/accounts/chart", "Chart of accounts"],
  ["/platform/accounts/journals", "Journals"], ["/platform/accounts/vat", "VAT"], ["/platform/accounts/year-end", "Year end"], ["/platform/accounts/settings", "Lock date"],
] as const;

export function BooksNav({ current }: { current: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 print:hidden">
      {TABS.map(([href, label]) => (
        <Link key={href} href={href} className={`badge px-3 py-1.5 text-sm ${current === href ? "bg-violet-700 text-white" : "bg-white ring-1 ring-slate-200"}`}>{label}</Link>
      ))}
    </nav>
  );
}
