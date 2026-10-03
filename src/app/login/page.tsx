import { Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, for: audience } = await searchParams;
  const nextPath = safeNext(next);
  if (await getUser()) redirect(nextPath ?? "/go");
  const business = audience === "business";

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{business ? "Welcome back" : "Your Spendbox"}</h1>
          <p className="mt-2 text-muted">
            {business ? "Log in to your business with your phone number and PIN." : "Log in with your phone number and PIN."}
          </p>
        </div>
        <LoginForm next={nextPath} />
        {business ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-muted ring-1 ring-line">
            <span className="font-semibold text-ink">New to Spendbox?</span>{" "}
            <Link href="/start" className="font-semibold text-brand-700 underline underline-offset-2">
              Start your free trial
            </Link>
            .
          </div>
        ) : (
          <div className="flex gap-3 rounded-2xl bg-white p-4 text-sm text-muted ring-1 ring-line">
            <Ticket className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
            <p>
              <span className="font-semibold text-ink">First time here?</span> You&apos;ll need an invite. Ask a
              business you buy from for their Spendbox link, open it, and you&apos;re in.{" "}
              <Link href="/plug" className="font-semibold text-brand-700 underline underline-offset-2">
                Own a business?
              </Link>
            </p>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
