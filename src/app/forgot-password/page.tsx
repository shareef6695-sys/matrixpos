import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { SimpleForm } from "@/components/SimpleForm";
import { forgotPassword } from "@/lib/server/actions/account";

export const metadata = { title: "Forgot password", robots: { index: false } };

export default function ForgotPassword() {
  return (
    <AuthCard title="Reset your password" footer={<Link className="font-semibold text-brand-700" href="/login">Back to sign in</Link>}>
      <p className="mb-4 text-sm text-slate-600">Enter the email you sign in with and we'll send you a link to choose a new password.</p>
      <SimpleForm action={forgotPassword} submit="Send reset link" hideOnOk>
        <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
      </SimpleForm>
      <p className="mt-4 text-xs text-slate-500">Cashiers and supervisors use a PIN at the till. A manager can change their PIN under Staff.</p>
    </AuthCard>
  );
}
