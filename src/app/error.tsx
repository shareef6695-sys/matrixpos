"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";

/** Shown instead of a blank "Application error" page when something goes wrong on the server. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="card w-full max-w-md text-center">
        <Logo className="text-xl" />
        <h1 className="mt-4 text-xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">Sorry, that didn&apos;t work. Please try again. If it keeps happening, contact MatrixPOS support and quote the code below.</p>
        {error.digest && <p className="mt-3 font-mono text-xs text-slate-500">Code: {error.digest}</p>}
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={reset} className="btn-primary">Try again</button>
          <Link href="/admin" className="btn-secondary">Back office</Link>
        </div>
      </div>
    </main>
  );
}
