"use client";

// The 3D avatar studio: design your look with a live 3D preview you can turn, then save it to your
// profile. Saves the recipe (lib/avatar3d/recipe.ts) with the nearest old 2D choices alongside it,
// for the places that still draw the flat portrait.

import { useEffect, useRef, useState } from "react";
import { Dices, X } from "@/components/icons";
import { type Avatar, recipeOf } from "@/lib/avatar";
import { OUTFITS, type Option } from "@/lib/avatar3d/catalog";
import { legacyFromRecipe } from "@/lib/avatar3d/legacy";
import { CATALOGS, type Recipe, type RecipeKey, encodeRecipe, randomRecipe } from "@/lib/avatar3d/recipe";
import { type Framing, type Viewer, createViewer } from "@/lib/avatar3d/viewer";
import { cn } from "@/lib/cn";
import { saveAvatar } from "./profile-actions";

type Tab = { id: string; label: string; framing: Framing; keys: [RecipeKey, string][] };
const TABS: Tab[] = [
  { id: "body", label: "Body", framing: "body", keys: [["frame", "Frame"], ["build", "Body type"], ["height", "Height"], ["skin", "Skin"], ["bust", "Bust"], ["butt", "Hips"]] },
  {
    id: "face", label: "Face", framing: "face",
    keys: [["face", "Face shape"], ["fat", "Fullness"], ["chin", "Chin"], ["eye", "Eyes"], ["eyeC", "Eye colour"], ["brow", "Brows"], ["nose", "Nose"], ["lips", "Lips"], ["lipT", "Lip colour"]],
  },
  { id: "hair", label: "Hair", framing: "face", keys: [["hair", "Hairstyle"], ["hairC", "Hair colour"], ["facial", "Facial hair"]] },
  {
    id: "outfit", label: "Outfit", framing: "body",
    keys: [["outfit", "Outfit"], ["topStyle", "Top"], ["top", "Top colour"], ["pattern", "Pattern"], ["bottomStyle", "Bottom"], ["bottom", "Bottom colour"]],
  },
  { id: "layer", label: "Jacket & shoes", framing: "body", keys: [["layer", "Jacket"], ["layerC", "Jacket colour"], ["shoes", "Shoes"], ["shoeC", "Shoe colour"]] },
  {
    id: "extras", label: "Extras", framing: "body",
    keys: [["hw", "Headwear"], ["hwC", "Headwear colour"], ["glasses", "Glasses"], ["ear", "Earrings"], ["pierce", "Piercings"], ["watch", "Watch"], ["chain", "Chain"], ["bg", "Background"]],
  },
];

/** Moves to try the look out in. */
const TRY: [string, string][] = [["idle", "Stand"], ["walk", "Walk"], ["wave", "Wave"], ["dance", "Dance"]];

export function AvatarStudio({ initial, onClose, onSaved }: { initial: Avatar; onClose: () => void; onSaved: () => void }) {
  const box = useRef<HTMLDivElement>(null), viewer = useRef<Viewer | null>(null);
  const [r, setR] = useState<Recipe>(() => recipeOf(initial));
  const [tab, setTab] = useState(TABS[0]);
  const [move, setMove] = useState("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [no3d, setNo3d] = useState(false);

  useEffect(() => {
    const v = createViewer(box.current!);
    if (!v) {
      setNo3d(true);
      return;
    }
    viewer.current = v;
    return () => {
      v.dispose();
      viewer.current = null;
    };
  }, []);
  useEffect(() => {
    viewer.current?.setRecipe(r);
  }, [r]);
  useEffect(() => {
    viewer.current?.setFraming(tab.framing);
  }, [tab]);
  useEffect(() => {
    viewer.current?.setMove(move);
  }, [move]);

  // Choosing a top or bottom switches a one-piece outfit (dress, robe, suit) to separates.
  const set = (k: RecipeKey, i: number) =>
    setR((cur) => ({ ...cur, [k]: i, ...((k === "topStyle" || k === "bottomStyle") && i && !OUTFITS[cur.outfit].sep ? { outfit: 0 } : {}) }));

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveAvatar({ ...initial, ...legacyFromRecipe(r), r3: encodeRecipe(r) });
    setBusy(false);
    if (res.ok) onSaved();
    else setError(res.error);
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-panel md:flex-row">
      <section className="relative h-[46dvh] shrink-0 bg-gradient-to-b from-slate-100 to-slate-300 md:h-auto md:flex-1">
        <div ref={box} className="h-full w-full" />
        {no3d && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm">This device can&apos;t show 3D. You can still choose your look.</p>}
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white/90 shadow">
          <X className="size-5" />
        </button>
        <div className="absolute bottom-3 left-3 right-3 flex gap-1.5 overflow-x-auto">
          {TRY.map(([id, n]) => (
            <button key={id} onClick={() => setMove(id)}
              className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold shadow", move === id ? "bg-ink text-white" : "bg-white/90")}>
              {n}
            </button>
          ))}
          <button onClick={() => setR(randomRecipe())} className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold shadow">
            <Dices className="size-4" /> Surprise me
          </button>
        </div>
      </section>
      <section className="flex min-h-0 flex-1 flex-col md:w-[26rem] md:flex-none">
        <div className="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2.5">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t)}
              className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", tab.id === t.id ? "bg-ink text-white" : "bg-panel-2")}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {tab.keys.map(([k, label]) => (
            <Choices key={k} label={label} list={CATALOGS[k] as readonly (Option & { c?: string })[]} value={r[k]} onPick={(i) => set(k, i)} />
          ))}
        </div>
        {error && <p className="px-4 text-sm text-hit">{error}</p>}
        <div className="flex gap-2 border-t border-line p-3">
          <button onClick={onClose} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">Cancel</button>
          <button onClick={save} disabled={busy} className="flex-1 rounded-xl bg-gold py-2.5 font-semibold disabled:opacity-50">
            {busy ? "Saving…" : "Save my look"}
          </button>
        </div>
      </section>
    </div>
  );
}

/** One choice: colour swatches, or named options. Retired options are not offered. */
function Choices({ label, list, value, onPick }: { label: string; list: readonly (Option & { c?: string })[]; value: number; onPick: (i: number) => void }) {
  const swatches = list.every((o) => o.c);
  return (
    <div className="mb-4">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {label} <span className="ml-1 font-normal normal-case tracking-normal text-ink">{list[value]?.n}</span>
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {list.map((o, i) =>
          o.retired ? null : swatches ? (
            <button key={o.id} onClick={() => onPick(i)} aria-label={o.n} title={o.n} aria-pressed={i === value}
              className={cn("size-8 rounded-full border-2 border-white", i === value ? "ring-2 ring-ink" : "ring-1 ring-line")} style={{ background: o.c }} />
          ) : (
            <button key={o.id} onClick={() => onPick(i)} aria-pressed={i === value}
              className={cn("rounded-lg border px-2.5 py-1 text-xs", i === value ? "border-ink bg-panel-2 font-semibold" : "border-line")}>
              {o.n}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
