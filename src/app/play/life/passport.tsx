"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import type { RegionMap } from "@/lib/world/compile";
import { passportOf, STAMP_LOOKS, type PassportPlace, type StampLook } from "@/lib/world/passport";
import type { PassportStampNews } from "@/lib/world/property-api";
import { cash } from "@/lib/world/value";
import { Confetti } from "../activities/ui";
import { myPassport } from "../property-actions";
import { Sheet } from "../sheet";
import { playSfx } from "../sound";

// The passport (docs/PASSPORT.md): every real place on the map you've gone into, as ink stamps on
// area pages, and the "new stamp" moment when you collect one. The places come from the map the
// phone already has (src/lib/world/passport.ts); only your stamps are fetched.

/** A steady little tilt for each stamp (so a page looks stamped by hand, the same every time). */
function tiltOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 21) + 21) % 21 - 10;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const dateOf = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** An ink stamp: a ring with the place's name round the top and the date round the bottom; faded until you've been. */
export function Stamp({ place, at, size = 92 }: { place: { id: string; name: string; look: StampLook | string }; at: string | null; size?: number }) {
  const look = STAMP_LOOKS[place.look as StampLook] ?? STAMP_LOOKS.landmark;
  // Round the top of the ring: the name up to any comma or brackets, the letters smaller the longer it is.
  const name = place.name.split(",")[0].replace(/\s*\(.*?\)\s*/g, " ").trim().toUpperCase();
  const top = name.length > 30 ? `${name.slice(0, 29)}…` : name;
  const fs = Math.min(7.5, 104 / (top.length * 0.72));
  const pid = `p-${place.id.replace(/[^a-z0-9]/gi, "")}-${size}`;
  if (!at)
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} aria-label={`${place.name}: not visited yet`} className="shrink-0">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#adb5bd" strokeWidth="1.6" strokeDasharray="4 4" />
        <text x="50" y="58" textAnchor="middle" fontSize="26" fontWeight="800" fill="#ced4da" fontFamily="system-ui">
          ?
        </text>
      </svg>
    );
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-label={`${place.name}, visited ${dateOf(at)}`} className="shrink-0" style={{ transform: `rotate(${tiltOf(place.id)}deg)` }}>
      <defs>
        <path id={`${pid}-t`} d="M 14 50 A 36 36 0 0 1 86 50" />
        <path id={`${pid}-b`} d="M 20 54 A 30 30 0 0 0 80 54" />
      </defs>
      <g opacity="0.9">
        <circle cx="50" cy="50" r="46" fill="none" stroke={look.color} strokeWidth="3" />
        <circle cx="50" cy="50" r="41.5" fill="none" stroke={look.color} strokeWidth="1" />
        <circle cx="50" cy="50" r="22" fill={look.color} fillOpacity="0.1" stroke={look.color} strokeWidth="1.2" />
        <text fontSize={fs} fontWeight="800" fill={look.color} letterSpacing={fs > 6 ? 0.6 : 0.2} fontFamily="system-ui">
          <textPath href={`#${pid}-t`} startOffset="50%" textAnchor="middle">
            {top}
          </textPath>
        </text>
        <text fontSize="6.5" fontWeight="700" fill={look.color} letterSpacing="1" fontFamily="system-ui">
          <textPath href={`#${pid}-b`} startOffset="50%" textAnchor="middle">
            {`★ ${dateOf(at)} ★`}
          </textPath>
        </text>
        <text x="50" y="58" textAnchor="middle" fontSize="22">
          {look.sign}
        </text>
      </g>
    </svg>
  );
}

