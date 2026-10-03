import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
import { getOwnedBusinesses, getUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { StartFlow } from "./start-flow";

export const metadata: Metadata = { title: "Get started" };

export default async function StartPage() {
  const user = await getUser();
  const [owned, settings] = await Promise.all([user ? getOwnedBusinesses() : [], getSettings()]);

  if (!settings.signupsOpen) {
    return (
      <AuthLayout>
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">We&apos;re not taking new businesses just yet</h1>
          <p className="text-muted">We&apos;re getting a few things ready. Please check back soon.</p>
          {owned.length > 0 && (
            <Link href={`/dashboard/${owned[0].id}`} className="font-semibold text-brand-700 underline underline-offset-2">
              Back to your business
            </Link>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <p className="text-sm font-semibold text-brand-700">
          {owned.length > 0 ? "Add another business" : settings.trialEnabled ? `Start your free ${settings.trialDays}-day trial` : "Get started"} · takes about a minute
        </p>
        <StartFlow signedIn={Boolean(user)} />
        {!user && (
          <p className="text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-brand-700 underline underline-offset-2">
              Log in
            </Link>
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
