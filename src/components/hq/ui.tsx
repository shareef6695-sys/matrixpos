import Link from "next/link";

export function Pill({ s, map }: { s: string; map: Record<string, { label: string; cls: string }> }) {
  const v = map[s] ?? { label: s, cls: "bg-slate-100" };
  return <span className={`badge ${v.cls}`}>{v.label}</span>;
}

export function ErrorBanner({ error }: { error?: string }) {
  return error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error.slice(0, 300)}</div> : null;
}

export function Tabs({ base, current, tabs }: { base: string; current: string; tabs: [string, string][] }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {tabs.map(([k, label]) => (
        <Link key={k} href={k === "all" ? base : `${base}?f=${k}`} className={`badge px-3 py-1.5 text-sm ${current === k ? "bg-violet-700 text-white" : "bg-white ring-1 ring-slate-200"}`}>{label}</Link>
      ))}
    </div>
  );
}
