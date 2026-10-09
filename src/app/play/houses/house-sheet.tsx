"use client";

import { useEffect, useState } from "react";
import { Check, DoorOpen, House, LampDesk, LoaderCircle, Sofa, Speaker, UtensilsCrossed, Wine, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  DEFAULT_HOUSE,
  HOUSE_INTERIORS,
  HOUSE_NAME_MAX,
  HOUSE_STYLES,
  ROOF_COLOURS,
  WALL_COLOURS,
  cleanHouseName,
  type HouseDesign,
  type HouseInterior,
} from "@/lib/houses";
import { Sheet } from "../sheet";
import { playSfx } from "../sound";
import { HouseArt } from "./house-art";
import { getMyHouse, saveHouse, setHousePublished, type MyHouse } from "./house-actions";

// "My house": pick a style, paint it, choose the room inside and give it a name, then switch on
// "Show my house in the game" to have it stand in the busy middle of every new town.
// Free for now. Everything is checked again on the server.

const ROOM_ICONS: Record<HouseInterior, typeof Sofa> = {
  living: Sofa,
  lounge: Wine,
  studio: LampDesk,
  party: Speaker,
  dining: UtensilsCrossed,
};

const same = (a: HouseDesign, b: HouseDesign) =>
  a.name === b.name && a.style === b.style && a.wall === b.wall && a.roof === b.roof && a.interior === b.interior;

