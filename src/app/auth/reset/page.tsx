import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/auth/reset">) {
  const { token } = await searchParams;
  return (
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Choose a new password</h1>
          <p className="mt-2 text-muted">You&apos;ll use it with your email to log in.</p>
        </div>
        <ResetForm token={typeof token === "string" ? token : ""} />
      </div>
    </AuthLayout>
  );
}
