"use client";

import { Check, Lamp, Sofa, Sprout } from "lucide-react";
import dynamic from "next/dynamic";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { saveStoreTheme } from "@/app/dashboard/[bizId]/store-actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { ACCENT_COLORS, FLOORS, THEMES, WALL_COLORS, readTheme, type StoreTheme } from "@/lib/store-theme";
import type { StoreProduct } from "@/lib/types";
import type { StoreViewBusiness } from "./store-view";

const StoreView = dynamic(() => import("./store-view"), {
  ssr: false,
  loading: () => <div className="flex size-full items-center justify-center rounded-3xl bg-ink text-sm font-semibold text-white/80">Building your store…</div>,
});

/** Lets a business choose and adjust its store theme, with a live 3D preview. */
export function StoreDesigner({ bizId, business, products, saved }: { bizId: string; business: StoreViewBusiness; products: StoreProduct[]; saved: unknown }) {
  const [theme, setTheme] = useState<StoreTheme>(() => readTheme(saved));
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  // The preview rebuilds a moment after a change, so tapping through colours stays smooth.
  const preview = useDeferredValue(theme);
  const previewTheme = useMemo(() => ({ ...preview }), [preview]);
  const set = (patch: Partial<StoreTheme>) => {
    setMessage(null);
    setTheme((t) => ({ ...t, ...patch }));
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
      <div className="aspect-[4/5] w-full overflow-hidden rounded-3xl shadow-lift sm:aspect-[4/3] lg:sticky lg:top-6">
        <StoreView business={business} theme={previewTheme} products={products} mode="embedded" />
      </div>

      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Theme</h2>
          <div className="grid grid-cols-2 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={theme.theme === t.id}
                onClick={() => set({ theme: t.id })}
                className={cn("rounded-2xl p-3 text-left ring-2 transition", theme.theme === t.id ? "bg-brand-50 ring-brand-600" : "bg-white ring-line")}
              >
                <span className="flex items-center justify-between font-semibold">
                  {t.name} {theme.theme === t.id && <Check className="size-4 text-brand-700" aria-hidden />}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{t.description}</span>
              </button>
            ))}
            <div className="flex flex-col justify-center rounded-2xl border-2 border-dashed border-line-strong p-3 text-xs text-muted">
              <span className="font-semibold text-ink-2">More themes soon</span>
              Lounges, salons, kitchens…
            </div>
          </div>
        </section>

        <Swatches label="Walls" colors={WALL_COLORS} value={theme.wall} onChange={(wall) => set({ wall })} />

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Accent</h2>
          <p className="-mt-1 text-xs text-muted">The counter, sofa, lamps and trim.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={theme.accent === null}
              onClick={() => set({ accent: null })}
              className={cn("h-9 rounded-full px-3 text-sm font-semibold ring-2", theme.accent === null ? "bg-brand-50 ring-brand-600" : "bg-white ring-line")}
            >
              <span className="mr-1.5 inline-block size-3 rounded-full align-[-1px]" style={{ background: business.brand_color }} />
              Brand colour
            </button>
            {ACCENT_COLORS.map((c) => (
              <ColorDot key={c} color={c} selected={theme.accent === c} onClick={() => set({ accent: c })} label={`Accent ${c}`} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Floor</h2>
          <div role="radiogroup" aria-label="Floor" className="flex flex-wrap gap-2">
            {FLOORS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={theme.floor === f.id}
                onClick={() => set({ floor: f.id })}
                className={cn("h-10 rounded-full px-4 text-sm font-semibold ring-2", theme.floor === f.id ? "bg-brand-50 ring-brand-600" : "bg-white ring-line")}
              >
                {f.label}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col divide-y divide-line rounded-2xl bg-white px-4 ring-1 ring-line">
          <Toggle icon={<Sofa className="size-4" aria-hidden />} label="Lounge corner" checked={theme.lounge} onChange={(lounge) => set({ lounge })} />
          <Toggle icon={<Sprout className="size-4" aria-hidden />} label="Plants" checked={theme.plants} onChange={(plants) => set({ plants })} />
          <Toggle icon={<Lamp className="size-4" aria-hidden />} label="Warm lights" checked={theme.lights === "warm"} onChange={(warm) => set({ lights: warm ? "warm" : "cool" })} />
        </section>

        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        <Button
          size="lg"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await saveStoreTheme(bizId, theme);
              setMessage(r.ok ? { tone: "success", text: "Saved. Your customers see the new look on their map." } : { tone: "error", text: r.error ?? "Couldn't save." });
            })
          }
        >
          Save my store
        </Button>
      </div>
    </div>
  );
}

function Swatches({ label, colors, value, onChange }: { label: string; colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">{label}</h2>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <ColorDot key={c} color={c} selected={value === c} onClick={() => onChange(c)} label={`${label} ${c}`} />
        ))}
      </div>
    </section>
  );
}

function ColorDot({ color, selected, onClick, label }: { color: string; selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn("flex size-9 items-center justify-center rounded-full ring-2 ring-offset-2 transition", selected ? "ring-brand-600" : "ring-transparent hover:ring-line-strong")}
      style={{ background: color, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)" }}
    >
      {selected && <Check className={cn("size-4", color === "#2F3A34" || ACCENT_COLORS.includes(color) ? "text-white" : "text-ink")} aria-hidden />}
    </button>
  );
}

function Toggle({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="flex size-8 items-center justify-center rounded-xl bg-canvas text-ink-2">{icon}</span>
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <Switch checked={checked} label={label} onChange={onChange} />
    </div>
  );
}
