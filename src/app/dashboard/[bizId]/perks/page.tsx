import { ChevronRight, Gift, Handshake } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PerkBoard } from "@/components/business/perk-board";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { getPerks, getStats } from "@/lib/business";
import { plural } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Perks" };

export default async function PerksPage({ params, searchParams }: PageProps<"/dashboard/[bizId]/perks">) {
  const [{ bizId }, { new: startNew }] = await Promise.all([params, searchParams]);
  const { business } = await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const [perks, stats, { data: waiting }] = await Promise.all([
    getPerks(bizId),
    getStats(bizId),
    supabase.rpc("partner_requests_waiting", { p_business_id: bizId }),
  ]);
  const requests = Number(waiting ?? 0);
  const card = "flex items-center gap-4 rounded-3xl bg-white p-4 shadow-card ring-1 ring-line transition hover:ring-brand-300 sm:p-5";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Perks"
        description="Each card is a reward customers earn automatically. Switch one off to pause it."
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Link href={`/dashboard/${bizId}/rewards`} className={card}>
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
        <Link href={`/dashboard/${bizId}/partners`} className={card}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <Handshake className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 font-semibold">
              Partners
              {requests > 0 && (
                <span className="rounded-full bg-accent-600 px-2 text-xs leading-5 font-bold text-white">{requests}</span>
              )}
            </span>
            <span className="block text-sm text-muted">
              {requests
                ? `${plural(requests, "partner request")} waiting for you`
                : business.partners_enabled
                  ? "Your perks show to your partners' customers"
                  : "Show your perks to other businesses' customers"}
            </span>
          </span>
          <ChevronRight className="size-5 text-muted" aria-hidden />
        </Link>
      </div>

      <PerkBoard key={String(startNew)} bizId={bizId} perks={perks} currency={business.currency} startPicking={startNew === "1"} />
    </div>
  );
}
