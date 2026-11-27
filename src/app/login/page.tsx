import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const { next, reset } = await searchParams;
  return (
    <AuthCard title="Sign in to the back office" footer={<>New to MatrixPOS? <Link className="font-semibold text-brand-700" href="/signup">Create your shop</Link></>}>
      {reset && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Your password has been changed. Sign in with your new password.</p>}
      <LoginForm next={next ?? ""} />
      <p className="mt-3 text-center text-sm"><Link href="/forgot-password" className="font-semibold text-brand-700">Forgot your password?</Link></p>
      <p className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        Demo: <b>owner@demo.matrixpos.uk</b> / <b>demo1234</b>. Cashiers sign in at the <Link href="/till" className="font-semibold text-brand-700">till</Link> with a PIN.
      </p>
    </AuthCard>
  );
}
