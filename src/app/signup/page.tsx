import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your Spendbox" };

/** Anyone can make a Spendbox; an invite from a business is not needed. */
export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  const nextPath = safeNext(next);
  if (await getUser()) redirect(nextPath ?? "/go");

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Create your Spendbox</h1>
          <p className="mt-2 text-muted">Find the businesses you love, see what they&apos;re selling and get their perks. It&apos;s free.</p>
        </div>
        <SignupForm next={nextPath} />
        <div className="rounded-2xl bg-white p-4 text-sm text-muted ring-1 ring-line">
          <span className="font-semibold text-ink">Already have a Spendbox?</span>{" "}
          <Link href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"} className="font-semibold text-brand-700 underline underline-offset-2">
            Log in
          </Link>
          {" · "}
          <Link href="/plug" className="font-semibold text-brand-700 underline underline-offset-2">
            Own a business?
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
