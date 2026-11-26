import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "Create your shop" };

export default function SignupPage() {
  return (
    <AuthCard title="Create your shop" footer={<>Already have an account? <Link className="font-semibold text-brand-700" href="/login">Sign in</Link></>}>
      <SignupForm />
    </AuthCard>
  );
}
