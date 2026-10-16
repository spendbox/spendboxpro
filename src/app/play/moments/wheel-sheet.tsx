"use client";

import { useEffect, useMemo, useState } from "react";
import { AvatarFace } from "@/components/avatar";
import { X } from "@/components/icons";
import type { Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { EFFECTS, LIFE_AREAS, MOMENT_BY_ID, areaOf, fillMoment, type LifeArea, type MomentDef } from "@/lib/world/moments";
import { CAST_BY_ID, feelingWord } from "@/lib/world/cast";
import { cash } from "@/lib/world/value";
import { myWheel, type Wheel, type WheelMoment } from "../moment-actions";
import { Sheet } from "../sheet";

// My life (docs/LIFE_WHEEL.md): your life drawn as a ring. Every moment you've lived is a notch,
// newest at the top and going round clockwise, coloured by the part of life it touched and as long
// as it was big. Notches that glow started a story that's still going. In the middle, who you're
// becoming, in words. Tap a notch to read what happened, what you chose and what came of it later.

const R = 150;
const SLOTS_MIN = 40;

function when(at: string) {
  const d = new Date(at);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days < 1 && new Date().getDate() === d.getDate()) return `Today, ${hm}`;
  if (days < 2) return `Yesterday, ${hm}`;
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/** What was filled into a moment (missing parts left blank). */
const varsOf = (m: WheelMoment) => ({ name: m.vars.name ?? "", ask: Number(m.vars.ask) || 0, place: m.vars.place ?? "" });

function left(until: string) {
  const h = Math.max(0, (Date.parse(until) - Date.now()) / 3_600_000);
  return h >= 48 ? `${Math.round(h / 24)} days left` : h >= 1 ? `${Math.round(h)} h left` : "ending soon";
}

export function WheelSheet({ avatar, onClose }: { avatar: Avatar; onClose: () => void }) {
  const [wheel, setWheel] = useState<Wheel | null | undefined>(undefined);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    myWheel()
      .catch(() => null)
      .then((w) => {
        if (!live) return;
        setWheel(w);
        setPicked(w?.moments.find((m) => MOMENT_BY_ID.has(m.moment))?.id ?? null);
      });
    return () => {
      live = false;
    };
  }, []);

  // Only moments the game still knows (one taken out of the game is left off).
  const lived = useMemo(() => (wheel?.moments ?? []).filter((m) => MOMENT_BY_ID.has(m.moment)), [wheel]);
  const byId = useMemo(() => new Map(lived.map((m) => [m.id, m])), [lived]);
  const going = lived.filter((m) => m.going);
  const storyCount = going.length + (wheel?.stories.length ?? 0);
  const naira = (v: number) => cash(v / (wheel?.perMint ?? 1500));

  return (
    <Sheet onClose={onClose} above>
      <div className="sticky -top-5 z-10 -mr-2 -mt-2 flex h-0 justify-end">
        <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-ink/5 hover:bg-ink/10" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <div className="pr-10">
        <h2 className="font-display text-xl font-extrabold">My life</h2>
        {wheel && (
          <p className="text-xs text-muted">
            {wheel.total.toLocaleString("en-GB")} moment{wheel.total === 1 ? "" : "s"} lived
            {storyCount > 0 && ` · ${storyCount} ${storyCount === 1 ? "story" : "stories"} still going`}
          </p>
        )}
      </div>

      {wheel === undefined && <div className="mx-auto mt-6 aspect-square w-full max-w-[340px] animate-pulse rounded-full bg-ink/[0.05]" aria-label="Loading your wheel" />}
      {wheel === null && <p className="mt-6 text-sm text-muted">Your wheel isn&apos;t ready yet. Try again in a little while.</p>}

      {wheel && (
        <>
          <Ring moments={lived} picked={picked} onPick={setPicked} avatar={avatar} words={wheel.words} />
          <Legend moments={lived} />

          {lived.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-ink/[0.04] p-3 text-sm text-ink/80">
              Your wheel fills as you live. Now and then, as you go round the city, something happens to you. What you choose goes here, with
              what came of it.
            </p>
          ) : (
            picked != null && byId.get(picked) && <Detail m={byId.get(picked)!} lived={lived} naira={naira} />
          )}

          {wheel.effects.length > 0 && (
            <section className="mt-4">
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">On you right now</h3>
              <div className="flex flex-wrap gap-1.5">
                {wheel.effects.map((e) => (
                  <span key={e.effect} className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-semibold" title={EFFECTS[e.effect].about}>
                    {EFFECTS[e.effect].emoji} {EFFECTS[e.effect].name}
                    <span className="font-normal text-muted">{e.who ? `${e.effect === "owed_favour" ? "by" : "to"} ${e.who}` : left(e.until)}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {storyCount > 0 && (
            <section className="mt-4">
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">Stories still going</h3>
              <div className="grid gap-1.5">
                {going.map((m) => {
                  const def = MOMENT_BY_ID.get(m.moment)!;
                  return (
                    <button key={m.id} onClick={() => setPicked(m.id)} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 rounded-2xl bg-ink/[0.04] px-3 py-2 text-left hover:bg-ink/[0.07]">
                      <span className="text-xl leading-tight">{def.emoji}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">{fillMoment(def.title, varsOf(m), naira)}</span>
                        <span className="block text-xs text-muted">{m.outcome?.text || "To be continued."}</span>
                      </span>
                    </button>
                  );
                })}
                {wheel.stories.map((s, i) => (
                  <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 rounded-2xl bg-ink/[0.04] px-3 py-2">
                    <span className="text-xl leading-tight">⏳</span>
                    <span className="text-xs text-muted">{s.name ? `${s.name} will be back.` : "Someone from before will be back."}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {wheel.people.length > 0 && (
            <section className="mt-4">
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">People who know you</h3>
              <div className="grid gap-1.5">
                {wheel.people.map((p) => {
                  const c = CAST_BY_ID.get(p.who)!;
                  return (
                    <div key={p.who} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-2xl bg-ink/[0.04] px-3 py-2">
                      <span className="text-xl leading-tight">{c.emoji}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">{c.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {c.role}
                          {p.going ? "" : " · your story together has ended"}
                        </span>
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", p.feeling >= 1 ? "bg-[#12b886]/15 text-[#0b7a5a]" : p.feeling <= -1 ? "bg-hit/10 text-hit" : "bg-ink/[0.06] text-ink")}>
                        {feelingWord(p.feeling)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <p className="mt-4 text-xs text-muted">Badges come quietly, as your story grows.</p>
        </>
      )}
    </Sheet>
  );
}

function Ring({ moments, picked, onPick, avatar, words }: { moments: WheelMoment[]; picked: number | null; onPick: (id: number) => void; avatar: Avatar; words: string[] }) {
  const slots = Math.max(SLOTS_MIN, moments.length);
  return (
    <div className="relative mx-auto mt-1 aspect-square w-full max-w-[340px]">
      <svg viewBox="-200 -200 400 400" className="size-full overflow-visible" role="img" aria-label="Your moments around the wheel, newest at the top">
        <circle r={R} fill="none" className="stroke-ink/[0.07]" strokeWidth={34} />
        <text y={-R - 34} textAnchor="middle" className="fill-muted text-[11px] font-bold tracking-widest">
          NOW
        </text>
        {moments.map((m, i) => {
          const def = MOMENT_BY_ID.get(m.moment)!;
          const ang = (i / slots) * Math.PI * 2 - Math.PI / 2 + 0.02;
          const size = def.size ?? "small";
          const len = size === "life" ? 36 : size === "big" ? 26 : 14;
          const r0 = R - 13;
          const r1 = r0 + len;
          const at = (r: number) => ({ x: Math.cos(ang) * r, y: Math.sin(ang) * r });
          const a = at(r0);
          const b = at(r1);
          const tip = at(r1 + 8);
          const sel = picked === m.id;
          return (
            <g
              key={m.id}
              role="button"
              tabIndex={0}
              aria-label={def.title}
              onClick={() => onPick(m.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPick(m.id);
                }
              }}
              className="cursor-pointer outline-none"
            >
              {/* A wide invisible line so a notch is easy to tap. */}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} />
              {m.going && <line x1={a.x} y1={a.y} x2={at(r1 + 4).x} y2={at(r1 + 4).y} stroke="#ffc53d" strokeWidth={13} strokeLinecap="round" className="motion-safe:animate-pulse" opacity={0.7} />}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={LIFE_AREAS[areaOf(def)].colour} strokeWidth={sel ? 8 : 5} strokeLinecap="round" />
              {size === "life" && <circle cx={tip.x} cy={tip.y} r={4.5} fill="#ffc53d" />}
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-[27%] flex flex-col items-center justify-center text-center">
        <AvatarFace avatar={avatar} size={52} className="rounded-full ring-2 ring-gold ring-offset-2 ring-offset-panel" />
        <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted">Becoming</p>
        <p className="font-display text-[15px] font-extrabold leading-tight [text-wrap:balance]">
          {words.length ? words.join(", ").replace(/^./, (c) => c.toUpperCase()) : "Too soon to say"}
        </p>
      </div>
    </div>
  );
}

function Legend({ moments }: { moments: WheelMoment[] }) {
  const used = new Set(moments.map((m) => areaOf(MOMENT_BY_ID.get(m.moment)!)));
  if (!used.size) return null;
  return (
    <ul className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted">
      {(Object.keys(LIFE_AREAS) as LifeArea[])
        .filter((a) => used.has(a))
        .map((a) => (
          <li key={a} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: LIFE_AREAS[a].colour }} />
            {LIFE_AREAS[a].name}
          </li>
        ))}
    </ul>
  );
}

function Detail({ m, lived, naira }: { m: WheelMoment; lived: WheelMoment[]; naira: (v: number) => string }) {
  const def = MOMENT_BY_ID.get(m.moment) as MomentDef;
  const area = LIFE_AREAS[areaOf(def)];
  const fill = (t: string) => fillMoment(t, varsOf(m), naira);
  const chose = def.choices[m.choice];
  // What came of it: the next steps of the story, oldest first.
  const later = lived.filter((x) => x.from === m.id).reverse();
  const size = def.size === "life" ? "Life-changing" : def.size === "big" ? "Big" : null;
  return (
    <div className="mt-3 rounded-2xl p-3 ring-1 ring-ink/10" aria-live="polite">
      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <span className="size-2 rounded-full" style={{ background: area.colour }} />
        {area.name} · {when(m.at)}
        {size && ` · ${size}`}
      </p>
      <p className="mt-0.5 font-display text-base font-extrabold">
        {def.emoji} {fill(def.title)}
      </p>
      {chose && <p className="mt-1 text-sm font-semibold">You chose: {fill(chose.label)}</p>}
      {m.outcome?.text && <p className="mt-0.5 text-sm leading-snug">{m.outcome.text}</p>}
      {m.outcome && (m.outcome.cash !== 0 || m.outcome.rep !== 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.outcome.cash !== 0 && (
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", m.outcome.cash > 0 ? "bg-[#12b886]/15 text-[#0b7a5a]" : "bg-hit/10 text-hit")}>
              {m.outcome.cash > 0 ? "+" : "−"}
              {cash(Math.abs(m.outcome.cash))}
            </span>
          )}
          {m.outcome.rep !== 0 && (
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", m.outcome.rep > 0 ? "bg-gold/25 text-ink" : "bg-hit/10 text-hit")}>
              {m.outcome.rep > 0 ? "+" : "−"}
              {Math.abs(Math.round(m.outcome.rep * 10) / 10)} reputation
            </span>
          )}
        </div>
      )}
      {later.map((x) => {
        const next = MOMENT_BY_ID.get(x.moment)!;
        return (
          <p key={x.id} className="mt-2 border-l-[3px] border-gold pl-2.5 text-[13px]">
            <span className="font-bold text-gold-dark">What came of it</span> · {when(x.at)}: {fillMoment(next.title, varsOf(x), naira)}. {x.outcome?.text}
          </p>
        );
      })}
      {m.going && (
        <p className="mt-2 border-l-[3px] border-gold pl-2.5 text-[13px]">
          <span className="font-bold text-gold-dark">Still going</span> · what happens next will find you.
        </p>
      )}
    </div>
  );
}
