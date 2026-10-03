import { ArrowRight, Handshake } from "lucide-react";
import Link from "next/link";
import { PerkIcon } from "@/components/perks/perk-card";
import { BusinessAvatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { businessTagline } from "@/lib/format";
import { durationSentence, PERK_KINDS, perkTrigger } from "@/lib/perks";
import type { PartnerPerkRow } from "@/lib/types";

/**
 * "From our partners": perks from businesses that cross-promote with the
 * customer's businesses. Customers join a partner from here like any business.
 */
export function PartnerOffers({
  rows,
  memberSlugs,
  title = "From our partners",
  description,
  viaNames,
  limit,
}: {
  rows: PartnerPerkRow[];
  /** Businesses the customer already belongs to (shown with "Open" instead of "Join"). */
  memberSlugs: Set<string>;
  title?: string;
  description?: string;
  /** business id → name, to say whose partner each one is (on the home screen). */
  viaNames?: Record<string, string>;
  limit?: number;
}) {
  const partners = new Map<string, { info: PartnerPerkRow; via: Set<string>; perks: PartnerPerkRow[] }>();
  for (const r of rows) {
    const entry = partners.get(r.partner_id) ?? { info: r, via: new Set<string>(), perks: [] };
    entry.via.add(r.via_business_id);
    if (!entry.perks.some((p) => p.perk_id === r.perk_id)) entry.perks.push(r);
    partners.set(r.partner_id, entry);
  }
  const list = [...partners.values()].slice(0, limit);
  if (list.length === 0) return null;

  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <SectionTitle title={title} description={description} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {list.map(({ info, via, perks }) => {
          const member = memberSlugs.has(info.partner_slug);
          const viaText = viaNames ? [...via].map((id) => viaNames[id]).filter(Boolean).join(" & ") : null;
          return (
            <Card key={info.partner_id} className="flex flex-col gap-4 p-5">
              <div className="flex items-center gap-3">
                <BusinessAvatar name={info.partner_name} color={info.partner_color} logoUrl={info.partner_logo_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{info.partner_name}</p>
                  <p className="truncate text-sm text-muted">
                    {businessTagline({ categories: info.partner_categories, location: info.partner_location }) || "On Spendbox"}
                  </p>
                </div>
              </div>
              {viaText && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
                  <Handshake className="size-3.5" aria-hidden /> Partner of {viaText}
                </p>
              )}
              <ul className="flex flex-col gap-2.5">
                {perks.map((p) => (
                  <li key={p.perk_id} className="flex items-start gap-3">
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ background: PERK_KINDS[p.kind].color }}
                    >
                      <PerkIcon kind={p.kind} className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold break-words text-ink">{p.title}</span>
                      <span className="block text-xs text-muted">
                        {perkTrigger(p.kind, p.threshold, "NGN", "customer")}
                        {p.valid_days ? ` · ${durationSentence(p.valid_days, "customer").toLowerCase()}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href={member ? `/me/b/${info.partner_slug}` : `/j/${info.partner_slug}`}
                className={buttonClass({ variant: member ? "secondary" : "soft", size: "sm" }, "w-fit")}
              >
                {member ? "Open" : `Join ${info.partner_name}`} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
