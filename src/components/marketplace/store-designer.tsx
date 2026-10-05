"use client";

import { Maximize2, Paintbrush } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ShareLink } from "@/components/ui/share-actions";
import { readTheme, type StoreTheme } from "@/lib/store-theme";
import type { StoreProduct } from "@/lib/types";
import type { StoreViewBusiness } from "./store-view";

const StoreView = dynamic(() => import("./store-view"), {
  ssr: false,
  loading: () => <div className="flex size-full items-center justify-center rounded-3xl bg-ink text-sm font-semibold text-white/80">Building your shop…</div>,
});
const StoreEditor = dynamic(() => import("./store-editor").then((m) => m.StoreEditor), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink text-sm font-semibold text-white">Opening the editor…</div>,
});

/** The business's 3D shop: a preview, a button to edit it full screen, and a link to share it. */
export function StoreDesigner({
  bizId,
  business,
  products,
  saved,
  shareUrl,
  hasPerks,
  startEditing = false,
}: {
  bizId: string;
  /** Open straight into the editor (from the "Design your 3D shop" step). */
  startEditing?: boolean;
  business: StoreViewBusiness;
  products: StoreProduct[];
  saved: unknown;
  shareUrl: string;
  hasPerks: boolean;
}) {
  const [theme, setTheme] = useState<StoreTheme>(() => readTheme(saved));
  const [editing, setEditing] = useState(startEditing);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl shadow-lift sm:aspect-[16/10]">
        {!editing && <StoreView business={business} theme={theme} products={products} mode="preview" />}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/50 to-transparent p-4">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="pointer-events-auto flex h-12 items-center gap-2 rounded-full bg-white px-5 font-semibold text-ink shadow-lift active:scale-95"
          >
            <Maximize2 className="size-4" aria-hidden /> Edit my shop
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <Paintbrush className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold">Make it yours</h2>
              <p className="text-sm text-muted">
                Open the editor and tap anything: the welcome board, the backdrop, plants, table, rug, lights, wall art, floor, counter and colours. Every product gets its own display in the hall behind the counter (clothes on mannequins, food on tables, homes as model houses, videos on banners); tap one to change how it stands.
              </p>
            </div>
          </div>
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <div>
            <h2 className="font-semibold">Share your 3D shop</h2>
            <p className="text-sm text-muted">Anyone with this link can walk in, look around and join you.</p>
          </div>
          <ShareLink url={shareUrl} message={`Walk into ${business.name} on Spendbox:`} title={`${business.name} on Spendbox`} />
        </Card>
      </div>

      {editing && (
        <StoreEditor
          bizId={bizId}
          business={business}
          products={products}
          initial={theme}
          onClose={() => setEditing(false)}
          onSaved={setTheme}
          hasPerks={hasPerks}
        />
      )}
    </div>
  );
}