/** Your passport: progress, then each area page with its stamps. Tap a stamp to see it on the map. */
export function PassportSheet({ map, onClose, onShow }: { map: RegionMap; onClose: () => void; onShow: (x: number, z: number) => void }) {
  const passport = useMemo(() => passportOf(map), [map]);
  const [mine, setMine] = useState<{ stamps: Map<string, string>; areas: Set<string> } | null | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<PassportPlace | null>(null);
  const [only, setOnly] = useState<"all" | "visited" | "todo">("all");
  useEffect(() => {
    let alive = true;
    void myPassport(map.region.id)
      .then((r) => alive && setMine(r ? { stamps: new Map(r.stamps.map((s) => [s.place, s.at])), areas: new Set(r.areas) } : null))
      .catch(() => alive && setMine(null));
    return () => {
      alive = false;
    };
  }, [map]);
  const count = mine ? passport.places.filter((p) => mine.stamps.has(p.id)).length : 0;
  const total = passport.places.length;
  const pagesDone = mine ? passport.areas.filter((a) => a.ids.every((id) => mine.stamps.has(id))).length : 0;
  // The page with the most stamps still to get opens first (unless you pick one).
  const firstOpen = open ?? passport.areas[0]?.name ?? null;

  if (picked) {
    const at = mine?.stamps.get(picked.id) ?? null;
    return (
      <Sheet onClose={onClose} title="Passport">
        <button onClick={() => setPicked(null)} className="text-sm font-semibold text-muted">
          ‹ Back to the passport
        </button>
        <div className="mt-3 flex flex-col items-center rounded-3xl bg-[#fffdf6] p-5 text-center ring-1 ring-ink/5">
          <Stamp place={picked} at={at} size={160} />
          <p className="mt-3 font-display text-xl font-extrabold leading-tight">{picked.name}</p>
          <p className="mt-1 text-sm text-muted">
            {picked.what} · {picked.area}
          </p>
          <p className="mt-2 text-sm font-semibold">{at ? `You visited on ${new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.` : "Not visited yet. Go inside to get its stamp."}</p>
          <button
            onClick={() => {
              onClose();
              onShow(picked.x, picked.z);
            }}
            className="mt-4 flex h-11 items-center gap-1.5 rounded-full bg-ink px-5 text-sm font-bold text-white"
          >
            <MapPin className="size-4" /> Show it on the map
          </button>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet onClose={onClose} title="Passport">
      {/* The cover */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b6b3a] via-[#0a5a32] to-[#063d22] p-4 text-white shadow-lg">
        <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 size-32 rounded-full border-[10px] border-[#d4af37]/20" />
        <span aria-hidden className="pointer-events-none absolute -bottom-10 -left-8 size-36 rounded-full border-[12px] border-[#d4af37]/10" />
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#f1d98a]">Newtown</p>
        <p className="font-display text-2xl font-black italic leading-tight text-[#f7e7a8]">{map.region.name} Passport</p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-4xl font-black tabular-nums leading-none">
              {mine === undefined ? "…" : count}
              <span className="text-lg font-bold text-white/60"> / {total}</span>
            </p>
            <p className="mt-1 text-xs text-white/70">places visited · {pagesDone} of {passport.areas.length} areas complete</p>
          </div>
          <span className="grid size-14 place-items-center rounded-full border-2 border-[#d4af37] text-2xl shadow-inner" aria-hidden>
            🦅
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-gradient-to-r from-[#f1d98a] to-[#d4af37] transition-[width] duration-700" style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Go into any landmark, named place or railway station to get its stamp. Every new stamp pays a little, and completing an area pays a bonus.</p>
      {mine === null && <p className="mt-2 rounded-2xl bg-ink/5 p-3 text-sm text-muted">Your passport is switched on soon.</p>}

      <div className="mt-3 flex gap-1.5" role="radiogroup" aria-label="Show">
        {(
          [
            ["all", "All"],
            ["visited", "Visited"],
            ["todo", "Still to visit"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="radio" aria-checked={only === k} onClick={() => setOnly(k)} className={cn("h-8 rounded-full px-3 text-xs font-semibold", only === k ? "bg-ink text-white" : "bg-ink/5")}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {passport.areas.map((a) => {
          const got = mine ? a.ids.filter((id) => mine.stamps.has(id)).length : 0;
          const done = got === a.ids.length;
          const shown = a.ids.map((id) => passport.byId.get(id)!).filter((p) => (only === "all" ? true : only === "visited" ? mine?.stamps.has(p.id) : !mine?.stamps.has(p.id)));
          if (!shown.length) return null;
          const isOpen = firstOpen === a.name;
          return (
            <section key={a.name} className={cn("overflow-hidden rounded-2xl ring-1", done ? "bg-[#fff9e6] ring-[#d4af37]/50" : "bg-panel ring-ink/5")}>
              <button onClick={() => setOpen(isOpen ? "" : a.name)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left" aria-expanded={isOpen}>
                <span className="min-w-0 flex-1">
                  <b className="block text-sm">
                    {a.name} {done && <span className="ml-1 rounded-full bg-[#d4af37] px-1.5 py-0.5 text-[10px] font-bold text-white">Complete ✓</span>}
                  </b>
                  <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-ink/10">
                    <span className="block h-full rounded-full bg-[#0b6b3a]" style={{ width: `${(got / a.ids.length) * 100}%` }} />
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
                  {got}/{a.ids.length}
                </span>
                <ChevronDown className={cn("size-4 shrink-0 text-muted transition", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                // A page: cream paper, stamps in a grid.
                <div className="grid grid-cols-3 gap-x-1 gap-y-2 border-t border-ink/5 bg-[#fffdf6] bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.035)_1px,transparent_0)] bg-[length:10px_10px] px-2 py-3">
                  {shown.map((p) => (
                    <button key={p.id} onClick={() => setPicked(p)} className="flex flex-col items-center gap-1 rounded-xl p-1 text-center active:scale-95" aria-label={p.name}>
                      <Stamp place={p} at={mine?.stamps.get(p.id) ?? null} size={84} />
                      <span className={cn("line-clamp-2 text-[10px] font-semibold leading-tight", mine?.stamps.has(p.id) ? "text-ink" : "text-muted")}>{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

    </Sheet>
  );
}

/** "New stamp!": the stamp thuds down, with what it paid and how far through the passport you are. Tap to open it. */
export function StampPop({ news, onOpen, onClose }: { news: PassportStampNews; onOpen: () => void; onClose: () => void }) {
  const [today] = useState(() => new Date().toISOString());
  useEffect(() => {
    playSfx(news.areaDone ? "levelup" : "chime");
    const t = setTimeout(onClose, news.areaDone ? 6500 : 4500);
    return () => clearTimeout(t);
  }, [news, onClose]);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-[85] flex justify-center px-4">
      {news.areaDone && <Confetti count={40} />}
      <button onClick={onOpen} className="stamp-card pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-3xl bg-[#fffdf6] p-3 text-left shadow-2xl ring-2 ring-[#d4af37]/60">
        <span className="stamp-thud">
          <Stamp place={news} at={today} size={84} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#0b6b3a]">New passport stamp</span>
          <b className="block font-display text-lg leading-tight">{news.name}</b>
          <span className="mt-0.5 block text-xs text-muted">
            {news.paid > 0 ? `+${cash(news.paid)} · ` : ""}
            {news.count} of {news.total} places
          </span>
          {news.areaDone && (
            <span className="mt-1 block rounded-xl bg-[#d4af37]/20 px-2 py-1 text-xs font-bold text-[#7a5a00]">
              🎉 {news.areaDone.name} complete! <span className="whitespace-nowrap">+{cash(news.areaDone.paid)}</span>
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
