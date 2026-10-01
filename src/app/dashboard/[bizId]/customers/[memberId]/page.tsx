import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaymentRow } from "@/components/business/payment-row";
import { RecordPurchase } from "@/components/business/record-purchase";
import { RewardButton } from "@/components/business/reward-button";
import { PerkIcon } from "@/components/perks/perk-card";
import { Badge } from "@/components/ui/badge";
import { Card, SectionTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { requireOwnedBusiness } from "@/lib/auth";
import { getMembers, getPurchases, getRewards } from "@/lib/business";
import { formatDate, formatMoney, formatPhone, MONTHS, memberLabel, memberNo, whatsappLink } from "@/lib/format";
import { PERK_KINDS } from "@/lib/perks";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/dashboard/[bizId]/customers/[memberId]">) {
  const { bizId, memberId } = await params;
  const { business } = await requireOwnedBusiness(bizId);
  const [members, purchases, rewards] = await Promise.all([
    getMembers(bizId),
    getPurchases(bizId, { membershipId: memberId }),
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
        actions={<RecordPurchase bizId={bizId} currency={business.currency} members={[]} fixedMember={{ id: m.membership_id, label }} />}
      />

      <section className="grid grid-cols-3 gap-3">
        {[
          { label: "Purchases", value: String(m.visits) },
          { label: "Spent", value: formatMoney(m.total_spent, business.currency) },
          { label: "Last visit", value: m.last_visit_at ? formatDate(m.last_visit_at) : "—" },
        ].map((s) => (
          <Card key={s.label} className="p-4 sm:p-5">
            <p className="text-sm font-semibold text-muted">{s.label}</p>
            <p className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{s.value}</p>
          </Card>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start">
        <div className="flex flex-col gap-8">
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
                    This customer keeps their details private. You can see their purchases and give their perks using
                    member number <span className="font-semibold text-ink">{memberNo(m.member_no)}</span>.
                  </p>
                </div>
              )}
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Perks to give" description="Hand these over on their next order, then mark them as given." />
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
                        <p className="truncate font-semibold">{r.title}</p>
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

        <section className="flex flex-col gap-3">
          <SectionTitle title="Purchases" />
          <Card className="px-5">
            {purchases.length === 0 ? (
              <p className="py-5 text-sm text-muted">No purchases yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {purchases.map((p) => (
                  <PaymentRow key={p.id} bizId={bizId} payment={p} showMember={false} />
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
