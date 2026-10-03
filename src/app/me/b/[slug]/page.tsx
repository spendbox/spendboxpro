import { PartyPopper, ShieldCheck, Ticket, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PerkIcon } from "@/components/perks/perk-card";
import { ReadyPerks } from "@/components/perks/ready-perks";
import { ShareButton } from "@/components/ui/share-button";
import { cn } from "@/lib/cn";
import { PurchaseList } from "@/components/purchases/purchase-list";
import { BusinessAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ShareLink, WhatsAppIcon } from "@/components/ui/share-actions";
import { ActionSwitch } from "@/components/ui/switch";
import { requireUser } from "@/lib/auth";
import { getMyMemberships, getMyProfile, getMyPurchases, getMyRewards, getPartnerPerks, getPayAccounts } from "@/lib/customer";
import { PayAccounts } from "@/components/perks/pay-accounts";
import { PartnerOffers } from "@/components/perks/partner-offers";
import { receiptsEnabled, siteUrl } from "@/lib/env";
import { formatDate, formatMonthYear, memberNo, whatsappLink } from "@/lib/format";
import { durationSentence, PERK_KINDS, perkProgress, perkTrigger, sortBySoonest } from "@/lib/perks";
import { createClient } from "@/lib/supabase/server";
import type { ReferralRow } from "@/lib/types";
import { leaveBusiness, setSharing } from "../../actions";
import { LeaveButton } from "./leave-button";

export const metadata: Metadata = { title: "Business" };

