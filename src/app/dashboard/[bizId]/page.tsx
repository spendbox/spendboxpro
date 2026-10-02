import { ArrowRight, Check, Download, ExternalLink, PartyPopper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PaymentRow } from "@/components/business/payment-row";
import { QrCode } from "@/components/qr-code";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState, SectionTitle } from "@/components/ui/card";
import { ShareLink } from "@/components/ui/share-actions";
import { requireOwnedBusiness } from "@/lib/auth";
import { syncBusinessIfStale } from "@/lib/bank/sync";
import { compactNumber, getPerks, getPurchases, getStats, hasBankConnection } from "@/lib/business";
import { after } from "next/server";
import { cn } from "@/lib/cn";
import { siteUrl } from "@/lib/env";
import { formatMoney, plural } from "@/lib/format";

export const metadata: Metadata = { title: "Home" };

export default async function BusinessHome({ params, searchParams }: PageProps<"/dashboard/[bizId]">) {
  const [{ bizId }, { welcome }] = await Promise.all([params, searchParams]);
  const { business } = await requireOwnedBusiness(bizId);
  const [stats, perks, connected, recent] = await Promise.all([
    getStats(bizId),
    getPerks(bizId),
    hasBankConnection(bizId),
    getPurchases(bizId, { limit: 5 }),
  ]);
  if (connected) after(() => syncBusinessIfStale(bizId).catch((e) => console.error("Bank sync failed", e)));

  const joinUrl = `${siteUrl()}/j/${business.slug}`;
  const welcomePerk = perks.find((p) => p.kind === "welcome" && p.is_active);
  const steps = [
    { done: true, label: "Create your business", href: null },
    { done: connected, label: "Connect the bank account customers pay into", href: `/dashboard/${bizId}/settings#bank` },
    { done: perks.length > 0, label: "Add your first perk", href: `/dashboard/${bizId}/perks` },
    { done: stats.members > 0, label: "Share your link with customers", href: "#share" },
  ];
  const setupDone = steps.every((s) => s.done);
  const base = `/dashboard/${bizId}`;

  return (
    <div className="flex flex-col gap-8">
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
            <p className="font-display text-lg font-bold text-brand-900">Your Spendbox link is ready</p>
            <p className="mt-0.5 text-sm text-brand-900/90">Finish the steps below, then share your link to start getting members.</p>
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
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full",
                      step.done ? "bg-brand-600 text-white" : "ring-2 ring-line-strong",
                    )}
                  >
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

      {/* Headline numbers */}
      <section aria-label="This week" className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
        <Card className="flex flex-col justify-between gap-6 bg-brand-700 p-6 text-white ring-0">
          <p className="text-sm font-semibold text-white/90">Sales from members this week</p>
          <div>
            <p className="text-5xl font-semibold tracking-tight">{formatMoney(stats.sales_week, business.currency)}</p>
            <p className="mt-2 text-sm text-white/90">from {plural(stats.purchases_week, "counted purchase")} in the last 7 days</p>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Members" value={compactNumber(stats.members)} note={stats.members_new ? `+${stats.members_new} this week` : "No new members this week"} href={`${base}/customers`} />
          <StatTile
            label="Who paid this?"
            value={compactNumber(stats.unmatched + stats.pending)}
            note={stats.unmatched + stats.pending ? "Payments waiting for you" : "All caught up"}
            href={`${base}/payments`}
            attention={stats.unmatched + stats.pending > 0}
          />
          <StatTile
            label="Perks to give"
            value={compactNumber(stats.rewards_ready)}
            note="Earned, not yet used"
            href={`${base}/rewards`}
          />
          <StatTile label="Joined through friends" value={compactNumber(stats.referred_members)} note="From customer invites" href={`${base}/customers`} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <section id="share" className="flex scroll-mt-24 flex-col gap-3">
          <SectionTitle title="Your join link" description="Customers join from this link or by scanning the QR code." />
          <Card className="flex flex-col gap-5 p-5">
            <div className="flex items-center gap-5">
              <QrCode value={joinUrl} label={`QR code for ${joinUrl}`} className="w-32 shrink-0 sm:w-36" />
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-sm text-muted">Print it for your counter, or share it on your WhatsApp status.</p>
                <a href={`${base}/qr`} className={buttonClass({ variant: "secondary", size: "sm" }, "w-fit")}>
                  <Download className="size-4" aria-hidden /> Download QR
                </a>
                <Link href={`/j/${business.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
                  <ExternalLink className="size-4" aria-hidden /> Preview join page
                </Link>
              </div>
            </div>
            <ShareLink
              url={joinUrl}
              title={`Join ${business.name}`}
              message={
                welcomePerk
                  ? `Join ${business.name} on Spendbox and get ${welcomePerk.title.toLowerCase()}:`
                  : `Join ${business.name} on Spendbox for member perks:`
              }
            />
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle
            title="Latest payments"
            action={
              <Link href={`${base}/payments`} className="text-sm font-semibold text-brand-700 hover:underline">
                See all
              </Link>
            }
          />
          {recent.length === 0 ? (
            <EmptyState title="No payments yet" description="When customers pay into your connected bank, or you record a purchase, they show up here." />
          ) : (
            <Card className="px-5">
              <ul className="divide-y divide-line">
                {recent.map((p) => (
                  <PaymentRow key={p.id} bizId={bizId} payment={p} />
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  note,
  href,
  attention,
}: {
  label: string;
  value: ReactNode;
  note: string;
  href: string;
  attention?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col justify-between gap-3 rounded-3xl bg-surface p-4 shadow-card ring-1 transition hover:ring-brand-300 sm:p-5",
        attention ? "ring-accent-100 bg-accent-50" : "ring-line",
      )}
    >
      <p className="text-sm font-semibold text-muted">{label}</p>
      <div>
        <p className="text-3xl font-semibold tracking-tight text-ink">{value}</p>
        <p className={cn("mt-1 text-xs font-semibold", attention ? "text-accent-700" : "text-muted")}>{note}</p>
      </div>
    </Link>
  );
}
