import { Mail, MapPin, PartyPopper, ShieldCheck, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PartnerOffers } from "@/components/perks/partner-offers";
import { PerkIcon } from "@/components/perks/perk-card";
import { ReadyPerks } from "@/components/perks/ready-perks";
import { BusinessAvatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { ShareLink, WhatsAppIcon } from "@/components/ui/share-actions";
import { ActionSwitch } from "@/components/ui/switch";
import { requireUser } from "@/lib/auth";
import { getMyMemberships, getMyPartnerPerks, getMyRewards } from "@/lib/customer";
import { siteUrl } from "@/lib/env";
import { businessTagline, formatMonthYear, memberNo, whatsappLink } from "@/lib/format";
import { durationSentence, PERK_KINDS, perkTrigger, SIMPLE_PERK_KINDS, sortBySoonest } from "@/lib/perks";
import { createClient } from "@/lib/supabase/server";
import type { ReferralRow } from "@/lib/types";
import { leaveBusiness, setSharing } from "../../actions";
import { LeaveButton } from "./leave-button";

export const metadata: Metadata = { title: "Plug" };

export default async function PlugPage({ params, searchParams }: PageProps<"/me/b/[slug]">) {
  const [{ slug }, { welcome }] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/me/b/${slug}`);
  const [memberships, rewards, allPartnerPerks] = await Promise.all([getMyMemberships(user.id), getMyRewards(user.id), getMyPartnerPerks()]);
  const membership = memberships.find((m) => m.business.slug === slug);
  if (!membership) notFound();
  const b = membership.business;
  const perks = b.perks.filter((p) => SIMPLE_PERK_KINDS.includes(p.kind));
  const ready = sortBySoonest(rewards.filter((r) => r.membership_id === membership.id)).map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    expires_at: r.expires_at,
    businessName: b.name,
  }));
  const referralPerk = perks.find((p) => p.kind === "referral");
  const welcomePerk = perks.find((p) => p.kind === "welcome");

  const supabase = await createClient();
  const { data: referralData } = await supabase.rpc("my_referrals", { p_membership_id: membership.id });
  const partnerPerks = allPartnerPerks.filter((r) => r.via_business_id === b.id);
  const friends = ((referralData ?? []) as ReferralRow[]).length;
  const memberSlugs = new Set(memberships.map((m) => m.business.slug));
  const inviteUrl = `${siteUrl()}/j/${b.slug}?ref=${membership.ref_code}`;
  const inviteMessage = welcomePerk ? `Join ${b.name} on Spendbox and get ${welcomePerk.title.toLowerCase()}:` : `${b.name} is my plug. Join them on Spendbox:`;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-7">
      <Link href="/me/plugs" className="-mb-3 -ml-1 inline-flex w-fit items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-muted hover:text-ink">
        ← Plugs
      </Link>

      {welcome && (
        <div className="flex animate-fade-up items-start gap-4 rounded-3xl bg-brand-50 p-5 ring-1 ring-brand-100">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-700">
            <PartyPopper className="size-5" aria-hidden />
          </div>
          <div>
            <p className="font-display text-lg font-bold">You&apos;re in!</p>
            <p className="text-sm text-ink-2">
              {b.name} is now one of your plugs. Next time you need something, post a request and they&apos;ll see it.
            </p>
            <Link href="/me/new" className={buttonClass({ size: "sm" }, "mt-3")}>
              Post a request
            </Link>
          </div>
        </div>
      )}

      {/* Header */}
      <section className="relative isolate overflow-hidden rounded-4xl p-6 text-white shadow-lift sm:p-7" style={{ background: b.brand_color }}>
        <div aria-hidden className="absolute -top-16 -right-16 -z-10 size-56 rounded-full bg-white/10" />
        <div className="flex items-center gap-4">
          <BusinessAvatar name={b.name} color="rgba(255,255,255,0.18)" logoUrl={b.logo_url} size="lg" />
          <div className="min-w-0">
            <h1 className="font-display text-3xl leading-tight font-bold tracking-tight">{b.name}</h1>
            {businessTagline(b) && <p className="mt-1 text-sm text-white/90">{businessTagline(b)}</p>}
          </div>
        </div>
        {b.about && <p className="mt-4 max-w-prose text-[15px] text-white/90">{b.about}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          {b.whatsapp && (
            <a href={whatsappLink(b.whatsapp)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 font-semibold text-ink">
              <WhatsAppIcon className="size-4" /> WhatsApp
            </a>
          )}
          {b.email && (
            <a href={`mailto:${b.email}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white/15 px-4 font-semibold text-white ring-1 ring-white/30">
              <Mail className="size-4" aria-hidden /> Email
            </a>
          )}
          {b.location && (
            <span className="inline-flex h-11 items-center gap-2 rounded-xl px-2 text-sm text-white/90">
              <MapPin className="size-4" aria-hidden /> {b.location}
            </span>
          )}
        </div>
        <p className="mt-4 text-xs text-white/75">
          {memberNo(membership.member_no)} · joined {formatMonthYear(membership.joined_at)}
        </p>
      </section>

      {ready.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle title="Ready for you" description="Show it when you visit." />
          <ReadyPerks perks={ready} />
        </section>
      )}

      {perks.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle title="Perks here" />
          <Card className="divide-y divide-line">
            {perks.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: PERK_KINDS[p.kind].color }}>
                  <PerkIcon kind={p.kind} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words">{p.title}</p>
                  <p className="text-sm text-muted">
                    {perkTrigger(p.kind, p.threshold, b.currency, "customer")} · {durationSentence(p.valid_days ?? null, "customer")}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle
          title="Bring a friend"
          description={
            referralPerk && welcomePerk
              ? `Your friend gets “${welcomePerk.title}” when they join with your link, and you get “${referralPerk.title}” for every friend who does.`
              : welcomePerk
                ? `Your friend gets “${welcomePerk.title}” when they join with your link.`
                : `Share ${b.name} with friends who'd love them.`
          }
        />
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-800">
              <UserPlus className="size-5" aria-hidden />
            </span>
            <p className="text-sm text-muted">
              {friends === 0 ? "No friends have joined with your link yet." : friends === 1 ? "1 friend joined with your link." : `${friends} friends joined with your link.`}
            </p>
          </div>
          <ShareLink url={inviteUrl} message={inviteMessage} title={`Join ${b.name}`} />
        </Card>
      </section>

      {partnerPerks.length > 0 && (
        <PartnerOffers rows={partnerPerks} memberSlugs={memberSlugs} title={`${b.name} recommends`} description="Businesses they partner with." />
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle title="Privacy" />
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Share my details with {b.name}</p>
              <p className="text-sm text-muted">Your name, phone, email and birthday on their customer list. Your requests always show the contact you choose.</p>
            </div>
            <ActionSwitch initial={membership.share_details} label={`Share my details with ${b.name}`} action={setSharing.bind(null, membership.id)} />
          </div>
          <div className="border-t border-line pt-4">
            <LeaveButton businessName={b.name} action={leaveBusiness.bind(null, membership.id)} />
          </div>
        </Card>
      </section>
    </div>
  );
}
