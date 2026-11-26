import Link from "next/link";

const tabs = [
  ["/admin/accounts", "Overview"],
  ["/admin/accounts/bills", "Bills & expenses"],
  ["/admin/accounts/money", "Bank & cash"],
  ["/admin/accounts/reports", "Reports"],
  ["/admin/accounts/journals", "Ledger"],
  ["/admin/accounts/chart", "Chart of accounts"],
];

export function AccountsTabs({ current }: { current: string }) {
  return (
    <div className="no-print mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map(([href, label]) => (
        <Link key={href} href={href} className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${current === href ? "border-brand-700 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</Link>
      ))}
    </div>
  );
}
