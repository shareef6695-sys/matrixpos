import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { SignupForm } from "./SignupForm";
import { seller } from "@/lib/legal";

export const metadata = {
  title: "Start your free trial",
  description: "Create your MatrixPOS shop in minutes. 14-day free trial, no card needed. POS from £12 a month for UK shops and supermarkets.",
  alternates: { canonical: "/signup" },
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return (
    <AuthCard title="Create your shop" footer={<>Already have an account? <Link className="font-semibold text-brand-700" href="/login">Sign in</Link></>}>
      <SignupForm plan={["STARTER", "BUSINESS", "ENTERPRISE"].includes(plan ?? "") ? plan : "BUSINESS"} vat={seller().chargeVat} />
    </AuthCard>
  );
}