export default async function MemberBusinessPage({ params, searchParams }: PageProps<"/me/b/[slug]">) {
  const [{ slug }, { welcome, tab: tabParam }] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/me/b/${slug}`);
  const [memberships, rewards, purchases, profile] = await Promise.all([
    getMyMemberships(user.id),
    getMyRewards(user.id),
    getMyPurchases(user.id),
    getMyProfile(user.id),
  ]);
  const membership = memberships.find((m) => m.business.slug === slug);
  if (!membership) notFound();

  const b = membership.business;
  const myRewards = rewards.filter((r) => r.membership_id === membership.id);
  const myPurchases = purchases.filter((p) => p.membership_id === membership.id);
  const progress = perkProgress(
    b.perks,
    myPurchases.filter((p) => p.status === "verified"),
    b.currency,
  );
  const referralPerk = b.perks.find((p) => p.kind === "referral");
  const welcomePerk = b.perks.find((p) => p.kind === "welcome");

  const supabase = await createClient();
  const [{ data: referralData }, partnerPerks, payAccounts] = await Promise.all([
    supabase.rpc("my_referrals", { p_membership_id: membership.id }),
    getPartnerPerks([b.id]),
    getPayAccounts(b.id),
  ]);
  const referrals = (referralData ?? []) as ReferralRow[];

  const tabs = [
    { key: "home", label: "Home" },
    { key: "perks", label: "Perks" },
    ...(partnerPerks.length ? [{ key: "partners", label: "Partners" }] : []),
    { key: "settings", label: "Settings" },
  ];
  const tab = tabs.some((t) => t.key === tabParam) ? (tabParam as string) : "home";

  const inviteUrl = `${siteUrl()}/j/${b.slug}?ref=${membership.ref_code}`;
  const inviteMessage = welcomePerk
    ? `Join ${b.name} on Spendbox and get ${welcomePerk.title.toLowerCase()}:`
    : `Join ${b.name} on Spendbox:`;

  return (
    <div className="flex flex-col gap-8">
      {welcome && (
        <div className="flex animate-fade-up items-start gap-4 rounded-3xl bg-brand-50 p-5 ring-1 ring-brand-100">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-700">
            <PartyPopper className="size-5" aria-hidden />
          </div>
          <div>
            <p className="font-display text-lg font-bold text-brand-900">You&apos;re in! Welcome to {b.name}.</p>
            <p className="mt-0.5 text-sm text-brand-900/90">
              {myRewards.some((r) => r.kind === "welcome")
                ? "Your welcome perk is ready. Tap it below on your first order."
                : receiptsEnabled()
                  ? "Upload your receipts after you pay, and perks unlock automatically."
                  : "Every purchase here counts toward your perks, and they unlock automatically."}
              {!profile?.full_name && (
                <>
                  {" "}
                  <Link href="/me/profile" className="font-semibold underline underline-offset-2">
                    Add your name and birthday
                  </Link>{" "}
                  for birthday treats.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Business header */}
      <section
        className="relative isolate overflow-hidden rounded-4xl p-5 text-white sm:p-7"
        style={{ background: b.brand_color }}
      >
        <div aria-hidden className="absolute -top-20 -right-16 -z-10 size-64 rounded-full bg-white/10" />
        <div className="flex items-center gap-4">
          <BusinessAvatar name={b.name} color="rgba(255,255,255,0.18)" logoUrl={b.logo_url} size="lg" />
          <div className="min-w-0">
            <h1 className="font-display text-2xl leading-tight font-bold tracking-tight sm:text-3xl">{b.name}</h1>
            <p className="mt-0.5 text-sm text-white/90">
              Member {memberNo(membership.member_no)} · since {formatMonthYear(membership.joined_at)}
            </p>
          </div>
        </div>
        {b.about && <p className="mt-4 max-w-prose text-[15px] text-white/90">{b.about}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/me/b/${b.slug}/pass`}
            className={buttonClass({ variant: "secondary" }, "text-ink ring-0")}
          >
            <Ticket className="size-4" aria-hidden /> Member card
          </Link>
          <ShareButton
            variant="light"
            label="Share"
            url={inviteUrl}
            message={inviteMessage}
            title={`Share ${b.name}`}
            description={referralPerk ? `You earn your perk when a friend who is new to ${b.name} makes their first purchase.` : undefined}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-canvas p-3.5">
                <p className="text-xs font-semibold text-muted uppercase">Your friend gets</p>
                <p className="mt-1 font-semibold text-ink">{welcomePerk?.title ?? `${b.name} member perks`}</p>
              </div>
              <div className="rounded-2xl bg-violet-50 p-3.5">
                <p className="text-xs font-semibold text-violet-900 uppercase">You get</p>
                <p className="mt-1 font-semibold text-violet-950">{referralPerk ? referralPerk.title : "Their thanks"}</p>
              </div>
            </div>
          </ShareButton>
          {b.whatsapp && (
            <a
              href={whatsappLink(b.whatsapp, `Hi ${b.name}, I'd like to order. (Spendbox member ${memberNo(membership.member_no)})`)}
              target="_blank"
              rel="noreferrer"
              className={buttonClass({ variant: "light" })}
            >
              <WhatsAppIcon className="size-4" /> Order on WhatsApp
            </a>
          )}
        </div>
      </section>

      <nav aria-label={`${b.name} sections`} className="-mx-4 -mt-3 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "home" ? `/me/b/${b.slug}` : `/me/b/${b.slug}?tab=${t.key}`}
            scroll={false}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "relative flex h-12 shrink-0 items-center px-4 text-[15px] font-semibold transition-colors",
              tab === t.key ? "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-ink" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "home" && (
        <div className="flex flex-col gap-8">
          <PayAccounts accounts={payAccounts} businessName={b.name} />
          {myRewards.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionTitle title={`Ready to use · ${myRewards.length}`} description="Tap a perk to show it at the counter." />
              <ReadyPerks perks={sortBySoonest(myRewards).map((r) => ({ ...r, businessName: b.name }))} limit={4} moreHref="/me/perks" />
            </section>
          )}
          {progress.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionTitle title="Your progress" />
              <Card className="flex flex-col divide-y divide-line px-5">
                {progress.map((p) => (
                  <div key={p.perk.id} className="flex flex-col gap-2.5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-ink">{p.perk.title}</p>
                      <p className="shrink-0 text-sm font-semibold text-muted tabular">{p.label}</p>
                    </div>
                    <Progress current={p.current} target={p.target} color={PERK_KINDS[p.perk.kind].color} label={`${p.label} toward ${p.perk.title}`} />
                    <p className="text-sm text-muted">{p.remainingLabel} to go</p>
                  </div>
                ))}
              </Card>
            </section>
          )}
          <section className="flex flex-col gap-3">
            <SectionTitle
              title="Your purchases"
              description={
                receiptsEnabled()
                  ? "Upload a receipt after you pay and it counts here."
                  : "Every transfer and every purchase they record shows up here."
              }
            />
            <Card className="p-5">
              {myPurchases.length === 0 ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-muted">No purchases yet.</p>
                  {receiptsEnabled() && (
                    <Link href="/me/receipts" className={buttonClass({ variant: "soft", size: "sm" })}>
                      Add a receipt
                    </Link>
                  )}
                </div>
              ) : (
                <PurchaseList purchases={myPurchases} />
              )}
            </Card>
          </section>
        </div>
      )}

      {tab === "perks" && (
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <SectionTitle title="Member perks" />
            {b.perks.length === 0 ? (
              <p className="text-muted">{b.name} hasn&apos;t added perks yet. Your purchases still count.</p>
            ) : (
              <Card className="divide-y divide-line px-5">
                {b.perks.map((perk) => (
                  <div key={perk.id} className="flex items-center gap-3 py-3.5">
                    <div
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ background: PERK_KINDS[perk.kind].color }}
                    >
                      <PerkIcon kind={perk.kind} className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{perk.title}</p>
                      <p className="text-sm text-muted">
                        {perkTrigger(perk.kind, perk.threshold, b.currency, "customer")}
                        {perk.details ? ` · ${perk.details}` : ""}
                        {perk.valid_days ? ` · ${durationSentence(perk.valid_days, "customer").toLowerCase()}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <SectionTitle
              title="Invite friends"
              description={referralPerk ? `Earn “${referralPerk.title}” when a friend you invite makes their first purchase.` : `Share ${b.name} with friends who'd love it.`}
            />
            <Card className="flex flex-col gap-4 p-5">
              <ShareLink url={inviteUrl} message={inviteMessage} title={`Join ${b.name}`} />
              {referrals.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-line pt-4">
                  <p className="text-sm font-semibold text-ink">Friends who joined</p>
                  <ul className="flex flex-col gap-2">
                    {referrals.map((r, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-900">
                          <UserPlus className="size-4" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink">Friend {r.phone_hint}</p>
                          <p className="text-xs text-muted">Joined {formatDate(r.joined_at)}</p>
                        </div>
                        {r.reward_status === "redeemed" ? (
                          <Badge tone="gray">Perk used</Badge>
                        ) : r.has_purchase && r.reward_status === "available" ? (
                          <Badge tone="violet">Perk earned</Badge>
                        ) : r.has_purchase ? (
                          <Badge tone="green">Bought</Badge>
                        ) : (
                          <Badge tone="gray">No order yet</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </section>
        </div>
      )}

      {tab === "partners" && (
        <div className="flex flex-col gap-8">
          <PartnerOffers
            rows={partnerPerks}
            memberSlugs={new Set(memberships.map((m) => m.business.slug))}
            description={`${b.name} teamed up with these businesses. Join them to earn their perks too.`}
          />
        </div>
      )}

      {tab === "settings" && (
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <SectionTitle title="Privacy and membership" />
            <Card className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-ink">Share my details with {b.name}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    Name, phone, gender and birthday. When off, they only see your member number and purchases.
                  </p>
                </div>
                <ActionSwitch
                  initial={membership.share_details}
                  label={`Share my details with ${b.name}`}
                  action={setSharing.bind(null, membership.id)}
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted">
                <ShieldCheck className="size-4 text-brand-600" aria-hidden />
                {membership.share_details ? "Sharing is on." : "Your details are private."}{" "}
                <Link href="/me/profile" className="font-semibold text-brand-700 underline underline-offset-2">
                  Edit details
                </Link>
              </div>
              <div className="border-t border-line pt-4">
                <LeaveButton businessName={b.name} action={leaveBusiness.bind(null, membership.id)} />
              </div>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
