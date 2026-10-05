import { ArrowRight, Box, Check, LayoutGrid, PartyPopper, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, SectionTitle } from "@/components/ui/card";
import { requireOwnedBusiness } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { getPerks, getStats } from "@/lib/business";
import { cn } from "@/lib/cn";
import { getBusinessProducts } from "@/lib/products";
import { createAdminClient } from "@/lib/supabase/admin";
import { HomeShop } from "./home-shop";
import { ProductGrid } from "./product-grid";

export const metadata: Metadata = { title: "Products & services" };

export default async function ProductsTab({ params, searchParams }: PageProps<"/dashboard/[bizId]">) {
  const [{ bizId }, { welcome, view }] = await Promise.all([params, searchParams]);
  const in3d = view === "3d";
  const [{ business }, stats, perks, products, { data: partnerSlots }] = await Promise.all([
    requireOwnedBusiness(bizId),
    getStats(bizId),
    getPerks(bizId),
    getBusinessProducts(bizId),
    // Ownership is checked alongside; partnerships are only readable server-side.
    createAdminClient().rpc("partner_slots_used", { p_business_id: bizId }),
  ]);
  const base = `/dashboard/${bizId}`;
  const steps = [
    { done: products.length > 0, label: "Post your first product or service", href: `${base}/products/new` },
    { done: perks.some((p) => p.is_active), label: "Add a welcome perk", href: `${base}/perks` },
    { done: stats.members > 0, label: "Share your link so customers join", href: null },
    { done: Number(partnerSlots ?? 0) > 0, label: "Partner with a business near you", href: `${base}/partners` },
    {
      // Adding a category of their own keeps it in the shop design too, but isn't designing the shop.
      done: Boolean(business.store_theme && typeof business.store_theme === "object" && Object.keys(business.store_theme).some((k) => k !== "categories")),
      label: "Design your 3D shop",
      href: `${base}/settings/store?edit=1`,
    },
  ];
  const setupDone = steps.every((s) => s.done);

  return (
    <div className="flex flex-col gap-5">
      {welcome && (
        <div className="flex animate-fade-up items-start gap-4 rounded-3xl bg-brand-50 p-5 ring-1 ring-brand-100">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-700">
            <PartyPopper className="size-5" aria-hidden />
          </div>
          <div>
            <p className="font-display text-lg font-bold text-brand-900">You&apos;re on Spendbox</p>
            <p className="mt-0.5 text-sm text-brand-900/90">
              Post what you sell, and share your link. Your customers see your products, and tell you what they need.
            </p>
          </div>
        </div>
      )}

      {!setupDone && (
        <Card className="p-4 sm:p-5">
          <SectionTitle title="Get set up" description={`${steps.filter((s) => s.done).length} of ${steps.length} done`} />
          <ol className="mt-2 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {steps.map((step) => {
              const content = (
                <>
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", step.done ? "bg-brand-600 text-white" : "ring-2 ring-line-strong")}>
                    {step.done && <Check className="size-3.5" aria-hidden />}
                  </span>
                  <span className={cn("flex-1 text-sm font-semibold", step.done ? "text-muted line-through" : "text-ink")}>
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

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Products &amp; services</h2>
          <p className="text-sm text-muted">Your customers and your partners&apos; customers see these, newest first.</p>
        </div>
        {/* Grid or 3D */}
        <div role="group" aria-label="View" className="flex w-fit rounded-full bg-black/[0.05] p-1">
          {(
            [
              ["Grid", base, !in3d, LayoutGrid],
              ["3D shop", `${base}?view=3d`, in3d, Box],
            ] as const
          ).map(([label, href, on, Icon]) => (
            <Link
              key={label}
              href={href}
              aria-current={on ? "page" : undefined}
              className={cn("flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold", on ? "bg-white text-ink shadow-card" : "text-ink-2 hover:text-ink")}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </Link>
          ))}
        </div>
      </div>

      {in3d ? (
        <HomeShop
          bizId={bizId}
          theme={business.store_theme}
          shareUrl={`${siteUrl()}/s/${business.slug}`}
          business={{
            id: business.id,
            slug: business.slug,
            name: business.name,
            categories: business.categories ?? [],
            location: business.location,
            about: business.about,
            logo_url: business.logo_url,
            brand_color: business.brand_color,
            whatsapp: business.whatsapp,
            email: business.email,
            is_member: true,
          }}
          products={products
            .filter((p) => p.is_active)
            .map((p) => ({ id: p.id, title: p.title, price: p.price, currency: p.currency, media_type: p.media_type, media_url: p.media_url, poster_url: p.poster_url, description: p.description, category: p.category, kind: p.kind, media_aspect: p.media_aspect }))}
        />
      ) : (
        <>

          <ProductGrid bizId={bizId} products={products} businessName={business.name} joinUrl={`${siteUrl()}/s/${business.slug}`} />
          {products.length === 0 && (
            <EmptyState
              icon={<ShoppingBag className="size-6" aria-hidden />}
              title="Show what you sell"
              description="A photo or a short video of each product or service. It shows up in your customers' Explore, and you can share it on your WhatsApp status."
            />
          )}
        </>
      )}
    </div>
  );
}
