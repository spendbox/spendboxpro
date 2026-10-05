"use client";

import {
  PawPrint,
  Stethoscope,
  Baby,
  BookOpen,
  Briefcase,
  Brush,
  Building2,
  CakeSlice,
  Camera,
  Car,
  Check,
  ChefHat,
  ChevronRight,
  CupSoda,
  Crown,
  Droplet,
  Dumbbell,
  Flower2,
  Footprints,
  Gem,
  Gift,
  Glasses,
  GraduationCap,
  HeartPulse,
  Package,
  Palette,
  PartyPopper,
  PenTool,
  Pill,
  Plus,
  Ruler,
  Scissors,
  Search,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Sofa,
  SprayCan,
  Tag,
  Truck,
  Tv,
  UtensilsCrossed,
  WashingMachine,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { addProductCategory } from "@/app/dashboard/[bizId]/product-actions";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import {
  CATEGORIES,
  categoriesForBusiness,
  categoryInfo,
  PLACEMENTS,
  placementsFor,
  suggestCategories,
  type CategoryGroup,
  type CustomCategory,
  type Placement,
} from "@/lib/product-categories";
import { PlacementPreview } from "./placement-preview";

const ICONS: Record<string, LucideIcon> = {
  clothes: Shirt,
  fabrics: Scissors,
  shoes: Footprints,
  bags: ShoppingBag,
  jewellery: Gem,
  accessories: Glasses,
  hair: Crown,
  beauty: Droplet,
  perfumes: SprayCan,
  phones: Smartphone,
  electronics: Tv,
  home: Sofa,
  art: Palette,
  food: UtensilsCrossed,
  cakes: CakeSlice,
  drinks: CupSoda,
  groceries: ShoppingBasket,
  kids: Baby,
  books: BookOpen,
  health: Pill,
  pets: PawPrint,
  sports: Dumbbell,
  cars: Car,
  property: Building2,
  plants: Flower2,
  gifts: Gift,
  "other-products": Package,
  "hair-styling": Scissors,
  makeup: Brush,
  tailoring: Ruler,
  photography: Camera,
  events: PartyPopper,
  catering: ChefHat,
  cleaning: WashingMachine,
  repairs: Wrench,
  lessons: GraduationCap,
  "health-care": Stethoscope,
  fitness: HeartPulse,
  design: PenTool,
  delivery: Truck,
  "other-services": Briefcase,
};

export function CategoryIcon({ id, className }: { id: string; className?: string }) {
  const Icon = ICONS[id] ?? Tag;
  return <Icon className={className} aria-hidden />;
}

/** What the picker needs to know about the business. */
export interface CategoryOptions {
  bizId: string;
  businessCategories: string[];
  custom: CustomCategory[];
}

/** A business's categories, with any it adds while posting (shared by every product on the page). */
export function useCategoryOptions(initial: CategoryOptions) {
  const [custom, setCustom] = useState(initial.custom);
  const options = useMemo(() => ({ ...initial, custom }), [initial, custom]);
  const added = (c: CustomCategory) => setCustom((list) => (list.some((x) => x.id === c.id) ? list : [...list, c]));
  return { options, added };
}

type ProductWords = { title: string; description?: string | null; kind?: CategoryGroup | null };

/** The category a product gets: the one picked, or else the best suggestion for its words. */
export function chosenCategory(category: string | null | undefined, product: ProductWords, options: Pick<CategoryOptions, "businessCategories" | "custom">) {
  return category || suggestCategories(product, options)[0]!;
}

/**
 * The category field: shows the picked (or suggested) category, a few other
 * likely ones to tap, and opens a full list (a sheet on phones) with search
 * and "add your own".
 */
export function CategoryField({
  category,
  product,
  options,
  onChange,
  onAdded,
  label = "Category",
  compact = false,
}: {
  /** The picked category, or null to follow the suggestion. */
  category: string | null;
  product: ProductWords;
  options: CategoryOptions;
  onChange: (id: string) => void;
  onAdded: (c: CustomCategory) => void;
  label?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(() => suggestCategories(product, options), [product, options]);
  const value = category || suggestions[0]!;
  const info = categoryInfo(value, options.custom);
  const others = suggestions.filter((id) => id !== value && !id.startsWith("other-")).slice(0, compact ? 2 : 3);
  const suggested = !category && product.title.trim().length > 1;

  return (
    <div className="flex flex-col gap-2">
      {!compact && <span className="text-sm font-semibold">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label}: ${info.name}. Change`}
        className={cn("flex w-full items-center gap-3 rounded-2xl border border-line-strong bg-white text-left transition hover:border-brand-600", compact ? "h-11 px-2.5" : "h-14 px-3")}
      >
        <span className={cn("flex shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700", compact ? "size-7" : "size-9")}>
          <CategoryIcon id={info.id} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{info.name}</span>
          {!compact && <span className="block truncate text-xs text-muted">{suggested ? "Suggested from the name · tap to change" : PLACEMENTS.find((p) => p.id === info.placement)!.name + " in your 3D shop"}</span>}
        </span>
        {suggested && compact && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Suggested</span>}
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
      </button>
      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Or:</span>
          {others.map((id) => (
            <button key={id} type="button" onClick={() => onChange(id)} className="flex h-8 items-center gap-1.5 rounded-full bg-canvas px-3 text-xs font-semibold ring-1 ring-line hover:ring-brand-600">
              <CategoryIcon id={id} className="size-3.5" /> {categoryInfo(id, options.custom).name}
            </button>
          ))}
        </div>
      )}
      <CategorySheet
        open={open}
        onClose={() => setOpen(false)}
        value={value}
        suggestions={suggestions}
        options={options}
        onPick={(id) => {
          onChange(id);
          setOpen(false);
        }}
        onAdded={(c) => {
          onAdded(c);
          onChange(c.id);
          setOpen(false);
        }}
      />
    </div>
  );
}

/** The full list of categories, with search and "add your own". */
export function CategorySheet({
  open,
  onClose,
  value,
  suggestions = [],
  options,
  onPick,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  value: string | null;
  suggestions?: string[];
  options: CategoryOptions;
  onPick: (id: string) => void;
  onAdded: (c: CustomCategory) => void;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    if (q) {
      // Names that match, then categories whose words match (search "sneakers" finds Shoes).
      const byName = [...options.custom.map((c) => c.id), ...CATEGORIES.map((c) => c.id)].filter((id) => categoryInfo(id, options.custom).name.toLowerCase().includes(q));
      const byWords = suggestCategories({ title: q }, { custom: options.custom }).filter((id) => !id.startsWith("other-"));
      return [{ title: "Matches", ids: [...new Set([...byName, ...byWords])] }];
    }
    const top = suggestions.filter((id) => !id.startsWith("other-")).slice(0, 4);
    const forBusiness = categoriesForBusiness(options.businessCategories).filter((id) => !top.includes(id));
    return [
      { title: "Suggested", ids: top },
      { title: "Your categories", ids: options.custom.map((c) => c.id) },
      { title: "For your business", ids: forBusiness },
      { title: "Products", ids: CATEGORIES.filter((c) => c.group === "product").map((c) => c.id) },
      { title: "Services", ids: CATEGORIES.filter((c) => c.group === "service").map((c) => c.id) },
    ].filter((g) => g.ids.length);
  }, [q, suggestions, options]);

  return (
    <Modal open={open} onClose={onClose} title="Pick a category" description="Customers browse by it, and it groups your 3D shop.">
      <div className="flex flex-col gap-4">
        {/* The search stays at the top while the list scrolls under it (covering the sheet's top padding too). */}
        <div className="sticky -top-2 z-10 -mx-1 -mt-2 bg-white px-1 pt-2 pb-1">
          <label className="flex h-12 items-center gap-2 rounded-2xl bg-canvas px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-brand-600">
            <Search className="size-4 text-muted" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search, e.g. sneakers, cakes, braids" aria-label="Search categories" className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
          </label>
        </div>

        {groups.map((g) => (
          <section key={g.title} aria-label={g.title} className="flex flex-col gap-1">
            <h3 className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">{g.title}</h3>
            <ul className="flex flex-col">
              {g.ids.map((id) => {
                const info = categoryInfo(id, options.custom);
                const on = id === value;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onPick(id)}
                      aria-pressed={on}
                      className={cn("flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition", on ? "bg-brand-50" : "hover:bg-canvas")}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 ring-1 ring-line">
                        <CategoryIcon id={id} className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{info.name}</span>
                        <span className="block truncate text-xs text-muted">{PLACEMENTS.find((p) => p.id === info.placement)!.name}</span>
                      </span>
                      {on && <Check className="size-5 text-brand-700" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {q && groups[0]!.ids.length === 0 && <p className="px-1 text-sm text-muted">No category called that yet. Add it as your own below.</p>}

        {adding ? (
          <AddCategory bizId={options.bizId} initialName={query} onAdded={onAdded} onCancel={() => setAdding(false)} />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong font-semibold text-brand-700 hover:border-brand-600">
            <Plus className="size-4" aria-hidden /> Add your own category
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Where a category shows in the 3D shop: three pictures to choose from. */
export function PlacementChoice({
  value,
  onChange,
  images,
  accent,
  label = "Where it shows in your 3D shop",
  options = placementsFor(null),
}: {
  value: Placement;
  /** The choices (a 3D showroom only for vehicles). */
  options?: typeof PLACEMENTS;
  onChange: (p: Placement) => void;
  images?: string[];
  /** The shop's colour, for the shelves and tables in the pictures. */
  accent?: string;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", options.length > 3 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
      {options.map((p) => {
        const on = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={p.name}
            onClick={() => onChange(p.id)}
            className={cn("flex flex-col gap-1.5 rounded-2xl p-1.5 text-left ring-2 transition", on ? "bg-brand-50 ring-brand-600" : "ring-line hover:ring-line-strong")}
          >
            <PlacementPreview placement={p.id} images={images} accent={accent} />
            <span className="flex items-center gap-1 px-0.5 text-xs leading-tight font-semibold">
              {on && <Check className="size-3.5 shrink-0 text-brand-700" aria-hidden />}
              {p.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AddCategory({ bizId, initialName, onAdded, onCancel }: { bizId: string; initialName: string; onAdded: (c: CustomCategory) => void; onCancel: () => void }) {
  const [name, setName] = useState(initialName);
  const [placement, setPlacement] = useState<Placement>("shelf");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-canvas p-3 ring-1 ring-line">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={32}
        placeholder="e.g. Bridal sets"
        aria-label="New category name"
        className="h-12 rounded-xl border border-line-strong bg-white px-3 text-[16px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
      />
      <PlacementChoice value={placement} onChange={setPlacement} options={placementsFor(null, [], name)} />
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="h-11 flex-1 rounded-xl font-semibold ring-1 ring-line-strong">
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await addProductCategory(bizId, name, placement);
              if (r.ok) onAdded(r.category);
              else setError(r.error);
            })
          }
          className="h-11 flex-1 rounded-xl bg-brand-600 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add category"}
        </button>
      </div>
    </div>
  );
}
