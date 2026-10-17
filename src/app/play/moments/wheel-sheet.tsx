"use client";

import { OnTop } from "../on-top";
import { useEffect, useMemo, useState } from "react";
import { AvatarFace } from "@/components/avatar";
import { X } from "@/components/icons";
import type { Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { EFFECTS, LIFE_AREAS, MOMENT_BY_ID, areaOf, fillMoment, registerMoments, type LifeArea, type MomentDef } from "@/lib/world/moments";
import { CAST_BY_ID, feelingWord } from "@/lib/world/cast";
import { cash } from "@/lib/world/value";
import { LIFE_BADGES, LIFE_BADGE_BY_ID, badgeName } from "@/lib/world/standing";
import { myWheel, setBadgeShown, setStoryOpen, type Wheel, type WheelMoment } from "../moment-actions";
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
const varsOf = (m: WheelMoment) => ({ name: m.vars.name ?? "", ask: Number(m.vars.ask) || 0, place: m.vars.place ?? "", parts: m.vars.parts });

function left(until: string) {
  const h = Math.max(0, (Date.parse(until) - Date.now()) / 3_600_000);
  return h >= 48 ? `${Math.round(h / 24)} days left` : h >= 1 ? `${Math.round(h)} h left` : "ending soon";
}

/** The explainer has been seen on this phone (it shows the first time My life opens; "?" brings it back). */
const INTRO_KEY = "nt-life-intro-seen";
const introSeen = () => {
  try {
    return localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
};

export function WheelSheet({ avatar, onClose }: { avatar: Avatar; onClose: () => void }) {
  const [wheel, setWheel] = useState<Wheel | null | undefined>(undefined);
  const [picked, setPicked] = useState<number | null>(null);
  const [intro, setIntro] = useState(false);
  useEffect(() => {
    if (!introSeen()) setIntro(true);
  }, []);
  const closeIntro = () => {
    setIntro(false);
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      // A private window: it shows again next time, which is fine.
    }
  };
  useEffect(() => {
    let live = true;
    myWheel()
      .catch(() => null)
      .then((w) => {
        if (!live) return;
        // Player-written moments you lived, so they show like the rest.
        if (w?.written.length) registerMoments(w.written);
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
        <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
          My life
          <button onClick={() => setIntro(true)} className="grid size-6 place-items-center rounded-full bg-ink/[0.06] text-xs font-bold text-muted hover:bg-ink/10" aria-label="How My life works">
            ?
          </button>
        </h2>
        {wheel && (
          <p className="text-xs text-muted">
            {wheel.total.toLocaleString("en-GB")} moment{wheel.total === 1 ? "" : "s"} lived
            {storyCount > 0 && ` · ${storyCount} ${storyCount === 1 ? "story" : "stories"} still going`}
          </p>
        )}
      </div>

      {intro && <Intro onClose={closeIntro} />}

      {wheel === undefined && <div className="mx-auto mt-6 aspect-square w-full max-w-[340px] animate-pulse rounded-full bg-ink/[0.05]" aria-label="Loading your wheel" />}
      {wheel === null && <p className="mt-6 text-sm text-muted">Your wheel isn&apos;t ready yet. Try again in a little while.</p>}

      {wheel && (
        <>
          <Ring moments={lived} picked={picked} onPick={setPicked} avatar={avatar} words={wheel.words} />
          <Legend moments={lived} />
          {wheel.standing && <Standing s={wheel.standing} />}
          <Checklist wheel={wheel} lived={lived} onClose={onClose} />

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

          <Players wheel={wheel} onOpen={(open) => setWheel((w) => (w ? { ...w, storyOpen: open } : w))} />

          <Badges wheel={wheel} onChange={(id, shown) => setWheel((w) => (w ? { ...w, badges: w.badges.map((b) => (b.id === id ? { ...b, shown } : b)) } : w))} />

          {wheel.board.length > 0 && (
            <section className="mt-4">
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">Most legendary lives</h3>
              <ol className="grid gap-1">
                {wheel.board.map((b, i) => (
                  <li key={i} className={cn("flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-sm", b.me ? "bg-gold/25 font-bold" : "bg-ink/[0.03]")}>
                    <span className="w-5 text-right text-xs font-bold tabular-nums text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{b.me ? "You" : b.name}</span>
                    <span className="text-xs font-bold tabular-nums">{b.legacy.toLocaleString("en-GB")}</span>
                  </li>
                ))}
              </ol>
              {wheel.standing && !wheel.board.some((b) => b.me) && (
                <p className="mt-1.5 text-xs text-muted">
                  You&apos;re number {wheel.standing.rank.toLocaleString("en-GB")}, with {wheel.standing.legacy.toLocaleString("en-GB")}.
                </p>
              )}
            </section>
          )}
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

function Standing({ s }: { s: NonNullable<Wheel["standing"]> }) {
  const tiles = [
    { label: "Trust", value: `${s.trust}`, note: s.trust >= 70 ? "People believe you" : s.trust >= 40 ? "Most believe you" : "People doubt you" },
    { label: "Fame", value: s.fameWord, note: "Fades if you go quiet" },
    { label: "Legacy", value: s.legacy.toLocaleString("en-GB"), note: `Number ${s.rank.toLocaleString("en-GB")} in the city` },
  ];
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl bg-ink/[0.04] px-2.5 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{t.label}</p>
          <p className="font-display text-[15px] font-extrabold leading-tight">{t.value}</p>
          <p className="mt-0.5 text-[10.5px] leading-tight text-muted">{t.note}</p>
        </div>
      ))}
    </div>
  );
}

function Badges({ wheel, onChange }: { wheel: Wheel; onChange: (id: string, shown: boolean) => void }) {
  const mine = wheel.badges;
  // A few question marks for what's still to find.
  const hidden = Math.min(4, LIFE_BADGES.length - mine.length);
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">Badges</h3>
      {mine.length === 0 && <p className="mb-2 text-xs text-muted">Badges come quietly, as your story grows. Nobody can earn one with a single answer.</p>}
      <div className="grid gap-1.5">
        {mine.map((b) => {
          const def = LIFE_BADGE_BY_ID.get(b.id)!;
          return (
            <div key={b.id} className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-2xl px-3 py-2", b.faded ? "bg-ink/[0.03] opacity-60" : "bg-gold/15")}>
              <span className={cn("grid size-10 place-items-center rounded-xl text-xl", b.faded ? "bg-ink/[0.06] grayscale" : "bg-gradient-to-br from-gold to-[#ffdf85]")}>{def.emoji}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  {b.faded ? `Once known as ${badgeName(def, wheel.region)}` : badgeName(def, wheel.region)}
                  {b.isNew && <span className="rounded-full bg-hit px-1.5 py-px text-[10px] font-bold text-white">New</span>}
                </span>
                <span className="block text-xs text-muted">{def.about}</span>
              </span>
              {!b.faded && (
                <label className="flex cursor-pointer flex-col items-center gap-0.5 text-[10px] font-semibold text-muted">
                  <input
                    type="checkbox"
                    className="size-4 accent-[#c98a00]"
                    checked={b.shown}
                    onChange={(e) => {
                      const on = e.target.checked;
                      onChange(b.id, on);
                      void setBadgeShown(b.id, on).then((r) => {
                        if (!r.ok) onChange(b.id, !on);
                      });
                    }}
                  />
                  On my card
                </label>
              )}
            </div>
          );
        })}
      </div>
      {hidden > 0 && (
        <div className="mt-2 flex gap-1.5" aria-label="Badges still to find">
          {Array.from({ length: hidden }, (_, i) => (
            <span key={i} className="grid size-10 place-items-center rounded-xl border border-dashed border-ink/15 text-sm font-bold text-muted">
              ?
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

const OPENS = [
  { id: "friends", label: "Friends" },
  { id: "everyone", label: "Anyone" },
  { id: "nobody", label: "Nobody" },
] as const;

/** Other players in your story (phase 6): allies and rivals, and who can be in it. */
function Players({ wheel, onOpen }: { wheel: Wheel; onOpen: (open: NonNullable<Wheel["storyOpen"]>) => void }) {
  if (wheel.storyOpen === null) return null;
  const word = (p: Wheel["players"][number]) =>
    p.mine >= 5 && p.theirs >= 5 ? "Ally" : p.mine <= -5 && p.theirs <= -5 ? "Rival" : p.mine >= 2 ? "You like them" : p.mine <= -2 ? "You don't trust them" : "Shared a story";
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">Players in your story</h3>
      {wheel.players.length === 0 && <p className="mb-2 text-xs text-muted">Now and then a friend turns up in your moments, and you in theirs: a loan, a lift in the rain, a wallet you both saw.</p>}
      <div className="grid gap-1.5">
        {wheel.players.map((p, i) => {
          const w = word(p);
          return (
            <div key={i} className="flex items-center gap-2.5 rounded-2xl bg-ink/[0.04] px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{p.name}</span>
                <span className="block text-xs text-muted">
                  {p.together} {p.together === 1 ? "story" : "stories"} together
                </span>
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", w === "Ally" || w === "You like them" ? "bg-[#12b886]/15 text-[#0b7a5a]" : w === "Rival" || w === "You don't trust them" ? "bg-hit/10 text-hit" : "bg-ink/[0.06] text-ink")}>{w}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 rounded-2xl p-2.5 ring-1 ring-ink/10">
        <p className="text-xs font-semibold">Who can be in my story</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1" role="radiogroup" aria-label="Who can be in my story">
          {OPENS.map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={wheel.storyOpen === o.id}
              onClick={() => {
                const was = wheel.storyOpen!;
                onOpen(o.id);
                void setStoryOpen(o.id).then((r) => {
                  if (!r.ok) onOpen(was);
                });
              }}
              className={cn("h-8 rounded-full text-xs font-semibold", wheel.storyOpen === o.id ? "bg-ink text-white" : "bg-ink/[0.05]")}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-muted">
          {wheel.storyOpen === "friends"
            ? "Only your friends turn up in your moments, and you in theirs."
            : wheel.storyOpen === "everyone"
              ? "Friends, and anyone in your city who also chose Anyone. Only your name is shown, nothing private."
              : "Nobody: no other player turns up in your moments, and you don't turn up in theirs."}
        </p>
      </div>
    </section>
  );
}

/** The explainer: every decision counts (shown the first time, and from the "?"). */
function Intro({ onClose }: { onClose: () => void }) {
  const points = [
    { emoji: "⚖️", title: "Every decision counts", text: "Now and then, something happens to you: someone asks for help, a deal, a family call, a crisis. What you choose changes your money, your reputation and who you become." },
    { emoji: "🤔", title: "No right or wrong answers", text: "Every answer costs something and gives something. The same choice can turn out differently next time. Choose what you can live with." },
    { emoji: "⏳", title: "Now, soon and later", text: "Some things happen at once. Some come back days or weeks later: the person you helped returns, the friend you lent money to pays you back (or doesn't)." },
    { emoji: "🧑🏾‍🤝‍🧑🏾", title: "People remember", text: "Mama Nkechi, Officer Bello, your neighbour, your friends: they remember how you treated them, and so does the city." },
    { emoji: "🏅", title: "Quiet badges", text: "Keep choosing a certain way and, after a while, people start to call you something: Open Hand, Lion Heart, Person of Honour. They arrive by themselves." },
    { emoji: "🌀", title: "Your wheel", text: "Every moment you live is kept here as a notch. Tap one to see what you chose and what came of it." },
  ];
  return (
    <OnTop className="fixed inset-0 flex items-end justify-center bg-ink/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="life-intro-title">
      <div className="moment-in max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-panel p-5 shadow-2xl">
        <p className="text-3xl">🌀</p>
        <h3 id="life-intro-title" className="mt-1 font-display text-xl font-extrabold">This is your life</h3>
        <ul className="mt-3 grid gap-3">
          {points.map((p) => (
            <li key={p.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
              <span className="text-xl leading-tight">{p.emoji}</span>
              <span>
                <span className="block text-sm font-bold">{p.title}</span>
                <span className="block text-[13px] leading-snug text-ink/80">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="mt-4 h-11 w-full rounded-full bg-ink text-sm font-semibold text-white">
          Got it
        </button>
      </div>
    </OnTop>
  );
}

/** Things to do in your life: the first steps, ticked off as you live them. */
function Checklist({ wheel, lived, onClose }: { wheel: Wheel; lived: WheelMoment[]; onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const startBusiness = () => {
    onClose();
    window.dispatchEvent(new Event("nt-open-career"));
  };
  const items: { done: boolean; title: string; hint: string; action?: { label: string; go: () => void } }[] = [
    { done: wheel.total >= 1, title: "Live your first moment", hint: "Go about the city: something will happen to you within a few minutes." },
    { done: wheel.people.length >= 1, title: "Meet someone who'll remember you", hint: "People like Mama Nkechi at the bus stop turn up as you go round the city." },
    { done: wheel.people.some((p) => p.feeling >= 2), title: "Make a friend in the city", hint: "Treat someone well, again and again, and they'll start to see you as a friend." },
    {
      done: !!wheel.business?.ever,
      title: "Start a business",
      hint: "Pick a trade, name it, and grow it with your decisions.",
      action: wheel.business ? { label: "Start one", go: startBusiness } : undefined,
    },
    { done: lived.some((m) => MOMENT_BY_ID.get(m.moment)?.size === "big" || MOMENT_BY_ID.get(m.moment)?.size === "life"), title: "Face a big decision", hint: "Turning points come once or twice a week: a job offer, a family meeting, a loan." },
    { done: lived.some((m) => m.from != null), title: "See what came of a choice", hint: "Some choices come back days later. Help someone, lend money, make a promise." },
    { done: wheel.badges.length >= 1, title: "Earn your first badge", hint: "Keep choosing a certain way for a couple of weeks. It arrives by itself." },
    { done: wheel.players.length >= 1, title: "Share a story with a friend", hint: "Add friends: now and then they turn up in your moments, and you in theirs." },
    { done: wheel.total >= 25, title: "Live 25 moments", hint: `${Math.min(25, wheel.total)} of 25 so far.` },
  ];
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return <p className="mt-3 rounded-2xl bg-[#12b886]/10 p-3 text-center text-xs font-semibold text-[#0b7a5a]">First steps all done. The rest of your life is yours to write.</p>;
  return (
    <section className="mt-3 rounded-2xl p-3 ring-1 ring-ink/10">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={open}>
        <span className="text-sm font-bold">Your first steps</span>
        <span className="text-xs font-semibold text-muted">
          {done} of {items.length} {open ? "▴" : "▾"}
        </span>
      </button>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-gold" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      {open && (
        <ul className="mt-2.5 grid gap-1.5">
          {items.map((i) => (
            <li key={i.title} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5">
              <span className={cn("mt-0.5 grid size-5 place-items-center rounded-full text-[11px] font-bold", i.done ? "bg-[#12b886] text-white" : "ring-2 ring-ink/15")}>{i.done ? "✓" : ""}</span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", i.done && "text-muted line-through")}>{i.title}</span>
                {!i.done && <span className="block text-xs text-muted">{i.hint}</span>}
              </span>
              {!i.done && i.action && (
                <button onClick={i.action.go} className="rounded-full bg-gold px-3 py-1 text-xs font-semibold text-ink">
                  {i.action.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
