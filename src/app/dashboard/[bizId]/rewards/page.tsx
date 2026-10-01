import { Gift, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RewardButton } from "@/components/business/reward-button";
import { PerkIcon } from "@/components/perks/perk-card";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { getRewards } from "@/lib/business";
import { cn } from "@/lib/cn";
import { formatDate, memberLabel, memberNo } from "@/lib/format";
import { PERK_KINDS } from "@/lib/perks";

export const metadata: Metadata = { title: "Perks to give" };

export default async function RewardsPage({ params, searchParams }: PageProps<"/dashboard/[bizId]/rewards">) {
  const [{ bizId }, { q, show }] = await Promise.all([params, searchParams]);
  await requireOwnedBusiness(bizId);
  const showGiven = show === "given";
  const all = await getRewards(bizId, { status: showGiven ? "redeemed" : "available" });

  const query = typeof q === "string" ? q.trim().replace(/^#/, "").toLowerCase() : "";
  const rewards = query
    ? all.filter(
        (r) =>
          String(r.member_no) === query.replace(/^0+/, "") ||
          (r.member_name ?? "").toLowerCase().includes(query),
      )
    : all;

  const base = `/dashboard/${bizId}/rewards`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: `/dashboard/${bizId}/perks`, label: "Perks" }}
        title="Perks to give"
        description="When a customer shows their pass, find them by member number and mark the perk as given."
      />

      <form action={base} className="flex gap-2" role="search">
        {showGiven && <input type="hidden" name="show" value="given" />}
        <label className="relative flex-1">
          <span className="sr-only">Member number or name</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            name="q"
            defaultValue={typeof q === "string" ? q : ""}
            inputMode="search"
            placeholder="Member number, e.g. 412"
            className="h-12 w-full rounded-2xl border border-line-strong bg-white pr-4 pl-11 text-[15px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
          />
        </label>
        <Button type="submit" size="lg" className="h-12">
          Find
        </Button>
      </form>

      <nav aria-label="Show" className="flex gap-2">
        {[
          { label: "To give", href: base, active: !showGiven },
          { label: "Given", href: `${base}?show=given`, active: showGiven },
        ].map((t) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center rounded-full px-4 text-sm font-semibold ring-1",
              t.active ? "bg-ink text-white ring-ink" : "bg-white text-ink-2 ring-line hover:bg-canvas",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rewards.length === 0 ? (
        <EmptyState
          icon={<Gift className="size-5" />}
          title={query ? `No perks for “${q}”` : showGiven ? "No perks given yet" : "No perks waiting"}
          description={query ? "Check the member number on the customer's pass." : "When customers earn perks, they'll show here."}
        />
      ) : (
        <Card className="px-5">
          <ul className="divide-y divide-line">
            {rewards.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-4">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ background: PERK_KINDS[r.kind].color }}
                >
                  <PerkIcon kind={r.kind} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{r.title}</p>
                  <p className="truncate text-sm text-muted">
                    <Link href={`/dashboard/${bizId}/customers/${r.membership_id}`} className="font-semibold text-ink-2 hover:underline">
                      {memberLabel(r.member_no, r.member_name)}
                    </Link>
                    {r.member_name ? ` · ${memberNo(r.member_no)}` : ""} ·{" "}
                    {showGiven && r.redeemed_at ? `given ${formatDate(r.redeemed_at)}` : `earned ${formatDate(r.issued_at)}`}
                    {!showGiven && r.expires_at ? ` · until ${formatDate(r.expires_at)}` : ""}
                  </p>
                </div>
                <RewardButton bizId={bizId} rewardId={r.id} given={showGiven} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
