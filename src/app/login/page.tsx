import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNext(next);
  if (await getUser()) redirect(nextPath ?? "/go");

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-muted">Log in with the phone number you joined with.</p>
        </div>
        <LoginForm next={nextPath} />
        <div className="rounded-2xl bg-white p-4 text-sm text-muted ring-1 ring-line">
          <p>
            <span className="font-semibold text-ink">New here?</span> Customers join from a business&apos;s Spendbox
            link. Running a business?{" "}
            <Link href="/start" className="font-semibold text-brand-700 underline underline-offset-2">
              Get your free link
            </Link>
            .
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