export function HouseSheet({ onClose, onVisit, standingNow }: { onClose: () => void; onVisit?: () => void; standingNow: boolean }) {
  const [house, setHouse] = useState<MyHouse | null>(null);
  const [draft, setDraft] = useState<HouseDesign>(DEFAULT_HOUSE);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    void getMyHouse().then((r) => {
      if (!live) return;
      if (!r.ok) return setLoadError(r.error);
      setLoadError(null);
      setHouse(r.house);
      setDraft(r.house.design);
    });
    return () => {
      live = false;
    };
  }, [tries]);

  const owner = house?.owner ?? "You";
  const name = cleanHouseName(draft.name);
  const changed = !house || !house.saved || !same({ ...draft, name }, house.design);
  const set = (patch: Partial<HouseDesign>) => {
    setSaved(false);
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  async function save() {
    if (saving || !changed) return;
    setSaving(true);
    setError(null);
    const r = await saveHouse({ ...draft, name });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      playSfx("denied");
      return;
    }
    setHouse(r.house);
    setDraft(r.house.design);
    setSaved(true);
    playSfx("found");
  }

  async function toggle() {
    if (!house || switching) return;
    if (!house.saved) return setError("Save your house first, then you can show it.");
    setSwitching(true);
    setError(null);
    const r = await setHousePublished(!house.published);
    setSwitching(false);
    if (!r.ok) {
      setError(r.error);
      playSfx("denied");
      return;
    }
    setHouse(r.house);
    playSfx("pop");
  }

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-[#7048e8] text-white">
          <House className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold leading-tight">My house</h2>
          <p className="text-xs text-muted">Free for now</p>
        </div>
        <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-panel-2" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>

      {loadError ? (
        <div className="mt-4 rounded-2xl bg-panel-2 p-4 text-center text-sm">
          <p>{loadError}</p>
          <button onClick={() => { setLoadError(null); setTries((t) => t + 1); }} className="mt-3 rounded-xl bg-ink px-4 py-2 font-semibold text-white">
            Try again
          </button>
        </div>
      ) : !house ? (
        <div className="mt-4 space-y-3" aria-busy>
          <div className="aspect-[320/210] w-full animate-pulse rounded-2xl bg-panel-2" />
          <div className="h-16 animate-pulse rounded-2xl bg-panel-2" />
          <div className="h-10 animate-pulse rounded-2xl bg-panel-2" />
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="overflow-hidden rounded-2xl border border-line">
            <HouseArt
              design={{ ...draft, name }}
              sign={name || `${owner}'s house`}
              signMuted={!name}
              className="block h-auto w-full"
              label={`${name || `${owner}'s house`}, a ${draft.style}`}
            />
          </div>

          <section>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">Style</h3>
            <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
              {HOUSE_STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => set({ style: s.id })}
                  aria-pressed={draft.style === s.id}
                  className={cn(
                    "w-[6.5rem] shrink-0 snap-start rounded-2xl border-2 bg-panel-2 p-1 text-left",
                    draft.style === s.id ? "border-[#7048e8]" : "border-transparent",
                  )}
                >
                  <HouseArt design={{ ...draft, style: s.id }} compact className="block h-auto w-full rounded-xl" label={s.label} />
                  <span className="mt-1 block px-1 text-sm font-semibold leading-tight">{s.label}</span>
                  <span className="block px-1 pb-0.5 text-[10px] leading-tight text-muted">{s.blurb}</span>
                </button>
              ))}
            </div>
          </section>

          <Swatches title="Walls" colours={WALL_COLOURS} value={draft.wall} onPick={(wall) => set({ wall })} />
          <Swatches title="Roof" colours={ROOF_COLOURS} value={draft.roof} onPick={(roof) => set({ roof })} />

          <section>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">Room inside</h3>
            <div className="grid grid-cols-2 gap-2">
              {HOUSE_INTERIORS.map((r) => {
                const Icon = ROOM_ICONS[r.id];
                const on = draft.interior === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => set({ interior: r.id })}
                    aria-pressed={on}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border-2 bg-panel-2 px-2.5 py-2 text-left",
                      on ? "border-[#7048e8]" : "border-transparent",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", on ? "text-[#7048e8]" : "text-muted")} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-tight">{r.label}</span>
                      <span className="block truncate text-[10px] text-muted">{r.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <label htmlFor="house-name" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">
              Name on the sign
            </label>
            <input
              id="house-name"
              value={draft.name}
              maxLength={HOUSE_NAME_MAX}
              onChange={(e) => set({ name: e.target.value.slice(0, HOUSE_NAME_MAX) })}
              placeholder={`${owner}'s house`}
              className="w-full rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-base outline-none focus:border-[#7048e8]"
            />
            <p className="mt-1 text-right text-[10px] text-muted">
              {draft.name.length}/{HOUSE_NAME_MAX}
            </p>
          </section>

          {error && <p className="rounded-xl bg-[#fff0f0] px-3 py-2 text-sm font-semibold text-[#c92a2a]">{error}</p>}

          <button
            onClick={save}
            disabled={saving || !changed}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3 font-semibold text-white disabled:opacity-60"
          >
            {saving ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Saving…
              </>
            ) : saved && !changed ? (
              <>
                <Check className="size-4" />
                Saved
              </>
            ) : house.saved && !changed ? (
              "No changes to save"
            ) : (
              "Save my house"
            )}
          </button>
          {house.saved && house.savesLeft <= 5 && (
            <p className="-mt-2 text-center text-[11px] text-muted">
              {house.savesLeft === 0 ? "No more changes today." : `${house.savesLeft} change${house.savesLeft === 1 ? "" : "s"} left today.`}
            </p>
          )}

          <section className="rounded-2xl bg-panel-2 p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">Show my house in the game</p>
                <p className="mt-1 text-xs text-ink/75">
                  Your house stands in the busiest part of every new town and adds {house.tilesPerHouse} more hiding spots. Switch it off and it
                  won&apos;t be in the next game.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={house.published}
                aria-label="Show my house in the game"
                onClick={toggle}
                disabled={switching}
                className={cn(
                  "relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60",
                  house.published ? "bg-[#7048e8]" : "bg-line",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 grid size-6 place-items-center rounded-full bg-white shadow transition-[left]",
                    house.published ? "left-[1.375rem]" : "left-0.5",
                  )}
                >
                  {switching && <LoaderCircle className="size-3.5 animate-spin text-muted" />}
                </span>
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {!house.saved
                ? "Save your house first, then switch it on."
                : house.published
                  ? standingNow || house.standing
                    ? "On. It's in this game, and it'll be in every new game until you switch it off."
                    : "On. Your house will appear when the next game starts."
                  : standingNow || house.standing
                    ? "Off. It stays in this game, and won't be in the next one."
                    : "Off. Free for now; switching off gives nothing back."}
            </p>
          </section>

          {(standingNow || house.standing) && onVisit && (
            <button
              onClick={onVisit}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#7048e8] py-3 font-semibold text-white"
            >
              <DoorOpen className="size-4" />
              Visit my house
            </button>
          )}
          {house.saved && (standingNow || house.standing) && house.published && (
            <p className="-mt-2 text-center text-[11px] text-muted">Changes to your design show from the next game.</p>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Swatches({ title, colours, value, onPick }: { title: string; colours: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {colours.map((c) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            aria-label={`${title} colour ${c}`}
            aria-pressed={value === c}
            className={cn(
              "grid size-8 place-items-center rounded-full border border-ink/15",
              value === c && "ring-2 ring-[#7048e8] ring-offset-2 ring-offset-panel",
            )}
            style={{ background: c }}
          >
            {value === c && <Check className="size-4" style={{ color: luminance(c) > 0.6 ? "#18202b" : "#ffffff" }} />}
          </button>
        ))}
      </div>
    </section>
  );
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
