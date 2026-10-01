import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
import { getOwnedBusinesses, getUser } from "@/lib/auth";
import { StartFlow } from "./start-flow";

export const metadata: Metadata = { title: "Start your free trial" };

export default async function StartPage() {
  const user = await getUser();
  const owned = user ? await getOwnedBusinesses() : [];

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-sm font-semibold text-brand-700">Starts with a free trial</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
            {owned.length > 0 ? "Add another business" : "Get your Spendbox link"}
          </h1>
          <p className="mt-2 text-muted">Takes about a minute. You can add perks and bank accounts next.</p>
        </div>
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
