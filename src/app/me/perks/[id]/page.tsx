import { ArrowLeft, CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveClock } from "@/components/perks/live-clock";
import { PerkIcon } from "@/components/perks/perk-card";
import { BusinessAvatar } from "@/components/ui/avatar";
import { requireUser } from "@/lib/auth";
import { getMyMemberships, getMyRewards } from "@/lib/customer";
import { appTimeZone } from "@/lib/env";
import { formatDate, memberNo } from "@/lib/format";
import { PERK_KINDS } from "@/lib/perks";

export const metadata: Metadata = { title: "Your perk" };

/**
 * One perk, full screen, to show at the counter. It wears the perk's own
 * colour (the same as its card everywhere else), whatever the business's colour.
 */
export default async function PerkPage({ params }: PageProps<"/me/perks/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/me/perks/${id}`);
  const [rewards, memberships] = await Promise.all([getMyRewards(user.id), getMyMemberships(user.id)]);
  const reward = rewards.find((r) => r.id === id);
  const membership = reward && memberships.find((m) => m.id === reward.membership_id);
  if (!reward || !membership) notFound();
  const b = membership.business;
  const kind = PERK_KINDS[reward.kind];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5">
      <Link
        href="/me/perks"
        className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Your perks
      </Link>

      <article
        className="relative isolate flex flex-col gap-7 overflow-hidden rounded-4xl p-6 text-white shadow-lift sm:p-7"
        style={{ background: kind.color }}
        aria-label={`${reward.title} at ${b.name}`}
      >
        <div aria-hidden className="absolute -top-20 -right-16 -z-10 size-64 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-28 -left-12 -z-10 size-64 rounded-full bg-black/10" />

        <div className="flex items-center gap-3">
          <BusinessAvatar name={b.name} color={b.brand_color} logoUrl={b.logo_url} size="sm" className="ring-2 ring-white/30" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{b.name}</p>
            <p className="text-sm text-white/85">Member {memberNo(membership.member_no)}</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
            <PerkIcon kind={reward.kind} className="size-3.5" /> {kind.label}
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-white/85">Your perk</p>
          <h1 className="font-display text-[34px] leading-[1.05] font-extrabold break-words">{reward.title}</h1>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-white/90">
            <CalendarClock className="size-4" aria-hidden />
            {reward.expires_at ? `Use by ${formatDate(reward.expires_at, { withYear: true })}` : "No time limit"}
          </p>
        </div>

        <div className="rounded-3xl bg-black/15 p-4">
          <LiveClock timeZone={appTimeZone()} />
        </div>
      </article>

      <p className="text-center text-sm text-muted">
        Show this screen at {b.name}. The clock moves, so a screenshot won&apos;t work. They&apos;ll mark it as used with
        your member number.
      </p>
    </div>
  );
}
