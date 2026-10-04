import { ChevronRight, Store, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PartnerOffers } from "@/components/perks/partner-offers";
import { BusinessAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState, SectionTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ShareLinkBar, WhatsAppIcon } from "@/components/ui/share-actions";
import { requireUser } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { getMyMemberships, getMyPartnerPerks, getMyRewards } from "@/lib/customer";
import { businessTagline, whatsappLink } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Plugs" };

export default async function PlugsPage() {
  const user = await requireUser("/me/plugs");
  const [memberships, rewards, allPartnerPerks, inviteCode] = await Promise.all([
    getMyMemberships(user.id),
    getMyRewards(user.id),
    getMyPartnerPerks(),
    // Your own code on the invite link: a business that signs up from it adds you as a customer.
    createClient()
      .then((s) => s.rpc("my_invite_code"))
      .then((r) => (typeof r.data === "string" ? r.data : null)),
  ]);
  const memberSlugs = new Set(memberships.map((m) => m.business.slug));
  const partnerPerks = allPartnerPerks.filter((r) => !memberSlugs.has(r.partner_slug));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-7">
      <PageHeader title="Plugs" description="The businesses you've joined. Open one to see its perks." />

      <section aria-labelledby="invite-plugs" className="flex flex-col gap-2">
        <h2 id="invite-plugs" className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">
          <UserPlus className="size-4 text-brand-700" aria-hidden /> Invite more plugs
        </h2>
        <ShareLinkBar url={`${siteUrl()}/plug${inviteCode ? `?by=${inviteCode}` : ""}`} message="I'd love to follow your business on Spendbox, so I see your new products and perks. Sign up from this link and I'm added as your first customer:" />
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title={memberships.length ? `Your plugs (${memberships.length})` : "Your plugs"} />
        {memberships.length === 0 ? (
          <EmptyState
            icon={<Store className="size-6" aria-hidden />}
            title="No plugs yet"
            description="Send your favourite businesses the invite link above. When they join Spendbox, they become your plug straight away, and you see their products and perks."
          />
        ) : (
          <Card className="divide-y divide-line">
            {memberships.map((m) => {
              const b = m.business;
              const perksReady = rewards.filter((r) => r.membership_id === m.id).length;
              return (
                <div key={m.id} className="flex items-center gap-3 p-4">
                  <Link href={`/me/b/${b.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <BusinessAvatar name={b.name} color={b.brand_color} logoUrl={b.logo_url} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold">{b.name}</span>
                        {perksReady > 0 && <Badge tone="solid">{perksReady === 1 ? "Perk ready" : `${perksReady} perks`}</Badge>}
                      </span>
                      <span className="block truncate text-sm text-muted">{businessTagline(b) || "Tap to see more"}</span>
                    </span>
                  </Link>
                  {b.whatsapp && (
                    <a href={whatsappLink(b.whatsapp)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${b.name}`} className={buttonClass({ variant: "soft", size: "sm" })}>
                      <WhatsAppIcon className="size-4" />
                    </a>
                  )}
                  <Link href={`/me/b/${b.slug}`} aria-label={`Open ${b.name}`} className="text-muted">
                    <ChevronRight className="size-5" aria-hidden />
                  </Link>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {partnerPerks.length > 0 && (
        <PartnerOffers
          rows={partnerPerks}
          memberSlugs={memberSlugs}
          title="Plugs your plugs recommend"
          description="Businesses that partner with yours, and what they offer new customers."
        />
      )}
    </div>
  );
}
