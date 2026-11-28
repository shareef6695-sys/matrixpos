export const COMPANY = "Matrix Infotech Ltd.";

/** "Powered by" credit. Links to the company site, except on the till where staff shouldn't leave the page. */
export function PoweredBy({ className = "", link = true }: { className?: string; link?: boolean }) {
  const name = <span className="font-semibold text-slate-600">{COMPANY}</span>;
  return (
    <p className={`text-xs text-slate-500 ${className}`}>
      Powered by {link ? <a href="https://matrixinfo.co.uk" className="hover:text-slate-900">{name}</a> : name}
    </p>
  );
}
