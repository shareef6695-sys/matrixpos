"use client";
import { useState } from "react";
import { SimpleForm } from "@/components/SimpleForm";
import { requestClosure } from "@/lib/server/actions/account";

export function CloseAccount({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn-danger" onClick={() => setOpen(true)}>Close my account…</button>;
  return (
    <SimpleForm action={requestClosure} submit="Close account and delete data in 30 days" className="max-w-md space-y-3 [&>button]:bg-red-600 [&>button:hover]:bg-red-700">
      <p className="text-sm text-slate-600">Your tills and back office stop working straight away. Everything is deleted after 30 days, unless you sign in and keep the account before then.</p>
      <div><label className="label">Type <b>{name}</b> to confirm</label><input name="confirmName" className="input" autoComplete="off" required /></div>
      <div><label className="label">Your password</label><input name="password" type="password" className="input" autoComplete="current-password" required /></div>
    </SimpleForm>
  );
}
