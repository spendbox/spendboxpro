import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductViewer } from "@/components/products/product-viewer";
import { requireUser } from "@/lib/auth";
import { getExplore, getMyBox } from "@/lib/products";

export const metadata: Metadata = { title: "Explore" };

/** Opens the full-screen viewer at one product, with the rest of the list (Explore or My box) to swipe through. */
export default async function ProductViewPage({ params, searchParams }: PageProps<"/me/p/[id]">) {
  const [{ id }, { from, q, b }] = await Promise.all([params, searchParams]);
  await requireUser(`/me/p/${id}`);
  const fromBox = from === "box";
  const query = typeof q === "string" ? q.trim().slice(0, 60) : "";
  // From a store: just that business's products, and back into the store.
  const businessId = typeof b === "string" && /^[0-9a-f-]{36}$/i.test(b) ? b : null;
  const all = fromBox ? await getMyBox() : await getExplore(businessId ? null : query || null);
  const products = businessId ? all.filter((p) => p.business_id === businessId) : all;
  const current = products.find((p) => p.id === id);
  if (!current) notFound();
  // Opened from a plug's page: back to its Products tab, or its 3D shop.
  const plug = `/me/b/${encodeURIComponent(current.business_slug)}`;
  const backHref = fromBox
    ? "/me/box"
    : businessId && from === "plug"
      ? plug
      : businessId && from === "plug3d"
        ? `${plug}?view=3d`
        : businessId
          ? `/me?store=${encodeURIComponent(current.business_slug)}`
          : query
            ? `/me?q=${encodeURIComponent(query)}`
            : "/me";
  return <ProductViewer products={products} startId={id} backHref={backHref} />;
}
