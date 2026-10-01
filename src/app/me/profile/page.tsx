import { BadgeCheck, LogOut } from "lucide-react";
import type { Metadata } from "next";
import { BusinessAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ActionSwitch } from "@/components/ui/switch";
import { signOut } from "@/lib/actions/auth";
import { getOwnedBusinesses, requireUser } from "@/lib/auth";
import { getMyMemberships, getMyProfile } from "@/lib/customer";
import { formatPhone } from "@/lib/format";
import { setSharing } from "../actions";
import { DeleteAccount } from "./delete-account";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile & privacy" };

export default async function ProfilePage() {
  const user = await requireUser("/me/profile");
  const [profile, memberships, owned] = await Promise.all([
    getMyProfile(user.id),
    getMyMemberships(user.id),
    getOwnedBusinesses(),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <PageHeader title="Profile & privacy" description="Your details live in one place. Change them here and every business you share with sees the update." />

      <Card className="flex flex-col gap-6 p-5 sm:p-7">
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-canvas px-4 py-3">
          <div>
            <p className="text-sm text-muted">Phone</p>
            <p className="font-semibold">{formatPhone(profile?.phone ?? user.phone)}</p>
          </div>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
            <BadgeCheck className="size-4" aria-hidden /> Verified
          </span>
        </div>
        <ProfileForm profile={profile} />
      </Card>

      <section className="flex flex-col gap-3">
        <SectionTitle
          title="Who can see my details"
          description="Businesses only see your name, phone, gender and birthday when you switch them on. Otherwise they see your member number and purchases."
        />
        <Card className="divide-y divide-line px-5">
          {memberships.length === 0 ? (
            <p className="py-5 text-muted">You haven&apos;t joined any businesses yet.</p>
          ) : (
            memberships.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-4">
                <BusinessAvatar name={m.business.name} color={m.business.brand_color} logoUrl={m.business.logo_url} size="sm" />
                <p className="min-w-0 flex-1 truncate font-semibold">{m.business.name}</p>
                <ActionSwitch
                  initial={m.share_details}
                  label={`Share my details with ${m.business.name}`}
                  action={setSharing.bind(null, m.id)}
                />
              </div>
            ))
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="Account" />
        <Card className="flex flex-col gap-5 p-5 sm:p-7">
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
            <Button type="submit" variant="secondary">
              <LogOut className="size-4" aria-hidden /> Log out
            </Button>
          </form>
          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <div>
              <p className="font-semibold">Delete my Spendbox</p>
              <p className="text-sm text-muted">
                Removes your number, details, visits and memberships from every business, permanently.
              </p>
            </div>
            <div>
              <DeleteAccount ownsBusiness={owned.length > 0} />
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
