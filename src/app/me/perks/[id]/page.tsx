import { ArrowLeft, CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveClock } from "@/components/perks/live-clock";
import { PerkIcon } from "@/components/perks/perk-card";
import { BusinessAvatar } from "@/components/ui/avatar";
import { requireUser } from "@/lib/auth";
import { ShareButton } from "@/components/ui/share-button";
import { getMyMemberships, getMyProfile, getMyRewards } from "@/lib/customer";
import { appTimeZone, siteUrl } from "@/lib/env";
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
  const [rewards, memberships, profile] = await Promise.all([getMyRewards(user.id), getMyMemberships(user.id), getMyProfile(user.id)]);
  const reward = rewards.find((r) => r.id === id);
  const membership = reward && memberships.find((m) => m.id === reward.membership_id);
  if (!reward || !membership) notFound();
  const b = membership.business;
  const kind = PERK_KINDS[reward.kind];
  const name = profile?.full_name?.trim();
  const shortName = name ? name.split(/\s+/).map((w, i) => (i === 0 ? w : `${w[0]}.`)).join(" ") : null;
  // The business opens this link in its dashboard to see the perk and mark it as given.
  const perkLink = `${siteUrl()}/dashboard/${b.id}/rewards?perk=${reward.id}`;

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
            <p className="truncate text-sm text-white/85">{shortName ? `For ${shortName}` : "For you"}</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
            <PerkIcon kind={reward.kind} className="size-3.5" /> {kind.label}
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-white/85">Your perk from {b.name}</p>
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

      <ShareButton
        variant="primary"
        size="lg"
        className="w-full"
        label={`Share with ${b.name}`}
        url={perkLink}
        message={`Hi ${b.name}, I'd like to use my Spendbox perk: ${reward.title} (member ${memberNo(membership.member_no)}).`}
        title={`Send this perk to ${b.name}`}
        description={`Ordering online or on WhatsApp? Send ${b.name} this link. It opens your perk in their dashboard so they can give it to you.`}
        whatsappTo={b.whatsapp}
        whatsappLabel={b.whatsapp ? `Send to ${b.name} on WhatsApp` : "Share on WhatsApp"}
      />

      <p className="text-center text-sm text-muted">
        In person? Just show this screen at {b.name}. The clock is live, so they can tell it&apos;s really you and not a
        screenshot. Once they&apos;ve given you your perk, they&apos;ll tick it off on their side.
      </p>
    </div>
  );
}
