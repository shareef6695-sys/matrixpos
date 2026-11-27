import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { db } from "@/lib/server/db";
import { consumeToken } from "@/lib/server/tokens";

export const metadata = { title: "Confirm your email" };
export const dynamic = "force-dynamic";

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const userId = await consumeToken(token, "VERIFY_EMAIL");
  if (userId) await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return (
    <AuthCard title={userId ? "Email confirmed" : "Link not valid"}>
      <p className="text-sm text-slate-600">
        {userId ? "Thanks, your email address is confirmed." : "This link has expired or was already used. Sign in and choose \"Send a new link\" to get another."}
      </p>
      <Link href="/admin" className="btn-primary mt-5 w-full py-3">Go to the back office</Link>
    </AuthCard>
  );
}
