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
        <p className="text-sm font-semibold text-brand-700">
          {owned.length > 0 ? "Add another business" : "Start your free trial"} · takes about a minute
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
