import { Cake, ChevronRight, Gift, Landmark, ScanLine, Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BusinessAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, EmptyState, SectionTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { requireUser } from "@/lib/auth";
import { receiptsEnabled } from "@/lib/env";
import { getMyMemberships, getMyProfile, getMyPurchases, getMyRewards, getMyUsedRewards, getPartnerPerks, hasMyBankAccount } from "@/lib/customer";
import { PerkStats } from "@/components/perks/perk-stats";
import { ShareButton } from "@/components/ui/share-button";
import { siteUrl } from "@/lib/env";
import { PartnerOffers } from "@/components/perks/partner-offers";
import { businessTagline, memberNo, whatsappLink } from "@/lib/format";
import { perkProgress, sortBySoonest } from "@/lib/perks";
import { ReadyPerks } from "@/components/perks/ready-perks";

export const metadata: Metadata = { title: "My Spendbox" };

/** How many ready perks to show here; the rest are on /me/perks. */
const SHOWN = 3;

export default async function MySpendboxPage() {
  const user = await requireUser("/me");
  const [profile, memberships, rewards, purchases, used, hasBank] = await Promise.all([
    getMyProfile(user.id),
    getMyMemberships(user.id),
    getMyRewards(user.id),
    getMyPurchases(user.id),
    getMyUsedRewards(user.id),
    hasMyBankAccount(),
  ]);
  // Partners of my businesses that I haven't joined yet.
  const memberSlugs = new Set(memberships.map((m) => m.business.slug));
  const partnerPerks = (await getPartnerPerks(memberships.map((m) => m.business_id))).filter((r) => !memberSlugs.has(r.partner_slug));

  // Bank names often start with the surname, so greet with the first two words ("Okonkwo Chidinma").
  const name = profile?.full_name?.trim().split(/\s+/).slice(0, 2).join(" ") || null;
  const soonest = sortBySoonest(rewards);
  const businessName = (membershipId: string) => memberships.find((m) => m.id === membershipId)?.business.name ?? "";
  const toReady = (r: (typeof rewards)[number]) => ({ ...r, businessName: businessName(r.membership_id) });
  const nudge = !hasBank
    ? {
        href: "/me/setup?next=/me",
        icon: Landmark,
        title: "Add the bank account you pay from",
        body: "Then your transfers count by themselves, and your name is filled in from your bank.",
      }
    : !profile?.birth_month
      ? { href: "/me/profile", icon: Cake, title: "Add your birthday", body: "Unlock birthday treats. You decide which businesses can see it." }
      : null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] leading-tight font-bold tracking-tight sm:text-4xl">
            {name ? `Hi ${name}` : "Your Spendbox"}
          </h1>
          <p className="mt-1 text-muted">Here&apos;s what your plugs have for you.</p>
        </div>
        {receiptsEnabled() && (
          <ButtonLink href="/me/receipts" className="hidden lg:inline-flex">
            <ScanLine className="size-4" aria-hidden /> Add a receipt
          </ButtonLink>
        )}
      </header>

      {memberships.length > 0 && <PerkStats ready={rewards.length} plugs={memberships.length} used={used.map((u) => ({ ...u, businessName: businessName(u.membership_id) }))} />}

      {nudge && memberships.length > 0 && (
        <Link
          href={nudge.href}
          className="flex items-center gap-4 rounded-3xl bg-accent-50 p-4 ring-1 ring-accent-100 transition hover:bg-accent-100/60 sm:p-5"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-accent-700">
            <nudge.icon className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">{nudge.title}</p>
            <p className="text-sm text-ink-2">{nudge.body}</p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
        </Link>
      )}

      {rewards.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle
            title={`Ready to use · ${rewards.length}`}
            description="Tap a perk to show it at the counter."
          />
          <ReadyPerks
            showBusiness
            limit={SHOWN}
            moreHref="/me/perks"
            perks={soonest.map(toReady)}
          />
        </section>
      )}

      <section id="plugs" className="flex scroll-mt-24 flex-col gap-3">
        <SectionTitle title="My Plugs" description="The businesses you buy from." />
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
                      <Ticket className="size-4" aria-hidden /> Card
                    </Link>
                    <ShareButton
                      size="sm"
                      className="h-10"
                      url={`${siteUrl()}/j/${b.slug}?ref=${m.ref_code}`}
                      message={`I'm a member of ${b.name} on Spendbox. Join with my link for member perks:`}
                      title={`Share ${b.name}`}
                      description="Friends who join with your link are counted as your invites."
                    />
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
