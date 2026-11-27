import { STATUS_LABEL } from "@/lib/plans";

const tone: Record<string, string> = {
  TRIAL: "bg-sky-100 text-sky-800", ACTIVE: "bg-emerald-100 text-emerald-800", PAST_DUE: "bg-amber-100 text-amber-800",
  TRIAL_ENDED: "bg-orange-100 text-orange-800", SUSPENDED: "bg-red-100 text-red-800", CANCELLED: "bg-slate-200 text-slate-700",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${tone[status] ?? "bg-slate-100"}`}>{STATUS_LABEL[status] ?? status}</span>;
}
