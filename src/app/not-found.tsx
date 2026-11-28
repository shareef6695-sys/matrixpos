import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="card w-full max-w-md text-center">
        <Logo className="text-xl" />
        <h1 className="mt-4 text-xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">That page doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/" className="btn-secondary">Home</Link>
          <Link href="/admin" className="btn-primary">Back office</Link>
        </div>
      </div>
    </main>
  );
}
