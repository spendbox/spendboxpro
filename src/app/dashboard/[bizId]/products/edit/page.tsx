import type { Metadata } from "next";
import { BulkEditor } from "@/components/products/bulk-editor";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { getBusinessProducts } from "@/lib/products";

export const metadata: Metadata = { title: "Edit products" };

export default async function BulkEditPage({ params, searchParams }: PageProps<"/dashboard/[bizId]/products/edit">) {
  const [{ bizId }, { ids }] = await Promise.all([params, searchParams]);
  const [, all] = await Promise.all([requireOwnedBusiness(bizId), getBusinessProducts(bizId)]);
  const wanted = new Set(String(ids ?? "").split(",").filter(Boolean));
  const products = wanted.size ? all.filter((p) => wanted.has(p.id)) : all;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        back={{ href: `/dashboard/${bizId}`, label: "Products & services" }}
        title={products.length === 1 ? "Edit 1 product" : `Edit ${products.length} products`}
        description="Change names, prices and words (or set them for several together), then save them all at once."
      />
      <BulkEditor
        bizId={bizId}
        products={products.map((p) => ({
          id: p.id,
          kind: p.kind,
          title: p.title,
          description: p.description ?? "",
          price: p.price === null ? "" : String(p.price),
          media_type: p.media_type,
          media_url: p.media_url,
          poster_url: p.poster_url,
        }))}
      />
    </div>
  );
}
