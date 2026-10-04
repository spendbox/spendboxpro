import type { Metadata } from "next";
import { StoreDesigner } from "@/components/marketplace/store-designer";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { getBusinessProducts } from "@/lib/products";

export const metadata: Metadata = { title: "Your 3D store" };

export default async function StoreDesignPage({ params }: PageProps<"/dashboard/[bizId]/settings/store">) {
  const { bizId } = await params;
  const [{ business }, products] = await Promise.all([requireOwnedBusiness(bizId), getBusinessProducts(bizId)]);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        back={{ href: `/dashboard/${bizId}/settings`, label: "Settings" }}
        title="Your 3D store"
        description="Customers see your shop on their map and can walk in. Drag the preview to look around."
      />
      <StoreDesigner
        bizId={bizId}
        saved={business.store_theme}
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
          .map((p) => ({ id: p.id, title: p.title, price: p.price, currency: p.currency, media_type: p.media_type, media_url: p.media_url, poster_url: p.poster_url }))}
      />
    </div>
  );
}
