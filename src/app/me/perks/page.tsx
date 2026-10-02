import { Gift, Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PerkIcon } from "@/components/perks/perk-card";
import { TimeLeft } from "@/components/perks/time-left";
import { BusinessAvatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getMyMemberships, getMyRewards } from "@/lib/customer";
import { plural } from "@/lib/format";
import { PERK_KINDS, sortBySoonest } from "@/lib/perks";

export const metadata: Metadata = { title: "Your perks" };

/** Every perk ready to use, grouped by business, soonest to expire first. */
export default async function MyPerksPage() {
  const user = await requireUser("/me/perks");
  const [memberships, rewards] = await Promise.all([getMyMemberships(user.id), getMyRewards(user.id)]);

  const groups = memberships
    .map((m) => ({ membership: m, rewards: sortBySoonest(rewards.filter((r) => r.membership_id === m.id)) }))
    .filter((g) => g.rewards.length > 0)
    .sort((a, b) => {
      const soonest = (g: typeof a) => (g.rewards[0].expires_at ? new Date(g.rewards[0].expires_at).getTime() : Infinity);
      return soonest(a) - soonest(b);
    });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <PageHeader
        back={{ href: "/me", label: "My Spendbox" }}
        title="Your perks"
        description={`${plural(rewards.length, "perk")} ready at ${plural(groups.length, "business", "businesses")}. Ones running out soonest are first.`}
      />

      {groups.length === 0 ? (
        <EmptyState icon={<Gift className="size-5" />} title="No perks ready yet" description="Keep buying from the businesses you've joined — perks unlock automatically." />
      ) : (
        groups.map(({ membership, rewards: list }) => (
          <section key={membership.id} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <BusinessAvatar
                name={membership.business.name}
                color={membership.business.brand_color}
                logoUrl={membership.business.logo_url}
                size="sm"
              />
              <h2 className="min-w-0 flex-1 truncate font-display text-lg font-bold">{membership.business.name}</h2>
              <Link href={`/me/b/${membership.business.slug}/pass`} className={buttonClass({ variant: "soft", size: "sm" })}>
                <Ticket className="size-4" aria-hidden /> Show pass
              </Link>
            </div>
            <Card className="divide-y divide-line px-5">
              {list.map((r) => (
                <div key={r.id} className="flex items-start gap-3 py-4">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{ background: PERK_KINDS[r.kind].color }}
                  >
                    <PerkIcon kind={r.kind} className="size-5" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="font-semibold break-words text-ink">{r.title}</p>
                    <TimeLeft issuedAt={r.issued_at} expiresAt={r.expires_at} tone="dark" />
                  </div>
                </div>
              ))}
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
