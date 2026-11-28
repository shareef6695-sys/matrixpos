import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { SimpleForm } from "@/components/SimpleForm";
import { resetPassword } from "@/lib/server/actions/account";
import { peekToken } from "@/lib/server/tokens";

export const metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const valid = await peekToken(token, "RESET_PASSWORD");
  return (
    <AuthCard title="Choose a new password" footer={<Link className="font-semibold text-brand-700" href="/login">Back to sign in</Link>}>
      {!valid ? (
        <p className="text-sm text-slate-600">This link has expired or was already used. <Link href="/forgot-password" className="font-semibold text-brand-700">Ask for a new one</Link>.</p>
      ) : (
        <SimpleForm action={resetPassword} submit="Save new password">
          <input type="hidden" name="token" value={token} />
          <div><label className="label" htmlFor="password">New password</label><input className="input" id="password" name="password" type="password" minLength={8} autoComplete="new-password" required /></div>
          <div><label className="label" htmlFor="confirm">Type it again</label><input className="input" id="confirm" name="confirm" type="password" minLength={8} autoComplete="new-password" required /></div>
        </SimpleForm>
      )}
    </AuthCard>
  );
}
