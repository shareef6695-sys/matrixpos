"use client";
import { useState, useTransition } from "react";
import { startTotp, enableTotp } from "@/lib/server/actions/account";
import { SimpleForm } from "@/components/SimpleForm";

export function TotpSetup({ qr, secret }: { qr: string | null; secret: string | null }) {
  const [pending, start] = useTransition();
  const [started, setStarted] = useState(!!secret);
  if (!started || !secret || !qr) {
    return (
      <button className="btn-primary" disabled={pending} onClick={() => start(async () => { await startTotp(); setStarted(true); })}>
        {pending ? "Setting up…" : "Set up two-step sign-in"}
      </button>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded-lg border border-slate-200" />
      <div className="space-y-3 text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-slate-600">
          <li>Install an authenticator app, like Google Authenticator or Microsoft Authenticator.</li>
          <li>Scan the QR code, or enter this key: <code className="break-all rounded bg-slate-100 px-1 font-mono text-xs">{secret}</code></li>
          <li>Type the 6-digit code the app shows.</li>
        </ol>
        <SimpleForm action={enableTotp} submit="Turn on" className="flex flex-wrap items-start gap-2 [&>button]:w-auto [&>button]:py-2">
          <input name="code" className="input w-36 text-center tracking-widest" inputMode="numeric" pattern="\d{6}" maxLength={6} placeholder="123456" required aria-label="6-digit code" />
        </SimpleForm>
      </div>
    </div>
  );
}
