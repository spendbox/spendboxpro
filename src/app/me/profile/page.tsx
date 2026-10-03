import { ChevronRight, History, LogOut, Phone, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BusinessAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { EditCard } from "@/components/ui/edit-card";
import { PageHeader } from "@/components/ui/page-header";
import { ActionSwitch } from "@/components/ui/switch";
import { signOut } from "@/lib/actions/auth";
import { getOwnedBusinesses, requireUser } from "@/lib/auth";
import { getMyMemberships, getMyProfile } from "@/lib/customer";
import { formatPhone } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { setSharing } from "../actions";
import { DeleteAccount } from "./delete-account";
import { BankAccountsCard, DetailCards, type MyAccountRow } from "./profile-cards";

export const metadata: Metadata = { title: "Profile & privacy" };

export default async function ProfilePage() {
  const user = await requireUser("/me/profile");
  const supabase = await createClient();
  const [profile, memberships, owned, { data: payers }] = await Promise.all([
    getMyProfile(user.id),
    getMyMemberships(user.id),
    getOwnedBusinesses(),
    supabase
      .from("payers")
      .select("id, sender_name, sender_account, institution, verified, learned_at_business")
      .order("created_at"),
  ]);
  const accounts: MyAccountRow[] = (payers ?? [])
    .map((p) => ({ ...p, mine: p.learned_at_business === null }))
    .sort((a, b) => Number(b.mine) - Number(a.mine));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <PageHeader title="Profile & privacy" description="Tap a card to change it. Changes show everywhere straight away." />

      <section className="flex flex-col gap-3">
        <SectionTitle title="Your details" />
        <EditCard readOnly icon={<Phone className="size-5" aria-hidden />} label="Phone" value={formatPhone(profile?.phone ?? user.phone)} note="You log in with this number" />
        <DetailCards profile={profile} hasBank={accounts.some((a) => a.mine)} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle
          title="Bank accounts you pay from"
          description="Transfers from these count for you by themselves, at every business you've joined. Businesses never see this list."
        />
        <BankAccountsCard accounts={accounts} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle
          title="Who can see my details"
          description="Businesses only see your name, phone, email, gender and birthday when you switch them on. Otherwise they see your member number and purchases."
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
        <Link href="/me/audits" className="flex items-center gap-3.5 rounded-3xl bg-surface p-4 shadow-card ring-1 ring-line transition hover:ring-brand-300 sm:p-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <History className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Audits</span>
            <span className="block text-sm text-muted">Everything businesses did with your purchases and perks</span>
          </span>
          <ChevronRight className="size-5 text-muted" aria-hidden />
        </Link>
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
            <Button type="submit" variant="secondary">
              <LogOut className="size-4" aria-hidden /> Log out
            </Button>
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
              Removes your number, details, bank accounts, purchases, perks and memberships from every business, for good.
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
