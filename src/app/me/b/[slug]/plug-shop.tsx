"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StorePartner, StoreViewBusiness } from "@/components/marketplace/store-view";
import type { ShopPerk } from "@/lib/actions/shop";
import type { StoreTheme } from "@/lib/store-theme";
import type { StoreProduct } from "@/lib/types";

const StoreView = dynamic(() => import("@/components/marketplace/store-view"), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center rounded-3xl bg-ink text-white">
      <p className="animate-pulse-soft text-sm font-semibold">Walking in…</p>
    </div>
  ),
});

/** A plug's 3D shop inside its page, with a button to go full screen. */
export function PlugShop({
  business,
  theme,
  products,
  perks,
  currency,
  partners,
  shareUrl,
}: {
  business: StoreViewBusiness;
  theme: StoreTheme;
  products: StoreProduct[];
  perks: ShopPerk[];
  currency: string;
  partners: StorePartner[];
  shareUrl: string;
}) {
  const router = useRouter();
  const [full, setFull] = useState(false);
  const props = {
    business,
    theme,
    products,
    perks,
    currency,
    partners,
    shareUrl,
    mode: "visit" as const,
    onOpenProduct: (id: string) => router.push(`/me/p/${id}?b=${business.id}&from=plug3d`),
  };
  return (
    <div className="-mx-4 h-[calc(100dvh-16rem)] min-h-[28rem] sm:mx-0 sm:h-[36rem]">
      {full ? (
        <StoreView {...props} onClose={() => setFull(false)} />
      ) : (
        <StoreView {...props} inline onExpand={() => setFull(true)} />
      )}
    </div>
  );
}
