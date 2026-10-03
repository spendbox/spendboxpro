import { Cake, ChevronRight, Gift, ScanLine, Share2, Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PerkIcon } from "@/components/perks/perk-card";
import { BusinessAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, EmptyState, SectionTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { requireUser } from "@/lib/auth";
import { receiptsEnabled } from "@/lib/env";
import { getMyMemberships, getMyProfile, getMyPurchases, getMyRewards, getPartnerPerks } from "@/lib/customer";
import { PartnerOffers } from "@/components/perks/partner-offers";
import { businessTagline, firstName, memberNo, plural, whatsappLink } from "@/lib/format";
import { PERK_KINDS, perkProgress, sortBySoonest } from "@/lib/perks";
import { TimeLeft } from "@/components/perks/time-left";

export const metadata: Metadata = { title: "My Spendbox" };

/** How many ready perks to show here; the rest are on /me/perks. */
const SHOWN = 3;

export default async function MySpendboxPage() {
  const user = await requireUser("/me");
  const [profile, memberships, rewards, purchases] = await Promise.all([
    getMyProfile(user.id),
    getMyMemberships(user.id),
    getMyRewards(user.id),
    getMyPurchases(user.id),
  ]);
  // Partners of my businesses that I haven't joined yet.
  const memberSlugs = new Set(memberships.map((m) => m.business.slug));
  const partnerPerks = (await getPartnerPerks(memberships.map((m) => m.business_id))).filter((r) => !memberSlugs.has(r.partner_slug));

  const name = firstName(profile?.full_name);
  const soonest = sortBySoonest(rewards).slice(0, SHOWN);
  const missingDetails = !profile?.full_name || !profile?.birth_month;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] leading-tight font-bold tracking-tight sm:text-4xl">
            {name ? `Hi ${name}` : "Your Spendbox"}
          </h1>
          <p className="mt-1 text-muted">
            {plural(memberships.length, "business", "businesses")}
            {rewards.length > 0 && ` · ${plural(rewards.length, "perk")} ready`}
          </p>
        </div>
        {receiptsEnabled() && (
          <ButtonLink href="/me/receipts" className="hidden lg:inline-flex">
            <ScanLine className="size-4" aria-hidden /> Add a receipt
          </ButtonLink>
        )}
      </header>

      {missingDetails && memberships.length > 0 && (
        <Link
          href="/me/profile"
          className="flex items-center gap-4 rounded-3xl bg-accent-50 p-4 ring-1 ring-accent-100 transition hover:bg-accent-100/60 sm:p-5"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-accent-700">
            <Cake className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Add your name and birthday</p>
            <p className="text-sm text-ink-2">Unlock birthday treats. You decide which businesses can see them.</p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
        </Link>
      )}

      {rewards.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle
            title="Ready to use"
            description="Show your pass at the counter on your next order."
            action={
              rewards.length > SHOWN ? (
                <Link href="/me/perks" className="text-sm font-semibold text-brand-700 hover:underline">
                  See all {rewards.length}
                </Link>
              ) : undefined
            }
          />
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-3">
            {soonest.map((reward) => {
              const membership = memberships.find((m) => m.id === reward.membership_id);
              if (!membership) return null;
              const info = PERK_KINDS[reward.kind];
              return (
                <Link
                  key={reward.id}
                  href={`/me/b/${membership.business.slug}/pass`}
                  className="flex w-[80%] shrink-0 snap-start flex-col justify-between gap-5 rounded-3xl p-5 text-white shadow-card transition hover:brightness-110 sm:w-auto"
                  style={{ background: info.color }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-white/90">{membership.business.name}</span>
                    <PerkIcon kind={reward.kind} className="size-5 shrink-0" />
                  </div>
                  <p className="font-display text-xl leading-tight font-bold">{reward.title}</p>
                  <div className="flex flex-col gap-3">
                    <TimeLeft issuedAt={reward.issued_at} expiresAt={reward.expires_at} />
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                      <Ticket className="size-4" aria-hidden /> Show pass
                    </span>
                  </div>
                </Link>
              );
            })}
            {rewards.length > SHOWN && (
              <Link
                href="/me/perks"
                className="flex w-[60%] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line-strong bg-white p-5 text-center hover:border-brand-300 sm:w-auto"
              >
                <span className="font-display text-3xl font-bold text-ink">+{rewards.length - SHOWN}</span>
                <span className="text-sm font-semibold text-brand-700">See all your perks</span>
              </Link>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle title="Your businesses" />
        {memberships.length === 0 ? (
          <EmptyState
            icon={<Gift className="size-5" />}
            title="Your Spendbox is empty"
            description="Spendbox is invite-only. Ask a business you buy from for their Spendbox link to join."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {memberships.map((m) => {
              const b = m.business;
              const ready = rewards.filter((r) => r.membership_id === m.id).length;
              const verified = purchases.filter((p) => p.membership_id === m.id && p.status === "verified");
              const progress = perkProgress(b.perks, verified, b.currency)[0];
              return (
                <Card key={m.id} className="flex flex-col gap-4 p-4 sm:p-5">
                  <Link href={`/me/b/${b.slug}`} className="flex items-center gap-3">
                    <BusinessAvatar name={b.name} color={b.brand_color} logoUrl={b.logo_url} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-ink">{b.name}</p>
                      <p className="truncate text-sm text-muted">
                        {businessTagline(b) || `Member ${memberNo(m.member_no)}`}
                      </p>
                    </div>
                    {ready > 0 ? (
                      <Badge tone="solid">{ready === 1 ? "Perk ready" : `${ready} perks`}</Badge>
                    ) : (
                      <ChevronRight className="size-5 text-muted" aria-hidden />
                    )}
                  </Link>

                  {progress ? (
                    <div className="flex flex-col gap-2">
                      <Progress
                        current={progress.current}
                        target={progress.target}
                        color={b.brand_color}
                        label={`${progress.label} toward ${progress.perk.title}`}
                      />
                      <p className="text-sm text-muted">
                        <span className="font-semibold text-ink-2">{progress.label}</span> · {progress.perk.title}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">Member {memberNo(m.member_no)}</p>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <Link href={`/me/b/${b.slug}/pass`} className={buttonClass({ variant: "soft", size: "sm" }, "h-10")}>
                      <Ticket className="size-4" aria-hidden /> Pass
                    </Link>
                    <Link href={`/me/b/${b.slug}#invite`} className={buttonClass({ variant: "secondary", size: "sm" }, "h-10")}>
                      <Share2 className="size-4" aria-hidden /> Share
                    </Link>
                    {b.whatsapp ? (
                      <a
                        href={whatsappLink(b.whatsapp, `Hi ${b.name}, I'd like to order. (Spendbox member ${memberNo(m.member_no)})`)}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonClass({ variant: "secondary", size: "sm" }, "h-10")}
                      >
                        <WhatsAppIcon className="size-4 text-[#107A42]" /> Order
                      </a>
                    ) : (
                      <Link href={`/me/b/${b.slug}`} className={buttonClass({ variant: "secondary", size: "sm" }, "h-10")}>
                        Details
                      </Link>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <PartnerOffers
        rows={partnerPerks}
        memberSlugs={memberSlugs}
        title="Offers from partners"
        description="Businesses that team up with ones you've joined."
        viaNames={Object.fromEntries(memberships.map((m) => [m.business_id, m.business.name]))}
        limit={4}
      />
    </div>
  );
}
