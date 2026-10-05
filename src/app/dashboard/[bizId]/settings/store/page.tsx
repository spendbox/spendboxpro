import type { Metadata } from "next";
import { StoreDesigner } from "@/components/marketplace/store-designer";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { getPerks } from "@/lib/business";
import { SIMPLE_PERK_KINDS } from "@/lib/perks";
import { getBusinessProducts } from "@/lib/products";

export const metadata: Metadata = { title: "Your 3D shop" };

export default async function StoreDesignPage({ params, searchParams }: PageProps<"/dashboard/[bizId]/settings/store">) {
  const [{ bizId }, { edit }] = await Promise.all([params, searchParams]);
  const [{ business }, products, perks] = await Promise.all([requireOwnedBusiness(bizId), getBusinessProducts(bizId), getPerks(bizId)]);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        back={{ href: `/dashboard/${bizId}/settings`, label: "Settings" }}
        title="Your 3D shop"
        description="Customers see your shop on their map and can walk in. Only you can change how it looks."
      />
      <StoreDesigner
        bizId={bizId}
        startEditing={edit === "1"}
        saved={business.store_theme}
        shareUrl={`${siteUrl()}/s/${business.slug}`}
        hasPerks={perks.some((p) => p.is_active && SIMPLE_PERK_KINDS.includes(p.kind))}
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
          .map((p) => ({ id: p.id, title: p.title, price: p.price, currency: p.currency, media_type: p.media_type, media_url: p.media_url, poster_url: p.poster_url, description: p.description, cutout_url: p.cutout_url }))}
      />
    </div>
  );
}
