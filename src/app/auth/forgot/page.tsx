import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Forgot your password?</h1>
          <p className="mt-2 text-muted">Type your email and we&apos;ll send you a link to choose a new one.</p>
        </div>
        <ForgotForm />
        <Link href="/login" className="text-sm font-semibold text-brand-700 underline underline-offset-2">
          Back to log in
        </Link>
      </div>
    </AuthLayout>
  );
}
