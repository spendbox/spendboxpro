import { ArrowRight, Cake, Gift, MessageCircleHeart, PenLine, Store, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MyRequestCard } from "@/components/requests/my-request-card";
import { Card, SectionTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { requireUser } from "@/lib/auth";
import { getMyMemberships, getMyProfile, getMyRequests, getMyRewards, getRequestContacts } from "@/lib/customer";
import { budgetLabel, isLive, lifeLeft, REQUEST_IDEAS, timeAgo, timeLeftLabel } from "@/lib/requests";

export const metadata: Metadata = { title: "My Spendbox" };

export default async function MySpendboxPage({ searchParams }: PageProps<"/me">) {
  const [user, { posted }] = await Promise.all([requireUser("/me"), searchParams]);
  const [profile, memberships, rewards, requests] = await Promise.all([
    getMyProfile(user.id),
    getMyMemberships(user.id),
    getMyRewards(user.id),
    getMyRequests(user.id),
  ]);
  const live = requests.filter((r) => isLive(r));
  const earlier = requests.filter((r) => !isLive(r)).slice(0, 10);
  const contacts = await getRequestContacts([...live, ...earlier.slice(0, 5)].map((r) => r.id));
  const firstName = profile?.full_name?.split(/\s+/)[0];

  const card = (r: (typeof requests)[number]) => (
    <MyRequestCard
      key={r.id}
      request={r}
      contacts={contacts[r.id] ?? []}
      live={isLive(r)}
      timeLeft={timeLeftLabel(r.expires_at)}
      life={lifeLeft(r.expires_at)}
      budget={budgetLabel(r.budget_min, r.budget_max, r.currency)}
      ago={timeAgo(r.created_at)}
    />
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-7">
      <header>
        <p className="text-sm font-semibold text-muted">{firstName ? `Hi ${firstName}` : "Hi there"}</p>
        <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">My Spendbox</h1>
      </header>

      {posted && <FormMessage tone="success">Posted! Your plugs can see it for the next 24 hours.</FormMessage>}

      {/* Ask */}
      <section className="relative isolate overflow-hidden rounded-4xl bg-brand-700 p-5 text-white shadow-lift sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-12 -z-10 size-52 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-20 -left-10 -z-10 size-48 rounded-full bg-brand-500/40" />
        <p className="font-display text-2xl leading-tight font-bold">What do you need today?</p>
        <p className="mt-1 text-white/85">Post it with your budget. Plugs you trust reach out.</p>
        <Link
          href="/me/new"
          className="mt-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-muted shadow-card transition hover:shadow-lift"
        >
          <PenLine className="size-5 text-brand-700" aria-hidden />
          <span className="flex-1">e.g. A cake for Saturday, about ₦25,000</span>
          <ArrowRight className="size-5 text-brand-700" aria-hidden />
        </Link>
        <div className="mt-3 flex flex-wrap gap-2">
          {REQUEST_IDEAS.slice(0, 4).map((i) => (
            <Link key={i.label} href="/me/new" className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/25">
              {i.label}
            </Link>
          ))}
        </div>
      </section>

      {/* Live */}
      {live.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle title="Live requests" description="Up for 24 hours. Tap “Found my plug” once you're sorted." />
          {live.map(card)}
        </section>
      )}

      {/* Nudges */}
      {(rewards.length > 0 || !profile?.birth_month) && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rewards.length > 0 && (
            <Link href="/me/plugs" className="block rounded-3xl">
              <Card className="flex items-center gap-3 p-4 transition hover:ring-brand-300">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-50 text-accent-700">
                  <Gift className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{rewards.length === 1 ? "1 perk ready" : `${rewards.length} perks ready`}</span>
                  <span className="block text-sm text-muted">Show it when you visit</span>
                </span>
                <ArrowRight className="size-5 text-muted" aria-hidden />
              </Card>
            </Link>
          )}
          {!profile?.birth_month && (
            <Link href="/me/profile" className="block rounded-3xl">
              <Card className="flex items-center gap-3 p-4 transition hover:ring-brand-300">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-[#FBE7EE] text-[#A3214E]">
                  <Cake className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Add your birthday</span>
                  <span className="block text-sm text-muted">Some plugs give birthday treats</span>
                </span>
                <ArrowRight className="size-5 text-muted" aria-hidden />
              </Card>
            </Link>
          )}
        </section>
      )}

      {/* How it works (until they've posted) */}
      {requests.length === 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle title="How it works" />
          <Card className="divide-y divide-line">
            {[
              { icon: PenLine, title: "Say what you need", text: "Add your budget and a photo if it helps." },
              { icon: Store, title: "Your plugs see it", text: memberships.length ? `${memberships.map((m) => m.business.name).slice(0, 2).join(" and ")}${memberships.length > 2 ? " and more" : ""}, plus businesses they partner with.` : "The businesses you've joined, plus businesses they partner with." },
              { icon: MessageCircleHeart, title: "They reach out", text: "On WhatsApp, by phone or email, however you choose. Up for 24 hours." },
            ].map((s, i) => (
              <div key={s.title} className="flex items-start gap-3 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 font-display font-bold text-brand-700">{i + 1}</span>
                <div>
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-sm text-muted">{s.text}</p>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* Earlier */}
      {earlier.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle title="Earlier" description="Ended after 24 hours, or closed. Post any of them again." />
          {earlier.map(card)}
        </section>
      )}

      {memberships.length === 0 && (
        <Card className="flex items-start gap-3 p-5">
          <Users className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
          <p className="text-sm text-muted">
            You haven&apos;t joined any businesses yet. Ask a business you buy from for their Spendbox link. Your requests go to the businesses you join.
          </p>
        </Card>
      )}
    </div>
  );
}
