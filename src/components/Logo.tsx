export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#0f766e" />
        <path d="M14 46V18h7l11 15 11-15h7v28h-7V30l-11 14-11-14v16z" fill="#fff" />
      </svg>
      <span>Matrix<span className="text-brand-600">POS</span></span>
    </span>
  );
}
