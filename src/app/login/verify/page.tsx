import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { SimpleForm } from "@/components/SimpleForm";
import { verifyLoginCode } from "@/lib/server/actions/auth";

export const metadata = { title: "Two-step sign-in", robots: { index: false } };

export default function VerifyLogin() {
  return (
    <AuthCard title="Enter your sign-in code" footer={<Link className="font-semibold text-brand-700" href="/login">Back to sign in</Link>}>
      <p className="mb-4 text-sm text-slate-600">Open your authenticator app and type the 6-digit code for MatrixPOS.</p>
      <SimpleForm action={verifyLoginCode} submit="Sign in">
        <input name="code" className="input text-center text-2xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus aria-label="6-digit code" />
      </SimpleForm>
      <p className="mt-4 text-xs text-slate-500">Lost your phone? Ask the MatrixPOS team to switch off two-step sign-in for your account.</p>
    </AuthCard>
  );
}
