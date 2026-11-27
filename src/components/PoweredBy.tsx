export const COMPANY = "Matrix Infotech Ltd.";

export function PoweredBy({ className = "" }: { className?: string }) {
  return <p className={`text-xs text-slate-500 ${className}`}>Powered by <span className="font-semibold text-slate-600">{COMPANY}</span></p>;
}
