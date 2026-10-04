import { Lock, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RewardButton } from "@/components/business/reward-button";
import { PerkIcon } from "@/components/perks/perk-card";
import { Badge } from "@/components/ui/badge";
import { Card, SectionTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { buttonClass } from "@/components/ui/button";
import { requireOwnedBusiness } from "@/lib/auth";
import { getMembers, getRewards } from "@/lib/business";
import { formatDate, formatPhone, memberLabel, memberNo, MONTHS, whatsappLink } from "@/lib/format";
import { PERK_KINDS } from "@/lib/perks";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/dashboard/[bizId]/customers/[memberId]">) {
  const { bizId, memberId } = await params;
  const [, members, rewards] = await Promise.all([
    requireOwnedBusiness(bizId),
    getMembers(bizId),
    getRewards(bizId, { status: null, membershipId: memberId }),
  ]);
  const m = members.find((x) => x.membership_id === memberId);
  if (!m) notFound();

  const label = memberLabel(m.member_no, m.full_name);
  const ready = rewards.filter((r) => r.status === "available");
  const given = rewards.filter((r) => r.status === "redeemed").slice(0, 10);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        back={{ href: `/dashboard/${bizId}/customers`, label: "Customers" }}
        title={label}
        description={`${memberNo(m.member_no)} · joined ${formatDate(m.joined_at, { withYear: true })}${m.referred ? " · invited by a friend" : ""}`}
      />

      {m.shares_details && (m.phone || m.email) && (
        <section aria-label="Contact" className="flex flex-wrap gap-2">
          {m.phone && (
            <a href={`tel:+${m.phone}`} className={buttonClass({ variant: "secondary" })}>
              <Phone className="size-4" aria-hidden /> Call
            </a>
          )}
          {m.phone && (
            <a href={whatsappLink(m.phone)} target="_blank" rel="noreferrer" className={buttonClass({ variant: "secondary" })}>
              <WhatsAppIcon className="size-4" /> WhatsApp
            </a>
          )}
          {m.email && (
            <a href={`mailto:${m.email}`} className={buttonClass({ variant: "secondary" })}>
              <Mail className="size-4" aria-hidden /> Email
            </a>
          )}
        </section>
      )}

      <div className="max-w-3xl">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
          <section className="flex flex-col gap-3">
            <SectionTitle title="Details" />
            <Card className="p-5">
              {m.shares_details ? (
                <dl className="flex flex-col divide-y divide-line">
                  <div className="flex justify-between gap-4 py-2.5 first:pt-0">
                    <dt className="text-muted">Name</dt>
                    <dd className="text-right font-semibold">{m.full_name ?? "Not added"}</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="text-muted">Phone</dt>
                    <dd className="text-right font-semibold">
                      {m.phone ? (
                        <a href={whatsappLink(m.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand-700 hover:underline">
                          <WhatsAppIcon className="size-4" /> {formatPhone(m.phone)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="text-muted">Email</dt>
                    <dd className="min-w-0 text-right font-semibold break-all">
                      {m.email ? (
                        <a href={`mailto:${m.email}`} className="text-brand-700 hover:underline">
                          {m.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="text-muted">Gender</dt>
                    <dd className="text-right font-semibold capitalize">{m.gender ?? "Not added"}</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2.5 last:pb-0">
                    <dt className="text-muted">Birthday</dt>
                    <dd className="text-right font-semibold">
                      {m.birth_month ? `${m.birth_day ?? ""} ${MONTHS[m.birth_month - 1]}`.trim() : "Not added"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="flex items-start gap-3 text-sm text-muted">
                  <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <p>
                    This customer keeps their details private, so you can&apos;t call or email them here. You still see their requests
                    (with the contact they choose), and give their perks using member number <span className="font-semibold text-ink">{memberNo(m.member_no)}</span>.
                  </p>
                </div>
              )}
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Perks to give" description="Hand them over when they visit, then mark them as given." />
            <Card className="px-5">
              {ready.length === 0 && given.length === 0 ? (
                <p className="py-5 text-sm text-muted">Nothing earned yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {[...ready, ...given].map((r) => (
                    <li key={r.id} className="flex items-center gap-3 py-3.5">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white"
                        style={{ background: PERK_KINDS[r.kind].color }}
                      >
                        <PerkIcon kind={r.kind} className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold break-words">{r.title}</p>
                        <p className="text-xs text-muted">
                          {r.status === "redeemed" && r.redeemed_at
                            ? `Given ${formatDate(r.redeemed_at)}`
                            : `Earned ${formatDate(r.issued_at)}${r.expires_at ? ` · until ${formatDate(r.expires_at)}` : ""}`}
                        </p>
                      </div>
                      {r.status === "redeemed" && <Badge tone="gray">Given</Badge>}
                      <RewardButton bizId={bizId} rewardId={r.id} given={r.status === "redeemed"} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>

      </div>
    </div>
  );
}
