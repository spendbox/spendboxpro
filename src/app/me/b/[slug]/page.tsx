import { Box, LayoutList, Mail, MapPin, PartyPopper, ShieldCheck, ShoppingBag, Store, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PerkIcon } from "@/components/perks/perk-card";
import { ReadyPerks } from "@/components/perks/ready-perks";
import { ProductCircles } from "@/components/products/product-circles";
import { SubTabs } from "@/components/shell/sub-tabs";
import { BusinessAvatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState, SectionTitle } from "@/components/ui/card";
import { ShareLink, WhatsAppIcon } from "@/components/ui/share-actions";
import { ActionSwitch } from "@/components/ui/switch";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { getMyMemberships, getMyRewards, getPlugPartners } from "@/lib/customer";
import { siteUrl } from "@/lib/env";
import { businessTagline, formatMonthYear, memberNo, whatsappLink } from "@/lib/format";
import { durationSentence, PERK_KINDS, perkTrigger, SIMPLE_PERK_KINDS, sortBySoonest } from "@/lib/perks";
import { getShopPerks } from "@/lib/actions/shop";
import { getExplore } from "@/lib/products";
import { readTheme } from "@/lib/store-theme";
import { createClient } from "@/lib/supabase/server";
import type { ReferralRow } from "@/lib/types";
import { leaveBusiness, setSharing } from "../../actions";
import { LeaveButton } from "./leave-button";
import { PlugShop } from "./plug-shop";

type Tab = "products" | "perks" | "partners";

export const metadata: Metadata = { title: "Plug" };

export default async function PlugPage({ params, searchParams }: PageProps<"/me/b/[slug]">) {
  const [{ slug }, { welcome, tab: tabParam, view }] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/me/b/${slug}`);
  const [memberships, rewards, feed] = await Promise.all([getMyMemberships(user.id), getMyRewards(user.id), getExplore(null)]);
  const membership = memberships.find((m) => m.business.slug === slug);
  if (!membership) notFound();
  const b = membership.business;

  const products = feed.filter((p) => p.business_id === b.id);
  const in3d = view === "3d";
  const tab: Tab = tabParam === "perks" || tabParam === "partners" ? tabParam : "products";
  const base = `/me/b/${b.slug}`;
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

  // Partners and referrals together, in one round trip's time.
  const supabase = await createClient();
  const [partners, { data: referralData }, shop] = await Promise.all([
    getPlugPartners(b.id),
    supabase.rpc("my_referrals", { p_membership_id: membership.id }),
    // The 3D shop's hall shows every product, not only the newest in the feed.
    in3d ? getShopPerks(b.slug) : null,
  ]);
  const feedForShop = products.map((p) => ({ id: p.id, title: p.title, price: p.price, currency: p.currency, media_type: p.media_type, media_url: p.media_url, poster_url: p.poster_url, description: p.description, viewed: p.viewed }));
  const shopProducts = shop && shop.products.length > feedForShop.length ? shop.products : feedForShop;
  const friends = ((referralData ?? []) as ReferralRow[]).length;
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

      {/* Regular or 3D */}
      <div role="group" aria-label="View" className="-mb-2 flex w-fit rounded-full bg-black/[0.05] p-1">
        {(
          [
            ["Regular", `${base}${tab === "products" ? "" : `?tab=${tab}`}`, !in3d, LayoutList],
            ["3D shop", `${base}?view=3d`, in3d, Box],
          ] as const
        ).map(([label, href, on, Icon]) => (
          <Link
            key={label}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cn("flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold", on ? "bg-white text-ink shadow-card" : "text-ink-2 hover:text-ink")}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </Link>
        ))}
      </div>

      {in3d ? (
        <PlugShop
          business={{
            id: b.id,
            slug: b.slug,
            name: b.name,
            categories: b.categories ?? [],
            location: b.location,
            about: b.about,
            logo_url: b.logo_url,
            brand_color: b.brand_color,
            whatsapp: b.whatsapp,
            email: b.email,
            is_member: true,
          }}
          theme={readTheme(b.store_theme)}
          products={shopProducts}
          perks={perks.map((p) => ({ id: p.id, kind: p.kind, title: p.title, details: p.details, threshold: p.threshold, valid_days: p.valid_days ?? null }))}
          currency={b.currency}
          partners={partners}
          shareUrl={`${siteUrl()}/s/${b.slug}`}
        />
      ) : (
        <>
          {ready.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionTitle title="Ready for you" description="Show it when you visit." />
              <ReadyPerks perks={ready} />
            </section>
          )}

          <SubTabs
            label={b.name}
            tabs={[
              { href: base, label: "Products", count: products.length, active: tab === "products" },
              { href: `${base}?tab=perks`, label: "Perks", count: perks.length, active: tab === "perks" },
              { href: `${base}?tab=partners`, label: "Partners", count: partners.length, active: tab === "partners" },
            ]}
          />

          {tab === "products" &&
            (products.length ? (
              <section aria-label={`${b.name} products`}>
                <ProductCircles products={products} hrefFor={(p) => `/me/p/${p.id}?b=${b.id}&from=plug`} />
              </section>
            ) : (
              <EmptyState icon={<ShoppingBag className="size-6" aria-hidden />} title="No products yet" description={`When ${b.name} posts products and services, they show up here.`} />
            ))}

          {tab === "perks" && (
            <>
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
            </>
          )}

          {tab === "partners" &&
            (partners.length ? (
              <section className="flex flex-col gap-3">
                <SectionTitle title={`${b.name} recommends`} description="Businesses they partner with. Walk into their 3D shops, or join." />
                <Card className="divide-y divide-line">
                  {partners.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 p-4">
                      <BusinessAvatar name={p.name} color={p.brand_color} logoUrl={p.logo_url} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{p.name}</p>
                        <p className="truncate text-sm text-muted">
                          {p.welcome ? `Join and get ${p.welcome.toLowerCase()}` : p.categories.slice(0, 2).join(" · ") || "On Spendbox"}
                        </p>
                      </div>
                      <Link href={`/s/${p.slug}`} aria-label={`Walk into ${p.name}'s shop`} className={buttonClass({ variant: "soft", size: "sm" })}>
                        <Store className="size-4" aria-hidden /> Shop
                      </Link>
                      <Link href={p.is_member ? `/me/b/${p.slug}` : `/j/${p.slug}`} className={buttonClass({ size: "sm" })}>
                        {p.is_member ? "Open" : "Join"}
                      </Link>
                    </div>
                  ))}
                </Card>
              </section>
            ) : (
              <EmptyState icon={<Store className="size-6" aria-hidden />} title="No partners yet" description={`When ${b.name} teams up with other businesses, you'll find them here.`} />
            ))}
        </>
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
