import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PerkIcon } from "@/components/perks/perk-card";
import { requireUser } from "@/lib/auth";
import { getMyMemberships, getMyProfile, getMyRewards } from "@/lib/customer";
import { appTimeZone } from "@/lib/env";
import { cn } from "@/lib/cn";
import { formatDate, formatMonthYear, memberNo } from "@/lib/format";
import { LiveClock } from "./live-clock";

export const metadata: Metadata = { title: "Member pass" };

export default async function PassPage({ params, searchParams }: PageProps<"/me/b/[slug]/pass">) {
  const [{ slug }, { perk: picked }] = await Promise.all([params, searchParams]);
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
      <h1 className="font-display text-2xl font-bold">Show this to the seller</h1>

      <div
        className="relative isolate flex flex-col gap-6 overflow-hidden rounded-4xl p-6 text-white shadow-lift"
        style={{ background: b.brand_color }}
      >
        <div aria-hidden className="absolute -top-16 -right-16 -z-10 size-56 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-24 -left-10 -z-10 size-56 rounded-full bg-black/10" />
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-extrabold">spendbox</span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">Member pass</span>
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
            {ready.some((r) => r.id === picked) ? "Ask for the highlighted perk" : ready.length ? "Perks to give today" : "No perks ready yet"}
          </p>
          {ready.length ? (
            <ul className="flex flex-col gap-2">
              {ready.map((r) => (
                <li
                  key={r.id}
                  aria-current={r.id === picked ? "true" : undefined}
                  className={cn("flex items-center gap-3", r.id === picked && "-mx-2 rounded-2xl bg-brand-50 px-2 py-2 ring-2 ring-brand-600")}
                >
                  <PerkIcon kind={r.kind} className="size-5 shrink-0 text-brand-600" />
                  <span className="flex-1 text-lg leading-tight font-bold">{r.title}</span>
                  {r.expires_at && <span className="text-xs text-muted">until {formatDate(r.expires_at)}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Your purchases still count toward perks.</p>
          )}
        </div>

        <LiveClock timeZone={appTimeZone()} />
      </div>

      <p className="text-center text-sm text-muted">
        The clock moves, so a screenshot won&apos;t work. The seller marks your perk as given from their dashboard
        using your member number.
      </p>
    </div>
  );
}
