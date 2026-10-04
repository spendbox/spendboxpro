import type { Metadata } from "next";
import { Handshake } from "lucide-react";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
import { getOwnedBusinesses, getUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { StartFlow } from "./start-flow";

export const metadata: Metadata = { title: "Get started" };

export default async function StartPage({ searchParams }: PageProps<"/start">) {
  const { partner } = await searchParams;
  const partnerSlug = typeof partner === "string" && /^[a-z0-9-]{2,60}$/i.test(partner) ? partner.toLowerCase() : null;
  const user = await getUser();
  const [owned, settings, inviter] = await Promise.all([
    user ? getOwnedBusinesses() : [],
    getSettings(),
    partnerSlug
      ? createAdminClient().from("businesses").select("name, partners_enabled").eq("slug", partnerSlug).maybeSingle().then((r) => r.data)
      : null,
  ]);
  const invitedBy = inviter?.partners_enabled ? inviter.name : null;

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
        {invitedBy && (
          <div className="flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-100">
            <Handshake className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
            <p>
              <span className="font-semibold">{invitedBy}</span> invited you to partner on Spendbox. Once you&apos;re set up, you&apos;ll be
              recommended to each other&apos;s customers.
            </p>
          </div>
        )}
        <StartFlow signedIn={Boolean(user)} partnerInvite={invitedBy ? partnerSlug : null} />
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
