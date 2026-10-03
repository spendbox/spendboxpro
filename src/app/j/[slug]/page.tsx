import { PauseCircle, ShieldCheck, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Logo } from "@/components/brand/logo";
import { PerkCard } from "@/components/perks/perk-card";
import { BusinessAvatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { businessTagline } from "@/lib/format";
import { PERK_KIND_ORDER } from "@/lib/perks";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import type { Business, Perk } from "@/lib/types";
import { JoinPanel } from "./join-panel";

const loadBusiness = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("*, perks(*)")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!data) return null;
  const business = data as Business & { perks: Perk[] };
  business.perks = business.perks
    .filter((p) => p.is_active)
    .sort((a, b) => PERK_KIND_ORDER.indexOf(a.kind) - PERK_KIND_ORDER.indexOf(b.kind));
  return business;
});

export async function generateMetadata({ params }: PageProps<"/j/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const business = await loadBusiness(slug);
  if (!business) return { title: "Link not found" };
  const welcome = business.perks.find((p) => p.kind === "welcome");
  return {
    title: `Join ${business.name}`,
    description: welcome
      ? `Join ${business.name} on Spendbox and get: ${welcome.title}.`
      : `Join ${business.name} on Spendbox for member perks.`,
  };
}

export default async function JoinPage({ params, searchParams }: PageProps<"/j/[slug]">) {
  const [{ slug }, { ref }] = await Promise.all([params, searchParams]);
  const business = await loadBusiness(slug);
  if (!business) notFound();

  const refCode = typeof ref === "string" ? ref.slice(0, 20) : null;
  const user = await getUser();
  let state: "signed-out" | "signed-in" | "member" | "owner" = user ? "signed-in" : "signed-out";
  if (user && business.owner_id === user.id) state = "owner";
  else if (user) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("memberships")
      .select("id")
      .eq("business_id", business.id)
      .eq("customer_id", user.id)
      .maybeSingle();
    if (data) state = "member";
  }
  // Joining paused (for everyone, or for this business) from the admin area.
  const closed = (state === "signed-out" || state === "signed-in") && (Boolean(business.suspended_at) || !(await getSettings()).joinsOpen);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        {state === "signed-out" && (
          <Link href={`/login?next=/j/${business.slug}`} className="text-sm font-semibold text-ink-2 hover:text-ink">
            Log in
          </Link>
        )}
      </header>

      <main className="mx-auto grid grid-cols-1 max-w-5xl gap-6 px-5 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10 lg:pt-6">
        <section className="flex flex-col gap-5">
          <div
            className="relative isolate overflow-hidden rounded-4xl p-6 text-white sm:p-8"
            style={{ background: business.brand_color }}
          >
            <div aria-hidden className="absolute -top-16 -right-16 -z-10 size-56 rounded-full bg-white/10" />
            <div className="flex items-center gap-4">
              <BusinessAvatar name={business.name} color="rgba(255,255,255,0.18)" logoUrl={business.logo_url} size="lg" />
              <div className="min-w-0">
                <p className="text-sm text-white/90">You&apos;re invited to join</p>
                <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
                  {business.name}
                </h1>
                {businessTagline(business) && <p className="mt-1 text-sm text-white/90">{businessTagline(business)}</p>}
              </div>
            </div>
            {business.about && <p className="mt-5 max-w-prose text-[15px] text-white/90">{business.about}</p>}
          </div>

          {business.perks.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-bold">Members get</h2>
              <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:w-[78%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto">
                {business.perks.map((perk) => (
                  <PerkCard
                    key={perk.id}
                    size="sm"
                    audience="customer"
                    kind={perk.kind}
                    title={perk.title}
                    threshold={perk.threshold}
                    details={perk.details}
                    validDays={perk.valid_days ?? undefined}
                    currency={business.currency}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted">Join {business.name} and every visit brings you closer to something good.</p>
          )}
        </section>

        <section className="lg:pt-2">
          <Card className="flex flex-col gap-5 p-5 sm:p-7 lg:sticky lg:top-8">
            {refCode && state !== "member" && state !== "owner" && (
              <div className="flex items-start gap-3 rounded-2xl bg-violet-50 p-3.5 text-sm text-violet-950">
                <UserPlus className="mt-0.5 size-5 shrink-0" aria-hidden />
                <p>A friend shared this with you. They get a perk when you make your first purchase.</p>
              </div>
            )}
            {closed ? (
              <div className="flex items-start gap-3">
                <PauseCircle className="mt-0.5 size-6 shrink-0 text-muted" aria-hidden />
                <div>
                  <p className="font-display text-xl font-bold">Not taking new members right now</p>
                  <p className="mt-1 text-muted">Please check back soon. If you&apos;re already a member, log in to see your perks.</p>
                </div>
              </div>
            ) : (
              <JoinPanel state={state} slug={business.slug} refCode={refCode} businessName={business.name} businessId={business.id} />
            )}
            <div className="flex items-start gap-3 border-t border-line pt-5 text-sm text-muted">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
              <p>
                Add the account you usually pay from, once, and every visit counts by itself. {business.name} only
                sees your details if you say so.
              </p>
            </div>
          </Card>
        </section>
      </main>
    </div>
  );
}
