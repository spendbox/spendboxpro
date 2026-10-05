"use client";

import { Paintbrush } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StoreViewBusiness } from "@/components/marketplace/store-view";
import { buttonClass } from "@/components/ui/button";
import { readTheme } from "@/lib/store-theme";
import type { StoreProduct } from "@/lib/types";

const StoreView = dynamic(() => import("@/components/marketplace/store-view"), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center rounded-3xl bg-ink text-white">
      <p className="animate-pulse-soft text-sm font-semibold">Opening your shop…</p>
    </div>
  ),
});

/** The business's own 3D shop on its home page: walk round it as customers do, with a button to edit it. */
export function HomeShop({ bizId, business, products, theme, shareUrl }: { bizId: string; business: StoreViewBusiness; products: StoreProduct[]; theme: unknown; shareUrl: string }) {
  const router = useRouter();
  const [full, setFull] = useState(false);
  const props = {
    business,
    theme: readTheme(theme),
    products,
    shareUrl,
    mode: "visit" as const,
    onOpenProduct: (id: string) => router.push(`/dashboard/${bizId}/products/${id}`),
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-4 h-[calc(100dvh-18rem)] min-h-[28rem] sm:mx-0 sm:h-[36rem]">
        {full ? <StoreView {...props} onClose={() => setFull(false)} /> : <StoreView {...props} inline onExpand={() => setFull(true)} />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">This is what customers see when they walk in. Each product stands on its own display.</p>
        <Link href={`/dashboard/${bizId}/settings/store?edit=1`} className={buttonClass({ variant: "secondary", size: "sm" })}>
          <Paintbrush className="size-4" aria-hidden /> Edit my shop
        </Link>
      </div>
    </div>
  );
}
