import { ArrowLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PerkIcon } from "@/components/perks/perk-card";
import { requireUser } from "@/lib/auth";
import { getMyMemberships, getMyProfile, getMyRewards, getPayAccounts } from "@/lib/customer";
import { PayAccounts } from "@/components/perks/pay-accounts";
import { appTimeZone } from "@/lib/env";
import { formatDate, formatMonthYear, memberNo } from "@/lib/format";
import { PERK_KINDS } from "@/lib/perks";
import { LiveClock } from "@/components/perks/live-clock";

export const metadata: Metadata = { title: "Member card" };

export default async function PassPage({ params }: PageProps<"/me/b/[slug]/pass">) {
  const { slug } = await params;
  const user = await requireUser(`/me/b/${slug}/pass`);
  const [memberships, rewards, profile] = await Promise.all([
    getMyMemberships(user.id),
    getMyRewards(user.id),
    getMyProfile(user.id),
  ]);
  const membership = memberships.find((m) => m.business.slug === slug);
  if (!membership) notFound();
  const b = membership.business;
  const ready = rewards.filter((r) => r.membership_id === membership.id);
  const name = profile?.full_name?.trim();
  const shortName = name ? name.split(/\s+/).map((w, i) => (i === 0 ? w : `${w[0]}.`)).join(" ") : null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5">
      <Link
        href={`/me/b/${b.slug}`}
        className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> {b.name}
      </Link>
      <div>
        <h1 className="font-display text-2xl font-bold">Your member card</h1>
        <p className="mt-1 text-muted">Show it when you buy, so {b.name} knows you&apos;re a member. To use a perk, tap it below.</p>
      </div>

      <div
        className="relative isolate flex flex-col gap-6 overflow-hidden rounded-4xl p-6 text-white shadow-lift"
        style={{ background: b.brand_color }}
      >
        <div aria-hidden className="absolute -top-16 -right-16 -z-10 size-56 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-24 -left-10 -z-10 size-56 rounded-full bg-black/10" />
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-extrabold">spendbox</span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">Member card</span>
        </div>
        <div>
          <p className="text-sm text-white/90">Member of</p>
          <p className="font-display text-3xl leading-tight font-extrabold">{b.name}</p>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            {shortName && <p className="text-xl font-bold">{shortName}</p>}
            <p className="text-sm text-white/90">since {formatMonthYear(membership.joined_at)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/90">Member no.</p>
            <p className="font-display text-3xl leading-none font-extrabold tabular">{memberNo(membership.member_no)}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-3xl bg-white p-4 text-ink">
          <p className="text-sm font-semibold text-muted">
            {ready.length > 1 ? `${ready.length} perks ready · tap one to use it` : ready.length ? "Perk ready · tap to use it" : "No perks ready yet"}
          </p>
          {ready.length ? (
            <ul className="flex flex-col gap-2">
              {ready.map((r) => (
                <li key={r.id}>
                  <Link href={`/me/perks/${r.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-canvas">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: PERK_KINDS[r.kind].color }}>
                      <PerkIcon kind={r.kind} className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block leading-tight font-bold break-words">{r.title}</span>
                      <span className="block text-xs text-muted">{r.expires_at ? `Use by ${formatDate(r.expires_at)}` : "No time limit"}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Your purchases still count toward perks.</p>
          )}
        </div>

        <LiveClock timeZone={appTimeZone()} />
      </div>

      <PayAccounts accounts={await getPayAccounts(b.id)} businessName={b.name} />

      <p className="text-center text-sm text-muted">
        The clock is live, so {b.name} can tell it&apos;s really you and not a screenshot. Your purchases count toward
        your perks automatically.
      </p>
    </div>
  );
}
