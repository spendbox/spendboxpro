"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateProducts } from "@/app/dashboard/[bizId]/product-actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { ProductKind } from "@/lib/types";
import { ProductThumb } from "./product-thumb";

export interface EditableProduct {
  id: string;
  kind: ProductKind;
  title: string;
  description: string;
  price: string;
  media_type: "image" | "video";
  media_url: string;
  poster_url: string | null;
}

const withCommas = (digits: string) => (digits ? Number(digits).toLocaleString("en-US") : "");
const digitsOf = (v: string) => v.replace(/\D/g, "").slice(0, 10);

/** Edit several products together: each one's fields, and "same for selected" values. */
export function BulkEditor({ bizId, products }: { bizId: string; products: EditableProduct[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(products.map((p) => ({ ...p, selected: true })));
  const [bulk, setBulk] = useState({ price: "", description: "", kind: "" as "" | ProductKind });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (id: string, patch: Partial<EditableProduct & { selected: boolean }>) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const selected = rows.filter((r) => r.selected);

  const apply = () =>
    setRows((list) =>
      list.map((r) =>
        r.selected ? { ...r, ...(bulk.price ? { price: bulk.price } : {}), ...(bulk.description.trim() ? { description: bulk.description } : {}), ...(bulk.kind ? { kind: bulk.kind } : {}) } : r,
      ),
    );

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const r = await updateProducts(
      bizId,
      rows.map((p) => ({ id: p.id, kind: p.kind, title: p.title, description: p.description, price: p.price })),
    );
    setSaving(false);
    setMessage(r.ok ? { ok: true, text: `Saved ${r.saved === 1 ? "it" : `all ${r.saved}`}.` } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  };

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Same for selected" className="flex flex-col gap-3 rounded-3xl bg-white p-4 ring-1 ring-line">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-4 accent-brand-600" checked={selected.length === rows.length} onChange={(e) => setRows((l) => l.map((r) => ({ ...r, selected: e.target.checked })))} />
            {selected.length === rows.length ? `All ${rows.length} selected` : `${selected.length} of ${rows.length} selected`}
          </label>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_1fr_auto_auto]">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold text-muted">₦</span>
            <input
              aria-label="Price for selected"
              inputMode="numeric"
              placeholder="Price"
              value={withCommas(bulk.price)}
              onChange={(e) => setBulk((b) => ({ ...b, price: digitsOf(e.target.value) }))}
              className="h-11 w-full rounded-xl border border-line-strong pr-3 pl-7 text-[15px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
            />
          </div>
          <input
            aria-label="Description for selected"
            placeholder="Description"
            maxLength={500}
            value={bulk.description}
            onChange={(e) => setBulk((b) => ({ ...b, description: e.target.value }))}
            className="h-11 rounded-xl border border-line-strong px-3 text-[15px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
          />
          <select aria-label="Product or service for selected" value={bulk.kind} onChange={(e) => setBulk((b) => ({ ...b, kind: e.target.value as "" | ProductKind }))} className="h-11 rounded-xl border border-line-strong bg-white px-3 text-[15px]">
            <option value="">Product or service</option>
            <option value="product">Products</option>
            <option value="service">Services</option>
          </select>
          <Button type="button" variant="dark" onClick={apply} disabled={!selected.length || (!bulk.price && !bulk.description.trim() && !bulk.kind)}>
            Apply to {selected.length}
          </Button>
        </div>
      </section>

      <ul className="flex flex-col gap-3" aria-label="Products">
        {rows.map((p, i) => (
          <li key={p.id} aria-label={p.title} className={cn("flex gap-3 rounded-3xl bg-white p-3 ring-1 sm:gap-4 sm:p-4", p.selected ? "ring-brand-300" : "ring-line")}>
            <div className="flex shrink-0 flex-col items-center gap-2">
              <ProductThumb mediaType={p.media_type} mediaUrl={p.media_url} posterUrl={p.poster_url} className="aspect-[4/5] w-20 rounded-2xl sm:w-24" />
              <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
                <input type="checkbox" className="size-4 accent-brand-600" checked={p.selected} onChange={(e) => set(p.id, { selected: e.target.checked })} />
                Select
              </label>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input
                aria-label={`Name of product ${i + 1}`}
                maxLength={80}
                value={p.title}
                onChange={(e) => set(p.id, { title: e.target.value })}
                className="h-11 rounded-xl border border-line-strong px-3 text-[15px] font-semibold outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
              />
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-36">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold text-muted">₦</span>
                  <input
                    aria-label={`Price of product ${i + 1}`}
                    inputMode="numeric"
                    placeholder="Ask for price"
                    value={withCommas(p.price)}
                    onChange={(e) => set(p.id, { price: digitsOf(e.target.value) })}
                    className="h-10 w-full rounded-xl border border-line-strong pr-3 pl-7 text-[15px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
                  />
                </div>
                <div role="radiogroup" aria-label={`Is product ${i + 1} a product or a service?`} className="flex rounded-full bg-canvas p-1 ring-1 ring-line">
                  {(["product", "service"] as const).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={p.kind === k} onClick={() => set(p.id, { kind: k })} className={cn("rounded-full px-3 py-1 text-xs font-semibold", p.kind === k ? "bg-white text-ink shadow-card" : "text-muted")}>
                      {k === "product" ? "Product" : "Service"}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                aria-label={`Description of product ${i + 1}`}
                rows={2}
                maxLength={500}
                placeholder="Description (optional)"
                value={p.description}
                onChange={(e) => set(p.id, { description: e.target.value })}
                className="rounded-xl border border-line-strong px-3 py-2 text-[15px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
              />
            </div>
          </li>
        ))}
      </ul>

      {message && (message.ok ? <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-brand-700"><Check className="size-4" aria-hidden /> {message.text}</p> : <FormMessage>{message.text}</FormMessage>)}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-10 lg:bottom-4">
        <Button size="lg" block onClick={() => void save()} loading={saving} className="shadow-lift">
          Save {rows.length === 1 ? "it" : `all ${rows.length}`}
        </Button>
      </div>
    </div>
  );
}
