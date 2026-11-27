"use client";
import { useState, useTransition } from "react";
import { resendVerification } from "@/lib/server/actions/account";

export function ResendVerification({ className = "btn-secondary py-1.5 text-sm" }: { className?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>();
  if (msg?.ok) return <span className="text-sm">{msg.ok}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={className} disabled={pending} onClick={() => start(async () => setMsg(await resendVerification()))}>
        {pending ? "Sending…" : "Send a new link"}
      </button>
      {msg?.error && <span className="text-sm text-red-700">{msg.error}</span>}
    </span>
  );
}
