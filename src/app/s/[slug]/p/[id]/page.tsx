import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BusinessAvatar } from "@/components/ui/avatar";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { formatMoney, whatsappLink } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { SharedStoreData } from "../../shared-store";

// One product from a business's shop, for links shared on WhatsApp: the
// link's preview shows the product's picture, name and price, and the page
// shows it with a way to chat or walk into the shop.

const loadStore = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_store", { p_slug: slug.slice(0, 80) });
  return (data as SharedStoreData | null) ?? null;
});

async function load(slug: string, id: string) {
  const store = await loadStore(slug);
  const product = store?.products.find((p) => p.id === id);
  return store && product ? { store, product } : null;
}

export async function generateMetadata({ params }: PageProps<"/s/[slug]/p/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const found = await load(slug, id);
  if (!found) return { title: "Product not found" };
  const { store, product } = found;
  const price = product.price != null ? formatMoney(product.price, product.currency) : "Ask for price";
  const picture = product.media_type === "video" ? product.poster_url : product.media_url;
  return {
    title: `${product.title} · ${store.name}`,
    description: `${price} at ${store.name} on Spendbox.`,
    openGraph: { title: product.title, description: `${price} · ${store.name}`, images: picture ? [picture] : undefined },
  };
}

export default async function SharedProductPage({ params }: PageProps<"/s/[slug]/p/[id]">) {
  const { slug, id } = await params;
  const found = await load(slug, id);
  if (!found) notFound();
  const { store, product } = found;
  const price = product.price != null ? formatMoney(product.price, product.currency) : "Ask for price";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Link href={`/s/${store.slug}`} className="flex items-center gap-2.5">
        <BusinessAvatar name={store.name} color={store.brand_color} logoUrl={store.logo_url} size="sm" />
        <span className="font-semibold">{store.name}</span>
      </Link>
      <div className="overflow-hidden rounded-3xl bg-ink">
        {product.media_type === "video" ? (
          <video src={product.media_url} poster={product.poster_url ?? undefined} controls playsInline className="aspect-[4/5] w-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.media_url} alt={product.title} className="aspect-[4/5] w-full object-cover" />
        )}
      </div>
      <div>
        <h1 className="font-display text-2xl font-bold">{product.title}</h1>
        <p className="mt-1 text-lg font-semibold text-brand-700">{price}</p>
        {product.description && <p className="mt-2 text-ink-2">{product.description}</p>}
      </div>
      <div className="mt-auto flex flex-col gap-2">
        {store.whatsapp && (
          <a href={whatsappLink(store.whatsapp, `Hi ${store.name}, I saw “${product.title}” on Spendbox. Is it available?`)} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#1FAF55] font-semibold text-white">
            <WhatsAppIcon className="size-5" /> Chat on WhatsApp
          </a>
        )}
        <Link href={`/s/${store.slug}`} className="flex h-12 items-center justify-center rounded-xl font-semibold ring-1 ring-line-strong">
          Walk into {store.name}
        </Link>
      </div>
    </main>
  );
}
