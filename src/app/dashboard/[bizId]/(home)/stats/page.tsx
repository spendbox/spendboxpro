import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ProductThumb } from "@/components/products/product-thumb";
import { Card, EmptyState, SectionTitle } from "@/components/ui/card";
import { requireOwnedBusiness } from "@/lib/auth";
import { compactNumber, getRequests, getStats } from "@/lib/business";
import { cn } from "@/lib/cn";
import { getBusinessProducts } from "@/lib/products";

export const metadata: Metadata = { title: "Stats" };

export default async function StatsTab({ params }: PageProps<"/dashboard/[bizId]/stats">) {
  const { bizId } = await params;
  const [, stats, requests, products] = await Promise.all([requireOwnedBusiness(bizId), getStats(bizId), getRequests(bizId), getBusinessProducts(bizId)]);
  const base = `/dashboard/${bizId}`;
  const sum = (key: "views" | "viewers" | "likes" | "contacts" | "partner_viewers") => products.reduce((s, p) => s + p[key], 0);
  const reachedOut = requests.filter((r) => r.reached_out).length;
  const ranked = [...products].sort((a, b) => b.views - a.views || b.likes - a.likes);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-label="Customers">
        <SectionTitle title="Customers" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Customers" value={compactNumber(stats.members)} note={stats.members_new ? `+${stats.members_new} this week` : "No new ones this week"} href={`${base}/customers`} />
          <Tile label="Joined from invites" value={compactNumber(stats.referred_members)} note="Brought by a friend" href={`${base}/customers`} />
          <Tile label="Perks to give" value={compactNumber(stats.rewards_ready)} note="Earned, not yet given" href={`${base}/customers?perks=ready`} attention={stats.rewards_ready > 0} />
          <Tile label="Live requests" value={compactNumber(requests.length)} note={`You reached out to ${reachedOut}`} href={`${base}/requests`} />
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-label="Products">
        <SectionTitle title="Products & services" description="Views count each person once every 10 minutes. Partner views are from your partners' customers." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Views" value={compactNumber(sum("views"))} note={`${compactNumber(sum("viewers"))} people`} />
          <Tile label="From partners" value={compactNumber(sum("partner_viewers"))} note="People who found you through a partner" />
          <Tile label="Likes" value={compactNumber(sum("likes"))} note="Saved to their box" />
          <Tile label="Got in touch" value={compactNumber(sum("contacts"))} note="WhatsApp, call or email" />
        </div>

        {ranked.length === 0 ? (
          <EmptyState title="No products yet" description="Post a product or service to see who views and likes it." />
        ) : (
          <Card className="divide-y divide-line">
            <div className="hidden grid-cols-[minmax(0,1fr)_repeat(4,4.5rem)_1.25rem] gap-2 px-4 py-2.5 text-xs font-semibold text-muted sm:grid">
              <span>Product</span>
              <span className="text-right">Views</span>
              <span className="text-right">People</span>
              <span className="text-right">Likes</span>
              <span className="text-right">In touch</span>
              <span />
            </div>
            {ranked.map((p) => (
              <Link
                key={p.id}
                href={`${base}/products/${p.id}`}
                className="grid grid-cols-[3rem_minmax(0,1fr)_1.25rem] items-center gap-3 px-4 py-3 hover:bg-black/[0.02] sm:grid-cols-[3rem_minmax(0,1fr)_repeat(4,4.5rem)_1.25rem] sm:gap-2"
              >
                <ProductThumb mediaType={p.media_type} mediaUrl={p.media_url} posterUrl={p.poster_url} showPlay={false} className="size-12 rounded-xl" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.title}</span>
                  <span className="block text-xs text-muted sm:hidden">
                    {p.views} views · {p.viewers} people · {p.likes} likes · {p.contacts} in touch
                  </span>
                </span>
                {[p.views, p.viewers, p.likes, p.contacts].map((n, i) => (
                  <span key={i} className="hidden text-right font-semibold tabular sm:block">
                    {compactNumber(n)}
                  </span>
                ))}
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, note, href, attention }: { label: string; value: ReactNode; note: string; href?: string; attention?: boolean }) {
  const body = (
    <>
      <p className="text-xs font-semibold text-muted sm:text-sm">{label}</p>
      <p className="truncate text-2xl font-semibold tracking-tight text-ink">{value}</p>
      <p className={cn("text-xs font-semibold", attention ? "text-accent-700" : "text-muted")}>{note}</p>
    </>
  );
  const className = cn("flex flex-col gap-1 rounded-2xl bg-surface p-4 shadow-card ring-1", attention ? "bg-accent-50 ring-accent-100" : "ring-line");
  return href ? (
    <Link href={href} className={cn(className, "transition hover:ring-brand-300")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
