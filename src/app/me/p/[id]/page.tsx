import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductViewer } from "@/components/products/product-viewer";
import { requireUser } from "@/lib/auth";
import { getExplore, getMyBox } from "@/lib/products";

export const metadata: Metadata = { title: "Explore" };

/** Opens the full-screen viewer at one product, with the rest of the list (Explore or My box) to swipe through. */
export default async function ProductViewPage({ params, searchParams }: PageProps<"/me/p/[id]">) {
  const [{ id }, { from, q }] = await Promise.all([params, searchParams]);
  await requireUser(`/me/p/${id}`);
  const fromBox = from === "box";
  const query = typeof q === "string" ? q.trim().slice(0, 60) : "";
  const products = fromBox ? await getMyBox() : await getExplore(query || null);
  if (!products.some((p) => p.id === id)) notFound();
  const backHref = fromBox ? "/me/box" : query ? `/me?q=${encodeURIComponent(query)}` : "/me";
  return <ProductViewer products={products} startId={id} backHref={backHref} />;
}
