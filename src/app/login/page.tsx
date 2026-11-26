import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthCard title="Sign in to the back office" footer={<>New to MatrixPOS? <Link className="font-semibold text-brand-700" href="/signup">Create your shop</Link></>}>
      <LoginForm next={next ?? ""} />
      <p className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        Demo: <b>owner@demo.matrixpos.uk</b> / <b>demo1234</b>. Cashiers sign in at the <Link href="/till" className="font-semibold text-brand-700">till</Link> with a PIN.
      </p>
    </AuthCard>
  );
}
