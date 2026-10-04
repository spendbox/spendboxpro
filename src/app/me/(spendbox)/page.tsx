import { PenLine, Search, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductCircles } from "@/components/products/product-circles";
import { EmptyState } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getExplore } from "@/lib/products";

export const metadata: Metadata = { title: "My Spendbox" };

export default async function ExplorePage({ searchParams }: PageProps<"/me">) {
  const [, { q }] = await Promise.all([requireUser("/me"), searchParams]);
  const query = typeof q === "string" ? q.trim().slice(0, 60) : "";
  const products = await getExplore(query || null);
  const unseen = products.filter((p) => !p.viewed).length;

  return (
    <div className="flex flex-col gap-5">
      <form action="/me" role="search" className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search, e.g. shoes, cake, braids"
          aria-label="Search products"
          enterKeyHint="search"
          className="h-12 w-full rounded-2xl border border-line-strong bg-white pr-4 pl-11 text-[15px] outline-none transition placeholder:text-subtle focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
        />
      </form>

      {products.length === 0 ? (
        query ? (
          <EmptyState
            icon={<Search className="size-6" aria-hidden />}
            title={`Nothing for “${query}” yet`}
            description="Ask your plugs for it instead. Post what you need with your budget, and they reach out."
            action={
              <Link href="/me/new" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white">
                <PenLine className="size-4" aria-hidden /> Ask for it
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={<Sparkles className="size-6" aria-hidden />}
            title="Nothing new yet"
            description="When your plugs (and the businesses they partner with) post products, they show up here, newest first."
          />
        )
      ) : (
        <>
          <p className="-mb-1 text-sm text-muted">
            {query ? `${products.length} for “${query}”` : unseen ? `${unseen} new to see` : "You've seen everything. Check back soon."}
          </p>
          <ProductCircles products={products} hrefFor={(p) => `/me/p/${p.id}${query ? `?q=${encodeURIComponent(query)}` : ""}`} />
        </>
      )}
    </div>
  );
}
