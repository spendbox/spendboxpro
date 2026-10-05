import type { Metadata } from "next";
import { ProductComposer } from "@/components/products/product-composer";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { categoryOptionsOf } from "@/lib/store-theme";

export const metadata: Metadata = { title: "Add a product or service" };

export default async function NewProductPage({ params }: PageProps<"/dashboard/[bizId]/products/new">) {
  const { bizId } = await params;
  const { business } = await requireOwnedBusiness(bizId);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PageHeader
        back={{ href: `/dashboard/${bizId}`, label: "Products & services" }}
        title="Add a product or service"
        description="It shows in your customers' Explore, and your partners' customers' too."
      />
      <ProductComposer bizId={bizId} businessName={business.name} joinUrl={`${siteUrl()}/s/${business.slug}`} categories={categoryOptionsOf(business)} />
    </div>
  );
}
