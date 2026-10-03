import { Gift } from "lucide-react";
import type { Metadata } from "next";
import { PerksSearch } from "@/components/perks/perks-search";
import { EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getMyMemberships, getMyRewards } from "@/lib/customer";
import { plural } from "@/lib/format";
import { sortBySoonest } from "@/lib/perks";

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
        description={`${plural(rewards.length, "perk")} ready at ${plural(groups.length, "business", "businesses")}. Tap a perk to use it.`}
      />

      {groups.length === 0 ? (
        <EmptyState icon={<Gift className="size-5" />} title="No perks ready yet" description="Keep buying from the businesses you've joined — perks unlock automatically." />
      ) : (
        <PerksSearch
          groups={groups.map(({ membership, rewards: list }) => ({
            id: membership.id,
            name: membership.business.name,
            slug: membership.business.slug,
            logoUrl: membership.business.logo_url,
            color: membership.business.brand_color,
            categories: membership.business.categories ?? [],
            perks: list.map((r) => ({ ...r, businessName: membership.business.name })),
          }))}
        />
      )}
    </div>
  );
}
