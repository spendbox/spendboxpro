"use client";

import { Armchair, ArrowRightLeft, Check, ChevronLeft, ChevronRight, Circle, Frame, Gift, Image as ImageIcon, ImagePlus, Lamp, LayoutGrid, LoaderCircle, MonitorPlay, Palette, PanelsTopLeft, Plus, Shirt, Sprout, Store, Trash2, Type, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { setProductCategory } from "@/app/dashboard/[bizId]/product-actions";
import { saveStoreTheme, uploadStoreArt } from "@/app/dashboard/[bizId]/store-actions";
import { CategoryIcon, CategorySheet, PlacementChoice } from "@/components/products/category-picker";
import { cn } from "@/lib/cn";
import { categoryInfo, customCategoryId, MAX_CUSTOM_CATEGORIES, PLACEMENTS, type CustomCategory, type Placement } from "@/lib/product-categories";
import { Switch } from "@/components/ui/switch";
import {
  ACCENT_COLORS,
  ART_PRESETS,
  BACK_CONSOLES,
  BACK_FEATURES,
  BACK_LIGHTS,
  BACKDROPS,
  BOARDS,
  FLOORS,
  LIGHT_STYLES,
  LIGHT_TONES,
  PLANT_SPOTS,
  PLANTS,
  POTS,
  RUG_COLORS,
  RUGS,
  TABLES,
  WALL_COLORS,
  type Art,
  type PlantSpot,
  type StoreTheme,
} from "@/lib/store-theme";
import { categoryOf, layoutHall, lookFrom, type Hall, type HallProduct } from "./three/store/hall";
import type { StoreApi } from "./three/store/look-controls";
import { businessTagline, type StoreBusiness, type StoreTarget } from "./three/store/pieces";
import StoreCanvas from "./three/store/store-canvas";

type Panel = "categories" | "backWall" | "board" | "backdrop" | "screen" | "table" | "rug" | "plants" | "lights" | "art" | "floor" | "counter" | "colours" | "gift";

const TOOLS: { id: Panel; label: string; icon: ReactNode }[] = [
  { id: "categories", label: "Categories", icon: <Shirt className="size-4" aria-hidden /> },
  { id: "backWall", label: "Back wall", icon: <Frame className="size-4" aria-hidden /> },
  { id: "board", label: "Welcome board", icon: <Type className="size-4" aria-hidden /> },
  { id: "backdrop", label: "Backdrop", icon: <PanelsTopLeft className="size-4" aria-hidden /> },
  { id: "table", label: "Table", icon: <Armchair className="size-4" aria-hidden /> },
  { id: "rug", label: "Rug", icon: <Circle className="size-4" aria-hidden /> },
  { id: "plants", label: "Plants", icon: <Sprout className="size-4" aria-hidden /> },
  { id: "lights", label: "Lights", icon: <Lamp className="size-4" aria-hidden /> },
  { id: "art", label: "Wall art", icon: <ImageIcon className="size-4" aria-hidden /> },
  { id: "floor", label: "Floor", icon: <LayoutGrid className="size-4" aria-hidden /> },
  { id: "counter", label: "Counter", icon: <Store className="size-4" aria-hidden /> },
  { id: "colours", label: "Colours", icon: <Palette className="size-4" aria-hidden /> },
  { id: "screen", label: "Screen", icon: <MonitorPlay className="size-4" aria-hidden /> },
];
const GIFT_TOOL = { id: "gift" as const, label: "Gift", icon: <Gift className="size-4" aria-hidden /> };

/** Where the camera turns for each thing (yaw: left -, right +; pitch: down -, up +). */
const SPOT_VIEW: Record<PlantSpot, [number, number]> = { backLeft: [-0.42, -0.08], backRight: [0.42, -0.08], front: [-0.95, -0.12], counter: [-0.2, -0.16] };
const PANEL_VIEW: Record<Exclude<Panel, "plants" | "categories" | "backWall">, [number, number]> = {
  board: [0, 0.12],
  backdrop: [0, 0.04],
  screen: [0, 0.02],
  table: [0.62, -0.14],
  rug: [0.62, -0.28],
  counter: [0, -0.16],
  gift: [0.1, -0.16],
  lights: [0, 0.12],
  art: [0.95, 0.02],
  floor: [0, -0.28],
  colours: [0, -0.04],
};

/** Shrinks a picture to at most 1400px on its longest side, as a JPEG. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("Could not read that picture.");
  return blob;
}

/**
 * The business's full-screen shop editor. Tap anything in the shop (or a tool
 * at the bottom) to change it; changes show straight away and are kept when
 * they press Save.
 */
export function StoreEditor({
  bizId,
  business,
  products,
  initial,
  onClose,
  onSaved,
  hasPerks = false,
}: {
  bizId: string;
  /** The business has perks, so a gift sits on the counter. */
  hasPerks?: boolean;
  business: StoreBusiness;
  products: HallProduct[];
  initial: StoreTheme;
  onClose: () => void;
  onSaved: (theme: StoreTheme) => void;
}) {
  const api = useRef<StoreApi | null>(null);
  const [theme, setTheme] = useState(initial);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [spot, setSpot] = useState<PlantSpot>("backLeft");
  const [artIndex, setArtIndex] = useState<0 | 1>(0);
  const [productId, setProductId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // Products moved to another category here (saved straight away), shown at once.
  const [moved, setMoved] = useState<Record<string, string>>({});
  const shown = useMemo(() => products.map((p) => (moved[p.id] ? { ...p, category: moved[p.id] } : p)), [products, moved]);
  const hall = useMemo(() => layoutHall(shown, theme.categories, business.categories), [shown, theme.categories, business.categories]);
  // After a change that moves sections, walk to this category once the hall is laid out again.
  const flyAfter = useRef<string | null>(null);
  useEffect(() => {
    const section = flyAfter.current && hall.sections.find((x) => x.key === flyAfter.current);
    flyAfter.current = null;
    if (section) api.current?.flyTo(section.view);
  }, [hall]);
  const walkTo = (id: string) => {
    const section = hall.sections.find((x) => x.key === id);
    if (section) api.current?.flyTo(section.view);
  };
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  const set = (patch: Partial<StoreTheme>) => {
    setDirty(true);
    setStatus(null);
    setTheme((t) => ({ ...t, ...patch }));
  };

  const open = (next: Panel, view?: [number, number]) => {
    setPanel(next);
    if (next === "backWall") {
      // Walk to the end of the hall, facing its far wall.
      const z = Math.max(hall.end - 7, 0);
      api.current?.flyTo({ x: 0, z, y: 1.7, ...lookFrom(0, 1.7, z, [0, 2.1, hall.end]) });
      return;
    }
    if (next === "categories") {
      // Walk over to the product (or the start of the hall).
      const item = hall.items.find((i) => i.product.id === productId);
      const v = item?.view ?? hall.sections[0]?.view;
      if (v) api.current?.flyTo(v);
      return;
    }
    const [yaw, pitch] = view ?? (next === "plants" ? SPOT_VIEW[spot] : PANEL_VIEW[next]);
    api.current?.home();
    api.current?.focus(yaw, pitch);
  };

  const pickProduct = (id: string) => {
    const item = hall.items.find((i) => i.product.id === id);
    setProductId(id);
    setCategoryId(item?.category ?? null);
    setPanel("categories");
    if (item) api.current?.flyTo(item.view);
  };

  /** Where a category shows (the usual place clears the choice). */
  const setPlacement = (id: string, placement: Placement) => {
    const usual = categoryInfo(id, theme.categories.custom).placement;
    const own = theme.categories.custom.find((c) => c.id === id);
    const placements = { ...theme.categories.placements };
    if (own || placement === categoryInfo(id).placement) delete placements[id];
    else placements[id] = placement;
    const custom = own ? theme.categories.custom.map((c) => (c.id === id ? { ...c, placement } : c)) : theme.categories.custom;
    if (usual !== placement || own) {
      flyAfter.current = id;
      set({ categories: { custom, placements } });
    } else walkTo(id);
  };

  const select = (target: StoreTarget) => {
    if (target.kind === "plant") {
      setSpot(target.spot);
      return open("plants", SPOT_VIEW[target.spot]);
    }
    if (target.kind === "art") {
      setArtIndex(target.index);
      return open("art");
    }
    if (target.kind === "walls") return open("colours");
    if (target.kind === "display") return pickProduct(target.id);
    if (target.kind === "product" || target.kind === "more" || target.kind === "bell" || target.kind === "partners") return;
    open(target.kind);
  };

  const close = () => {
    if (dirty && !window.confirm("Leave without saving your changes?")) return;
    onClose();
  };

  const save = () =>
    startSaving(async () => {
      const r = await saveStoreTheme(bizId, theme);
      if (r.ok) {
        setDirty(false);
        setStatus({ tone: "ok", text: "Saved. Customers see your new shop." });
        onSaved(theme);
      } else setStatus({ tone: "error", text: r.error ?? "Couldn't save." });
    });

  // Escape closes the panel, then the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (panel) setPanel(null);
      else if (!dirty || window.confirm("Leave without saving your changes?")) onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [panel, dirty, onClose]);

  const tool = [...TOOLS, GIFT_TOOL].find((t) => t.id === panel);

  return (
    <div role="dialog" aria-modal aria-label="Edit your shop" className="fixed inset-0 z-[80] h-dvh overflow-hidden bg-ink text-white">
      {/* With a panel open, the shop shrinks to the space above it (beside it on big screens), so what you're changing stays in view. */}
      <div className={cn("absolute inset-x-0 top-0", panel ? "bottom-[46dvh] lg:right-[396px] lg:bottom-0" : "bottom-0")}>
        <StoreCanvas business={business} theme={theme} products={products} onSelect={select} apiRef={api} editing hasGift={hasPerks} />
      </div>

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/50 to-transparent p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
        <button type="button" onClick={close} aria-label="Close the editor" className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur">
          <X className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold">Edit your shop</p>
          <p className="truncate text-xs text-white/80">{dirty ? "Unsaved changes" : "Tap anything to change it"}</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="pointer-events-auto flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-ink shadow-lift transition disabled:opacity-60"
        >
          {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
          {saving ? "Saving" : dirty ? "Save" : "Saved"}
        </button>
      </div>

      {status && (
        <p
          role="status"
          className={cn(
            "absolute top-20 left-1/2 z-10 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap shadow-lift",
            status.tone === "ok" ? "bg-white text-ink" : "bg-red-600 text-white",
          )}
        >
          {status.text}
        </p>
      )}

      {/* Tools, when no panel is open */}
      {!panel && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent pt-10 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div role="toolbar" aria-label="Change" className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:justify-center">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" onClick={() => open(t.id)} className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-ink shadow-lift active:scale-95">
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The panel: a sheet at the bottom on phones, a card on the right on big screens */}
      {panel && tool && (
        <section
          aria-label={tool.label}
          className="absolute inset-x-0 bottom-0 z-10 flex h-[46dvh] animate-fade-up flex-col rounded-t-3xl bg-white text-ink shadow-lift lg:inset-x-auto lg:top-20 lg:right-4 lg:bottom-4 lg:h-auto lg:w-[380px] lg:rounded-3xl"
        >
          <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <button type="button" onClick={() => setPanel(null)} aria-label="Back to tools" className="flex size-9 items-center justify-center rounded-full hover:bg-black/5">
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <span className="flex size-8 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{tool.icon}</span>
            <h2 className="flex-1 font-semibold">{tool.label}</h2>
          </header>
          <div className="flex flex-col gap-5 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {panel === "board" && (
              <>
                <Field label="Style">
                  <Choices label="Board style" value={theme.board.style} options={BOARDS.map((b) => ({ id: b.id, label: b.label, swatch: b.swatch }))} onChange={(style) => set({ board: { ...theme.board, style } })} />
                </Field>
                <Field label="Big words">
                  <input
                    value={theme.board.title}
                    maxLength={28}
                    onChange={(e) => set({ board: { ...theme.board, title: e.target.value } })}
                    placeholder="Welcome"
                    aria-label="Big words"
                    className="h-11 rounded-xl border border-line-strong px-3 text-[15px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
                  />
                </Field>
                <Field label="Small line">
                  <input
                    value={theme.board.subtitle}
                    maxLength={48}
                    onChange={(e) => set({ board: { ...theme.board, subtitle: e.target.value } })}
                    placeholder={businessTagline(business) || "e.g. Fresh cakes daily"}
                    aria-label="Small line"
                    className="h-11 rounded-xl border border-line-strong px-3 text-[15px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
                  />
                </Field>
              </>
            )}

            {panel === "categories" && (
              <CategoriesPanel
                bizId={bizId}
                hall={hall}
                products={shown}
                businessCategories={business.categories}
                cats={theme.categories}
                selected={categoryId}
                productId={productId}
                onSelect={(id) => {
                  setCategoryId(id);
                  setProductId(null);
                  if (id) walkTo(id);
                }}
                onPlacement={setPlacement}
                onAdd={(c) => {
                  set({ categories: { ...theme.categories, custom: [...theme.categories.custom, c] } });
                  setCategoryId(c.id);
                }}
                onRemove={(id) => {
                  const placements = { ...theme.categories.placements };
                  delete placements[id];
                  set({ categories: { custom: theme.categories.custom.filter((c) => c.id !== id), placements } });
                  setCategoryId(null);
                }}
                onMoved={(id, category) => {
                  flyAfter.current = category;
                  setMoved((m) => ({ ...m, [id]: category }));
                  setCategoryId(category);
                }}
              />
            )}

            {panel === "backWall" && (
              <>
                <Field label="Centrepiece">
                  <Choices label="Centrepiece" value={theme.backWall.feature} options={BACK_FEATURES.map((f) => ({ id: f.id, label: f.label, description: f.description }))} onChange={(feature) => set({ backWall: { ...theme.backWall, feature } })} cards />
                </Field>
                {theme.backWall.feature === "art" && <ArtPanel bizId={bizId} art={theme.backWall.art} onChange={(art) => set({ backWall: { ...theme.backWall, art } })} />}
                <Field label="Wall lights">
                  <Choices label="Wall lights" value={theme.backWall.lights} options={BACK_LIGHTS.map((l) => ({ id: l.id, label: l.label }))} onChange={(lights) => set({ backWall: { ...theme.backWall, lights } })} />
                </Field>
                <Field label="Under it">
                  <Choices label="Console table" value={theme.backWall.console} options={BACK_CONSOLES.map((c) => ({ id: c.id, label: c.label }))} onChange={(console) => set({ backWall: { ...theme.backWall, console } })} />
                </Field>
                <Field label="Corner plants">
                  <Choices label="Corner plants" value={theme.backWall.plants} options={PLANTS.map((p) => ({ id: p.id, label: p.label }))} onChange={(plants) => set({ backWall: { ...theme.backWall, plants } })} />
                </Field>
                {theme.backWall.plants !== "none" && (
                  <Field label={theme.backWall.plants === "flowers" || theme.backWall.plants === "pampas" ? "Vase" : "Pot"}>
                    <Dots label="Corner pot colour" value={theme.backWall.pot} options={POTS.map((p) => ({ id: p.id, label: p.label, color: p.color }))} onChange={(pot) => set({ backWall: { ...theme.backWall, pot } })} />
                  </Field>
                )}
              </>
            )}

            {panel === "backdrop" && (
              <Field label="Behind the screen">
                <Choices label="Backdrop" value={theme.backdrop} options={BACKDROPS.map((b) => ({ id: b.id, label: b.label, swatch: b.swatch }))} onChange={(backdrop) => set({ backdrop })} />
              </Field>
            )}

            {panel === "rug" && (
              <>
                <Field label="Pattern">
                  <Choices label="Rug pattern" value={theme.rug.style} options={RUGS.map((r) => ({ id: r.id, label: r.label }))} onChange={(style) => set({ rug: { ...theme.rug, style } })} />
                </Field>
                {theme.rug.style !== "none" && (
                  <Field label="Colour">
                    <Dots label="Rug colour" value={theme.rug.color} options={RUG_COLORS.map((c) => ({ id: c, label: c, color: c }))} onChange={(color) => set({ rug: { ...theme.rug, color } })} />
                  </Field>
                )}
              </>
            )}

            {panel === "counter" && (
              <>
                <div className="flex items-center gap-3 rounded-2xl bg-canvas p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">Your name on the counter</span>
                    <span className="block text-xs text-muted">Your logo and name on the front of the counter.</span>
                  </span>
                  <Switch checked={theme.counterName} label="Your name on the counter" onChange={(counterName) => set({ counterName })} />
                </div>
                <Field label="Counter colour" hint="The counter uses your accent colour.">
                  <Dots
                    label="Counter colour"
                    value={theme.accent ?? "brand"}
                    options={[{ id: "brand", label: "Brand colour", color: business.brand_color }, ...ACCENT_COLORS.map((c) => ({ id: c, label: `Accent ${c}`, color: c }))]}
                    onChange={(c) => set({ accent: c === "brand" ? null : c })}
                  />
                </Field>
              </>
            )}

            {panel === "gift" && (
              <div className="flex flex-col gap-3 text-sm text-ink-2">
                <p>Shoppers tap the gift on your counter to open it and see your perks, like your welcome gift.</p>
                <Link href={`/dashboard/${bizId}/perks`} className="flex h-11 items-center justify-center rounded-xl bg-brand-600 font-semibold text-white">
                  Change your perks
                </Link>
              </div>
            )}

            {panel === "screen" && (
              <div className="flex flex-col gap-3 text-sm text-ink-2">
                <p>The screen shows your logo, your name and your newest products. Shoppers tap a product to see it.</p>
                <Link href={`/dashboard/${bizId}`} className="flex h-11 items-center justify-center rounded-xl bg-brand-600 font-semibold text-white">
                  Add products
                </Link>
              </div>
            )}

            {panel === "table" && (
              <Field label="Table set">
                <Choices label="Table set" value={theme.table} options={TABLES.map((t) => ({ id: t.id, label: t.label, swatch: t.swatch, description: t.description }))} onChange={(table) => set({ table })} cards />
              </Field>
            )}

            {panel === "plants" && (
              <>
                <Field label="Which plant">
                  <Choices
                    label="Which plant"
                    value={spot}
                    options={PLANT_SPOTS.map((s) => ({ id: s.id, label: s.label }))}
                    onChange={(s) => {
                      setSpot(s);
                      api.current?.focus(...SPOT_VIEW[s]);
                    }}
                  />
                </Field>
                <Field label="Plant">
                  <Choices label="Plant" value={theme.plants[spot].kind} options={PLANTS.map((p) => ({ id: p.id, label: p.label }))} onChange={(kind) => set({ plants: { ...theme.plants, [spot]: { ...theme.plants[spot], kind } } })} />
                </Field>
                {theme.plants[spot].kind !== "none" && (
                  <Field label={theme.plants[spot].kind === "flowers" || theme.plants[spot].kind === "pampas" ? "Vase" : "Pot"}>
                    <Dots label="Pot colour" value={theme.plants[spot].pot} options={POTS.map((p) => ({ id: p.id, label: p.label, color: p.color }))} onChange={(pot) => set({ plants: { ...theme.plants, [spot]: { ...theme.plants[spot], pot } } })} />
                  </Field>
                )}
              </>
            )}

            {panel === "lights" && (
              <>
                <Field label="Lamps">
                  <Choices label="Lamps" value={theme.lights.style} options={LIGHT_STYLES.map((l) => ({ id: l.id, label: l.label }))} onChange={(style) => set({ lights: { ...theme.lights, style } })} />
                </Field>
                <Field label="Light colour">
                  <Choices label="Light colour" value={theme.lights.tone} options={LIGHT_TONES.map((t) => ({ id: t.id, label: t.label, swatch: [t.color, t.color] as [string, string] }))} onChange={(tone) => set({ lights: { ...theme.lights, tone } })} />
                </Field>
              </>
            )}

            {panel === "art" && (
              <ArtPanel
                bizId={bizId}
                index={artIndex}
                onIndex={setArtIndex}
                art={theme.art[artIndex]}
                onChange={(art) => {
                  const next = [...theme.art] as StoreTheme["art"];
                  next[artIndex] = art;
                  set({ art: next });
                }}
              />
            )}

            {panel === "floor" && (
              <>
                <Field label="Style">
                  <Choices
                    label="Floor style"
                    value={theme.floor.style}
                    options={FLOORS.map((f) => ({ id: f.id, label: f.label, swatch: [f.colors[0]!, f.colors[1]!] as [string, string] }))}
                    onChange={(style) => set({ floor: { style, color: FLOORS.find((f) => f.id === style)!.colors[0]! } })}
                  />
                </Field>
                <Field label="Colour">
                  <Dots
                    label="Floor colour"
                    value={theme.floor.color}
                    options={FLOORS.find((f) => f.id === theme.floor.style)!.colors.map((c) => ({ id: c, label: c, color: c }))}
                    onChange={(color) => set({ floor: { ...theme.floor, color } })}
                  />
                </Field>
              </>
            )}

            {panel === "colours" && (
              <>
                <Field label="Walls">
                  <Dots label="Wall colour" value={theme.wall} options={WALL_COLORS.map((c) => ({ id: c, label: `Walls ${c}`, color: c }))} onChange={(wall) => set({ wall })} />
                </Field>
                <Field label="Accent" hint="The counter, lamps, leather and trim.">
                  <Dots
                    label="Accent colour"
                    value={theme.accent ?? "brand"}
                    options={[{ id: "brand", label: "Brand colour", color: business.brand_color }, ...ACCENT_COLORS.map((c) => ({ id: c, label: `Accent ${c}`, color: c }))]}
                    onChange={(c) => set({ accent: c === "brand" ? null : c })}
                  />
                </Field>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function ArtPanel({ bizId, index, onIndex, art, onChange }: { bizId: string; index?: 0 | 1; onIndex?: (i: 0 | 1) => void; art: Art; onChange: (art: Art) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const upload = (file: File) =>
    startUpload(async () => {
      setError(null);
      try {
        const data = new FormData();
        data.append("art", await shrink(file), "art.jpg");
        const r = await uploadStoreArt(bizId, data);
        if (r.url) onChange({ kind: "image", url: r.url });
        else setError(r.error ?? "Couldn't upload that picture.");
      } catch {
        setError("We can't open that picture. Please use a PNG or JPG.");
      }
      if (input.current) input.current.value = "";
    });
  return (
    <>
      {index !== undefined && onIndex && (
      <Field label="Which picture">
        <Choices
          label="Which picture"
          value={String(index)}
          options={[
            { id: "0", label: "Left" },
            { id: "1", label: "Right" },
          ]}
          onChange={(i) => onIndex(i === "1" ? 1 : 0)}
        />
      </Field>
      )}
      <Field label="Prints">
        <Choices label="Print" value={art.kind === "preset" ? art.id : ""} options={ART_PRESETS.map((p) => ({ id: p.id, label: p.label }))} onChange={(id) => onChange({ kind: "preset", id })} />
      </Field>
      <Field label="Your own picture" hint="A photo of your shop, your team or your best work.">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading}
          className={cn("flex h-11 items-center justify-center gap-2 rounded-xl font-semibold ring-1 transition", art.kind === "image" ? "bg-brand-50 text-brand-800 ring-brand-600" : "ring-line-strong hover:bg-black/[0.03]")}
        >
          {uploading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
          {uploading ? "Uploading…" : art.kind === "image" ? "Change picture" : "Upload a picture"}
        </button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload a picture" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        {error && <p className="text-sm text-red-700">{error}</p>}
      </Field>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{label}</p>
      {hint && <p className="-mt-1.5 text-xs text-muted">{hint}</p>}
      {children}
    </div>
  );
}

/** Options as pills (or cards with a description), one picked. */
function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
  cards = false,
}: {
  label: string;
  value: T | string;
  options: { id: T; label: string; swatch?: [string, string]; description?: string }[];
  onChange: (id: T) => void;
  cards?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cards ? "grid grid-cols-1 gap-2" : "flex flex-wrap gap-2"}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "flex items-center gap-2 text-left text-sm font-semibold ring-2 transition",
              cards ? "rounded-2xl p-3" : "h-10 rounded-full pr-4 pl-3",
              !o.swatch && !cards && "pl-4",
              on ? "bg-brand-50 text-brand-900 ring-brand-600" : "bg-white ring-line hover:ring-line-strong",
            )}
          >
            {o.swatch && <span aria-hidden className={cn("shrink-0 rounded-full ring-1 ring-black/10", cards ? "size-9" : "size-5")} style={{ background: `linear-gradient(135deg, ${o.swatch[0]} 50%, ${o.swatch[1]} 50%)` }} />}
            <span className="min-w-0 flex-1">
              <span className="block">{o.label}</span>
              {o.description && <span className="block text-xs font-normal text-muted">{o.description}</span>}
            </span>
            {cards && on && <Check className="size-4 shrink-0 text-brand-700" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/** Colour dots, one picked. */
function Dots<T extends string>({ label, value, options, onChange }: { label: string; value: string; options: { id: T; label: string; color: string }[]; onChange: (id: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2.5">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            title={o.label}
            onClick={() => onChange(o.id)}
            className={cn("flex size-10 items-center justify-center rounded-full ring-2 ring-offset-2 transition", on ? "ring-brand-600" : "ring-transparent hover:ring-line-strong")}
            style={{ background: o.color, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)" }}
          >
            {on && <Check className="size-4 text-white mix-blend-difference" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/** A product's picture for thumbnails (a video's still frame). */
const thumbOf = (p: HallProduct) => (p.media_type === "video" ? p.poster_url : p.media_url) ?? undefined;

/**
 * The shop's categories: each is a section of the hall, shown framed on the
 * wall, on shelves or on tables (picked from pictures of each). Tapping a
 * product in the shop opens its category here, with a way to move it.
 */
function CategoriesPanel({
  bizId,
  hall,
  products,
  businessCategories,
  cats,
  selected,
  productId,
  onSelect,
  onPlacement,
  onAdd,
  onRemove,
  onMoved,
}: {
  bizId: string;
  hall: Hall;
  products: HallProduct[];
  businessCategories: string[];
  cats: StoreTheme["categories"];
  selected: string | null;
  productId: string | null;
  onSelect: (id: string | null) => void;
  onPlacement: (id: string, placement: Placement) => void;
  onAdd: (c: CustomCategory) => void;
  onRemove: (id: string) => void;
  onMoved: (productId: string, category: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inCategory = (id: string) => products.filter((p) => categoryOf(p, cats, businessCategories) === id);
  const product = products.find((p) => p.id === productId);
  // Categories with products (as laid out in the hall), then the business's own empty ones.
  const rows = [...hall.sections.map((x) => x.key), ...cats.custom.map((c) => c.id).filter((id) => !hall.sections.some((x) => x.key === id))];

  if (adding) return <NewCategory existing={cats.custom} onCancel={() => setAdding(false)} onAdd={(c) => (onAdd(c), setAdding(false))} />;

  if (selected) {
    const info = categoryInfo(selected, cats.custom, cats.placements);
    const items = inCategory(selected);
    const own = cats.custom.some((c) => c.id === selected);
    return (
      <div className="flex flex-col gap-4">
        <button type="button" onClick={() => onSelect(null)} className="-mt-1 flex w-fit items-center gap-1 text-sm font-semibold text-brand-700">
          <ChevronLeft className="size-4" aria-hidden /> All categories
        </button>
        {product && (
          <div className="flex items-center gap-3 rounded-2xl bg-canvas p-2.5 ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element -- product thumbnails from storage */}
            {thumbOf(product) ? <img src={thumbOf(product)} alt="" className="size-12 shrink-0 rounded-xl object-cover" /> : <span className="size-12 shrink-0 rounded-xl bg-line" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{product.title}</span>
              <span className="block truncate text-xs text-muted">In {info.name}</span>
            </span>
            <button type="button" onClick={() => setMoving(true)} disabled={pending} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold ring-1 ring-line-strong">
              {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <ArrowRightLeft className="size-3.5" aria-hidden />} Move
            </button>
          </div>
        )}
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <CategoryIcon id={selected} className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-bold">{info.name}</p>
            <p className="text-xs text-muted">{items.length === 1 ? "1 product" : `${items.length} products`}</p>
          </div>
        </div>
        <Field label="Where it shows" hint="Pick how this category looks in your shop. Nothing ever blocks anything else.">
          <PlacementChoice label="Where it shows" value={info.placement} onChange={(placement) => onPlacement(selected, placement)} images={items.map(thumbOf).filter((x): x is string => Boolean(x)).slice(0, 8)} />
        </Field>
        {own && items.length === 0 && (
          <button type="button" onClick={() => onRemove(selected)} className="flex h-11 items-center justify-center gap-2 rounded-xl font-semibold text-red-700 ring-1 ring-line-strong">
            <Trash2 className="size-4" aria-hidden /> Remove this category
          </button>
        )}
        {product && (
          <CategorySheet
            open={moving}
            onClose={() => setMoving(false)}
            value={selected}
            options={{ bizId, businessCategories, custom: cats.custom }}
            onPick={(category) => {
              setMoving(false);
              setError(null);
              start(async () => {
                const r = await setProductCategory(bizId, product.id, category);
                if (r.ok) onMoved(product.id, category);
                else setError(r.error);
              });
            }}
            onAdded={(c) => {
              setMoving(false);
              onAdd(c);
              start(async () => {
                const r = await setProductCategory(bizId, product.id, c.id);
                if (r.ok) onMoved(product.id, c.id);
                else setError(r.error);
              });
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">
        {products.length ? "Each category is a section of your shop. Tap one to choose how it shows: framed on the wall, on shelves or on tables." : "Add products and they appear in your shop as framed pictures, grouped by category."}
      </p>
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((id) => {
            const info = categoryInfo(id, cats.custom, cats.placements);
            const count = hall.sections.find((x) => x.key === id)?.count ?? 0;
            return (
              <li key={id}>
                <button type="button" onClick={() => onSelect(id)} className="flex w-full items-center gap-3 py-2.5 text-left" aria-label={`${info.name}: ${PLACEMENTS.find((p) => p.id === info.placement)!.name}`}>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <CategoryIcon id={id} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{info.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {count ? `${count} · ` : "No products yet · "}
                      {PLACEMENTS.find((p) => p.id === info.placement)!.name}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {cats.custom.length < MAX_CUSTOM_CATEGORIES && (
        <button type="button" onClick={() => setAdding(true)} className="flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong text-sm font-semibold text-brand-700">
          <Plus className="size-4" aria-hidden /> Add a category
        </button>
      )}
    </div>
  );
}

/** A new category of the business's own: its name and where it shows. */
function NewCategory({ existing, onAdd, onCancel }: { existing: CustomCategory[]; onAdd: (c: CustomCategory) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [placement, setPlacement] = useState<Placement>("shelf");
  const clean = name.replace(/\s+/g, " ").trim();
  const id = customCategoryId(clean);
  const taken = existing.some((c) => c.id === id);
  return (
    <div className="flex flex-col gap-4">
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          placeholder="e.g. Bridal sets"
          aria-label="Category name"
          className="h-11 rounded-xl border border-line-strong px-3 text-[16px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
        />
      </Field>
      <Field label="Where it shows">
        <PlacementChoice label="Where it shows" value={placement} onChange={setPlacement} />
      </Field>
      {taken && <p className="text-sm font-semibold text-red-700">You already have a category called that.</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="h-11 flex-1 rounded-xl font-semibold ring-1 ring-line-strong">
          Cancel
        </button>
        <button type="button" disabled={clean.length < 2 || taken} onClick={() => onAdd({ id, name: clean.slice(0, 32), placement })} className="h-11 flex-1 rounded-xl bg-brand-600 font-semibold text-white disabled:opacity-50">
          Add category
        </button>
      </div>
    </div>
  );
}
