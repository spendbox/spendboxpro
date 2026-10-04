import Link from "next/link";
import { cn } from "@/lib/cn";
import type { FeedProduct } from "@/lib/types";
import { ProductThumb } from "./product-thumb";

/**
 * Products as small round pictures, newest first. A bright ring means not
 * seen yet; a quiet one means seen. No names: tap to open.
 */
export function ProductCircles({ products, hrefFor }: { products: FeedProduct[]; hrefFor: (p: FeedProduct) => string }) {
  return (
    <ul className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-5 sm:gap-x-4">
      {products.map((p) => (
        <li key={p.id}>
          <Link
            href={hrefFor(p)}
            aria-label={`${p.title} from ${p.business_name}${p.viewed ? "" : " (new)"}`}
            className={cn(
              "block aspect-square rounded-full p-[3px] transition active:scale-95",
              p.viewed ? "bg-line" : "bg-gradient-to-tr from-brand-500 via-brand-400 to-accent-500",
            )}
          >
            <span className="block size-full rounded-full bg-canvas p-[2px]">
              <ProductThumb mediaType={p.media_type} mediaUrl={p.media_url} posterUrl={p.poster_url} showPlay={false} className="size-full rounded-full" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
