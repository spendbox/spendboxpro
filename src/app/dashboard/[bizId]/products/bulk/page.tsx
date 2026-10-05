import type { Metadata } from "next";
import { BulkComposer } from "@/components/products/bulk-composer";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { categoryOptionsOf } from "@/lib/store-theme";

export const metadata: Metadata = { title: "Add many at once" };

export default async function BulkProductsPage({ params }: PageProps<"/dashboard/[bizId]/products/bulk">) {
  const { bizId } = await params;
  const { business } = await requireOwnedBusiness(bizId);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        back={{ href: `/dashboard/${bizId}`, label: "Products & services" }}
        title="Add many at once"
        description="Pick your photos and videos, name them (and set prices for several together), then post them all. Nothing shows until you press Post."
      />
      <BulkComposer bizId={bizId} businessName={business.name} joinUrl={`${siteUrl()}/s/${business.slug}`} categories={categoryOptionsOf(business)} />
    </div>
  );
}
