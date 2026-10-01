import { ChevronRight, Gift } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PerkBoard } from "@/components/business/perk-board";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { getPerks, getStats } from "@/lib/business";
import { plural } from "@/lib/format";

export const metadata: Metadata = { title: "Perks" };

export default async function PerksPage({ params, searchParams }: PageProps<"/dashboard/[bizId]/perks">) {
  const [{ bizId }, { new: startNew }] = await Promise.all([params, searchParams]);
  const { business } = await requireOwnedBusiness(bizId);
  const [perks, stats] = await Promise.all([getPerks(bizId), getStats(bizId)]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Perks"
        description="Each card is a reward customers earn automatically. Switch one off to pause it."
      />

      <Link
        href={`/dashboard/${bizId}/rewards`}
        className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-card ring-1 ring-line transition hover:ring-brand-300 sm:p-5"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-50 text-accent-700">
          <Gift className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Perks to give</span>
          <span className="block text-sm text-muted">
            {stats.rewards_ready ? `${plural(stats.rewards_ready, "perk")} earned and waiting` : "Nothing waiting right now"}
          </span>
        </span>
        <ChevronRight className="size-5 text-muted" aria-hidden />
      </Link>

      <PerkBoard key={String(startNew)} bizId={bizId} perks={perks} currency={business.currency} startPicking={startNew === "1"} />
    </div>
  );
}
