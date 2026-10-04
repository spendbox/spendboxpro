import { ArrowRight, Check, Inbox, PartyPopper, QrCode as QrCodeIcon, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BusinessRequestCard } from "@/components/requests/business-request-card";
import { Card, EmptyState, SectionTitle } from "@/components/ui/card";
import { ShareLinkBar } from "@/components/ui/share-actions";
import { requireOwnedBusiness } from "@/lib/auth";
import { billingState } from "@/lib/billing";
import { compactNumber, getPerks, getRequests, getStats } from "@/lib/business";
import { cn } from "@/lib/cn";
import { siteUrl } from "@/lib/env";
import { budgetLabel, timeAgo, timeLeftLabel } from "@/lib/requests";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Home" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "mine", label: "Your customers" },
  { key: "partners", label: "Partners' customers" },
];

export default async function BusinessHome({ params, searchParams }: PageProps<"/dashboard/[bizId]">) {
  const [{ bizId }, { welcome, show }] = await Promise.all([params, searchParams]);
  const [{ business }, stats, perks, requests, { data: partnerSlots }] = await Promise.all([
    requireOwnedBusiness(bizId),
    getStats(bizId),
    getPerks(bizId),
    getRequests(bizId),
    // Ownership is checked above; partnerships are only readable server-side.
    createAdminClient().rpc("partner_slots_used", { p_business_id: bizId }),
  ]);
  const filter = FILTERS.some((f) => f.key === show) ? String(show) : "all";
  const shown = requests.filter((r) => (filter === "mine" ? r.is_member : filter === "partners" ? !r.is_member : true));
  const billing = billingState(business);
  const hasPartners = Number(partnerSlots ?? 0) > 0;

  const base = `/dashboard/${bizId}`;
  const joinUrl = `${siteUrl()}/j/${business.slug}`;
  const welcomePerk = perks.find((p) => p.kind === "welcome" && p.is_active);
  const steps = [
    { done: true, label: "Create your business", href: null },
    { done: perks.some((p) => p.is_active), label: "Add a welcome, invite or birthday perk", href: `${base}/perks` },
    { done: stats.members > 0, label: "Share your link so customers join", href: "#share" },
    { done: hasPartners, label: "Partner with a business near you", href: `${base}/partners` },
  ];
  const setupDone = steps.every((s) => s.done);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-semibold text-muted">{business.categories?.length ? business.categories.join(", ") : (business.category ?? "Your business")}</p>
        <h1 className="font-display text-[30px] leading-tight font-bold tracking-tight sm:text-4xl">{business.name}</h1>
      </header>

      {welcome && (
        <div className="flex animate-fade-up items-start gap-4 rounded-3xl bg-brand-50 p-5 ring-1 ring-brand-100">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-700">
            <PartyPopper className="size-5" aria-hidden />
          </div>
          <div>
            <p className="font-display text-lg font-bold text-brand-900">You&apos;re on Spendbox</p>
            <p className="mt-0.5 text-sm text-brand-900/90">Share your link so customers join. When they need something, their requests show up right here.</p>
          </div>
        </div>
      )}

      {!setupDone && (
        <Card className="p-5 sm:p-6">
          <SectionTitle title="Get set up" description={`${steps.filter((s) => s.done).length} of ${steps.length} done`} />
          <ol className="mt-4 flex flex-col gap-1">
            {steps.map((step) => {
              const content = (
                <>
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", step.done ? "bg-brand-600 text-white" : "ring-2 ring-line-strong")}>
                    {step.done && <Check className="size-4" aria-hidden />}
                  </span>
                  <span className={cn("flex-1 font-semibold", step.done ? "text-muted line-through" : "text-ink")}>
                    {step.label}
                    <span className="sr-only">{step.done ? " (done)" : ""}</span>
                  </span>
                  {!step.done && step.href && <ArrowRight className="size-4 text-muted" aria-hidden />}
                </>
              );
              return (
                <li key={step.label}>
                  {!step.done && step.href ? (
                    <Link href={step.href} className="flex items-center gap-3 rounded-xl p-2 hover:bg-canvas">
                      {content}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 p-2">{content}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {/* Numbers and join link, kept small so requests stay the focus */}
      <section aria-label="At a glance" className="flex flex-col gap-2.5">
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          <StatTile label="Customers" value={compactNumber(stats.members)} note={stats.members_new ? `+${stats.members_new} this week` : undefined} href={`${base}/customers`} />
          <StatTile label="Perks to give" value={compactNumber(stats.rewards_ready)} href={`${base}/customers?perks=ready`} attention={stats.rewards_ready > 0} />
          <StatTile label="Live requests" value={compactNumber(requests.length)} href="#requests-title" />
          <StatTile label="From invites" value={compactNumber(stats.referred_members)} href={`${base}/customers`} />
        </div>
        <div id="share" className="scroll-mt-24">
          <ShareLinkBar
            url={joinUrl}
            message={welcomePerk ? `Join ${business.name} on Spendbox and get ${welcomePerk.title.toLowerCase()}:` : `Join ${business.name} on Spendbox. Tell us what you need, anytime:`}
            extra={
              <a href={`${base}/qr`} aria-label="Download QR code" title="Download QR code" className="flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-2 hover:bg-black/5">
                <QrCodeIcon className="size-4" aria-hidden />
              </a>
            }
          />
        </div>
      </section>

      {/* Requests */}
      <section className="flex flex-col gap-4" aria-labelledby="requests-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="requests-title" className="font-display text-2xl font-bold">
              Requests
            </h2>
            <p className="text-sm text-muted">
              {requests.length === 0
                ? "What your customers need, as they post it."
                : `${requests.length} live ${requests.length === 1 ? "request" : "requests"} you can help with. Each one is up for 24 hours.`}
            </p>
          </div>
        </div>

        {requests.length > 0 && (
          <nav aria-label="Filter requests" className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={f.key === "all" ? base : `${base}?show=${f.key}`}
                aria-current={f.key === filter ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition",
                  f.key === filter ? "bg-ink text-white ring-ink" : "bg-white text-ink-2 ring-line hover:bg-black/5",
                )}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        )}

        {!billing.partnerRequests && hasPartners && (
          <Link href={`${base}/settings/billing`} className="flex items-center gap-3 rounded-2xl bg-violet-50 p-4 text-sm text-violet-950 ring-1 ring-violet-100">
            <Sparkles className="size-5 shrink-0 text-violet-700" aria-hidden />
            <span className="flex-1">
              <span className="font-semibold">See your partners&apos; customers&apos; requests too.</span> That comes with the Plus plan.
            </span>
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}

        {shown.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-6" aria-hidden />}
            title={requests.length ? "Nothing here right now" : "No requests yet"}
            description={
              stats.members === 0
                ? "Share your link so customers join. Their requests show up here."
                : "When your customers (or your partners' customers) need something, it shows up here for 24 hours."
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {shown.map((r) => (
              <BusinessRequestCard
                key={r.id}
                bizId={bizId}
                businessName={business.name}
                request={r}
                budget={budgetLabel(r.budget_min, r.budget_max, r.currency)}
                timeLeft={timeLeftLabel(r.expires_at)}
                ago={timeAgo(r.created_at)}
              />
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

function StatTile({ label, value, note, href, attention }: { label: string; value: ReactNode; note?: string; href: string; attention?: boolean }) {
  return (
    <Link
      href={href}
      title={note}
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-2xl bg-surface px-3 py-2.5 shadow-card ring-1 transition hover:ring-brand-300 sm:px-4 sm:py-3",
        attention ? "bg-accent-50 ring-accent-100" : "ring-line",
      )}
    >
      <p className="truncate text-xl leading-tight font-semibold tracking-tight text-ink sm:text-2xl">{value}</p>
      <p className={cn("text-[11px] leading-tight font-semibold sm:text-xs", attention ? "text-accent-700" : "text-muted")}>{label}</p>
    </Link>
  );
}
