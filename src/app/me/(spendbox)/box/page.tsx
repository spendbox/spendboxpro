import { Bookmark } from "lucide-react";
import type { Metadata } from "next";
import { ProductCircles } from "@/components/products/product-circles";
import { EmptyState } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getMyBox } from "@/lib/products";

export const metadata: Metadata = { title: "My box" };

export default async function MyBoxPage() {
  await requireUser("/me/box");
  const products = await getMyBox();
  return products.length === 0 ? (
    <EmptyState
      icon={<Bookmark className="size-6" aria-hidden />}
      title="Your box is empty"
      description="Tap Save on anything you love in Explore, and it waits for you here."
    />
  ) : (
    <ProductCircles products={products} hrefFor={(p) => `/me/p/${p.id}?from=box`} />
  );
}
