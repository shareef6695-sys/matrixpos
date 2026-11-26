import Link from "next/link";

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function StoreTabs({ stores, current, base, extra = "" }: { stores: { id: string; name: string }[]; current: string | undefined; base: string; extra?: string }) {
  if (stores.length < 2) return null;
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <Link href={`${base}?${extra}`} className={`badge px-3 py-1.5 text-sm ${!current ? "bg-brand-700 text-white" : "bg-white ring-1 ring-slate-200"}`}>All stores</Link>
      {stores.map((s) => (
        <Link key={s.id} href={`${base}?store=${s.id}${extra ? `&${extra}` : ""}`} className={`badge px-3 py-1.5 text-sm ${current === s.id ? "bg-brand-700 text-white" : "bg-white ring-1 ring-slate-200"}`}>{s.name}</Link>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">{children}</div>;
}
