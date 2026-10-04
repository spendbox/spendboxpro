import { LogOut, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { BusinessAvatar } from "@/components/ui/avatar";
import { Card, SectionTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { ActionSwitch } from "@/components/ui/switch";
import { signOut } from "@/lib/actions/auth";
import { getOwnedBusinesses, requireUser } from "@/lib/auth";
import { getMyMemberships, getMyProfile } from "@/lib/customer";
import { setSharing } from "../actions";
import { DeleteAccount } from "./delete-account";
import { DetailCards } from "./profile-cards";

export const metadata: Metadata = { title: "Profile & privacy" };

export default async function ProfilePage() {
  const user = await requireUser("/me/profile");
  const [profile, memberships, owned] = await Promise.all([getMyProfile(user.id), getMyMemberships(user.id), getOwnedBusinesses()]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <PageHeader title="Profile & privacy" description="Tap a card to change it. Changes show everywhere straight away." />

      <section className="flex flex-col gap-3">
        <SectionTitle title="Your details" />
        <DetailCards profile={profile} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle
          title="Who can see my details"
          description="Switch on to show your name, phone, email, gender and birthday on a business's customer list. Otherwise they only see your member number. Your requests always show the contact you pick for them."
        />
        <Card className="divide-y divide-line px-5">
          {memberships.length === 0 ? (
            <p className="py-5 text-muted">You haven&apos;t joined any businesses yet.</p>
          ) : (
            memberships.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-4">
                <BusinessAvatar name={m.business.name} color={m.business.brand_color} logoUrl={m.business.logo_url} size="sm" />
                <p className="min-w-0 flex-1 truncate font-semibold">{m.business.name}</p>
                <ActionSwitch initial={m.share_details} label={`Share my details with ${m.business.name}`} action={setSharing.bind(null, m.id)} />
              </div>
            ))
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="More" />
        <Card className="flex flex-col gap-4 p-5">
          <p className="text-sm text-muted">
            Read our{" "}
            <a href="/privacy" className="font-semibold text-brand-700 underline underline-offset-2">
              privacy policy
            </a>{" "}
            and{" "}
            <a href="/terms" className="font-semibold text-brand-700 underline underline-offset-2">
              terms
            </a>
            .
          </p>
          <form action={signOut}>
            <SubmitButton variant="secondary">
              <LogOut className="size-4" aria-hidden /> Log out
            </SubmitButton>
          </form>
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="danger-zone">
        <h2 id="danger-zone" className="flex items-center gap-2 font-display text-lg font-bold text-red-800">
          <TriangleAlert className="size-5" aria-hidden /> Danger zone
        </h2>
        <div className="flex flex-col gap-3 rounded-3xl border-2 border-red-200 bg-red-50/50 p-5">
          <div>
            <p className="font-semibold text-ink">Delete my Spendbox</p>
            <p className="text-sm text-muted">
              Removes your details, requests, perks and memberships from every business, for good.
            </p>
          </div>
          <div>
            <DeleteAccount ownsBusiness={owned.length > 0} />
          </div>
        </div>
      </section>
    </div>
  );
}
