import { Bookmark, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductManager } from "@/components/products/product-manager";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, SectionTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { compactNumber } from "@/lib/business";
import { siteUrl } from "@/lib/env";
import { categoryOptionsOf } from "@/lib/store-theme";
import { memberNo } from "@/lib/format";
import { getBusinessProducts, getProductAudience } from "@/lib/products";
import { timeAgo } from "@/lib/requests";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: PageProps<"/dashboard/[bizId]/products/[productId]">) {
  const { bizId, productId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(productId)) notFound();
  const [{ business }, products, audience] = await Promise.all([requireOwnedBusiness(bizId), getBusinessProducts(bizId), getProductAudience(bizId, productId)]);
  const product = products.find((p) => p.id === productId);
  if (!product) notFound();

  const numbers = [
    { label: "Views", value: product.views },
    { label: "People", value: product.viewers },
    { label: "From partners", value: product.partner_viewers },
    { label: "Saves", value: product.likes },
    { label: "Got in touch", value: product.contacts },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader back={{ href: `/dashboard/${bizId}`, label: "Products & services" }} title={product.title} description={product.kind === "service" ? "Service" : "Product"} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:items-start">
        <div className="flex flex-col gap-4">
          <div className="mx-auto aspect-[4/5] w-full max-w-72 overflow-hidden rounded-3xl bg-ink shadow-card">
            {product.media_type === "video" ? (
              <video src={product.media_url} poster={product.poster_url ?? undefined} controls playsInline className="size-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- product media comes from Supabase Storage
              <img src={product.media_url} alt={product.title} className="size-full object-cover" />
            )}
          </div>
          <div className="grid grid-cols-5 gap-1.5 md:grid-cols-3">
            {numbers.map((n) => (
              <div key={n.label} className="rounded-2xl bg-white px-2 py-2.5 text-center ring-1 ring-line">
                <p className="text-lg font-semibold tabular">{compactNumber(n.value)}</p>
                <p className="text-[11px] leading-tight font-semibold text-muted">{n.label}</p>
              </div>
            ))}
          </div>
        </div>
        <ProductManager bizId={bizId} product={product} businessName={business.name} joinUrl={`${siteUrl()}/s/${business.slug}`} categories={categoryOptionsOf(business)} />
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle title="Who's interested" description="Everyone who viewed, saved or got in touch about this. First names only; full details follow each customer's sharing choice." />
        {audience.length === 0 ? (
          <EmptyState title="Nobody yet" description="Share it on your WhatsApp status to get eyes on it." />
        ) : (
          <Card className="divide-y divide-line">
            {audience.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {a.customer_name ?? "A customer"}
                    {a.member_no !== null && <span className="ml-1.5 text-sm font-normal text-muted">{memberNo(a.member_no)}</span>}
                  </span>
                  <span className="block text-xs text-muted">
                    {a.via_partner ? `${a.via_partner}'s customer` : a.member_no !== null ? "Your customer" : "Customer"}
                    {a.view_count ? ` · viewed ${a.view_count === 1 ? "once" : `${a.view_count} times`}` : ""}
                    {a.last_activity ? ` · ${timeAgo(a.last_activity)}` : ""}
                  </span>
                </span>
                {a.liked && (
                  <Badge tone="red">
                    <Bookmark className="size-3 fill-current" aria-hidden /> Saved
                  </Badge>
                )}
                {a.contacted && (
                  <Badge tone="green">
                    <MessageCircle className="size-3" aria-hidden /> {a.contacted.replace("whatsapp", "WhatsApp").replace("call", "Called").replace("email", "Email")}
                  </Badge>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
