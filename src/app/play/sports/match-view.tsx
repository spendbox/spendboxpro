"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, LoaderCircle, Lock, Trophy, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { SPORT_ICON } from "@/lib/sports/icons";
import { colourGap } from "@/lib/sports/teams";
import { matchById, SPORT_INFO } from "@/lib/sports/schedule";
import { basketballClock, boxingClock, footballMinute, mmss } from "@/lib/sports/timeline";
import type {
  BasketballFrame,
  BoxingFrame,
  FootballFrame,
  Frame,
  MatchEvent,
  MatchInfo,
  Side,
  WrestlingFrame,
} from "@/lib/sports/types";
import { drawMatch, frameAt, makeRender, makeView, paintBackground, clearTrail, type Flash } from "./draw";
import { Lineups } from "./lineups";
import { useMatchFeed } from "./use-match-feed";

// The tactical match view: a live top-down picture of the match (pitch, court or ring), the
// scoreboard, a commentary ticker and the full-time card. It plays a few seconds behind the
// server so there's always a next frame to glide towards.

/** How far behind real time the picture plays (the feed is polled every ~3 s). */
const DELAY = 4000;

type Props = {
  matchId: string;
  onClose?: () => void;
  /** Shown over the blurred pitch when the viewer has no ticket (the "Buy ticket" button). */
  locked?: React.ReactNode;
  /** Shown under the view (bet slips, pools...). */
  children?: React.ReactNode;
  /** Where to poll (tests and previews). Defaults to /api/sports/feed. */
  feedUrl?: string;
  className?: string;
};

type Playback = { i: number; t: number };
type Ev = { t: number; fi: number; e: MatchEvent; key: string };

const BIG = new Set(["goal", "red", "penalty", "three", "dunk", "down", "ko", "tko", "rtd", "decision", "finisher", "signature", "nearfall", "pin", "tap", "countout", "dq", "ht", "ft", "half", "final", "ot"]);

/** The view's own little animations (one copy on the page). */
function SportsStyles() {
  return (
    <style href="hs-sports-view" precedence="default">{`
@keyframes sp-pop { 0% { transform: scale(.6); opacity: 0 } 60% { transform: scale(1.08); opacity: 1 } 100% { transform: scale(1) } }
@keyframes sp-rise { 0% { transform: translateY(6px); opacity: 0 } 100% { transform: none; opacity: 1 } }
.sp-pop { animation: sp-pop .35s cubic-bezier(.2,.9,.3,1.3) both }
.sp-rise { animation: sp-rise .3s ease-out both }
@media (prefers-reduced-motion: reduce) { .sp-pop, .sp-rise { animation: none } }
`}</style>
  );
}

/** Server time, ticking twice a second (0 until mounted). */
function useServerNow(offset: number) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now() + offset);
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 500);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [offset]);
  return now;
}

function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function stampOf(sport: MatchInfo["sport"], f: Frame): string {
  switch (sport) {
    case "football": {
      const x = f as FootballFrame;
      return footballMinute(x.c, x.ph);
    }
    case "basketball": {
      const x = f as BasketballFrame;
      if (x.ph === 0) return "Tip";
      const s = Math.max(0, Math.ceil(x.c));
      return `${x.q >= 5 ? "OT" : `Q${x.q}`} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
    case "boxing": {
      const x = f as BoxingFrame;
      if (x.r === 0) return "Intro";
      if (x.ph === 2 || x.ph === 4) return `R${x.r} end`;
      return `R${x.r} ${mmss(x.c).slice(1)}`;
    }
    case "wrestling": {
      const x = f as WrestlingFrame;
      return x.ph === 0 ? "Intro" : mmss(x.c);
    }
  }
}

/** Is the match over in this frame (the final whistle has gone)? */
function overIn(sport: MatchInfo["sport"], f: Frame | undefined): boolean {
  if (!f) return false;
  if (sport === "football") return (f as FootballFrame).ph === 4;
  if (sport === "basketball") return (f as BasketballFrame).ph === 4;
  if (sport === "boxing") return (f as BoxingFrame).ph === 4;
  return (f as WrestlingFrame).ph === 2;
}

// ---------------------------------------------------------------- the canvas

function Arena({
  match,
  frames,
  offset,
  dim,
  onProgress,
  children,
}: {
  match: MatchInfo;
  frames: Frame[];
  offset: number;
  dim: boolean;
  onProgress: (p: Playback) => void;
  children?: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef(frames);
  const offsetRef = useRef(offset);
  const progressRef = useRef(onProgress);
  const [box, setBox] = useState<{ w: number; maxH: number; dpr: number } | null>(null);

  useEffect(() => {
    framesRef.current = frames;
    offsetRef.current = offset;
    progressRef.current = onProgress;
  });

  // Size: the width we're given, at most ~60% of the screen tall.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.clientWidth);
      const maxH = Math.round(Math.min(window.innerHeight * 0.6, 720));
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      setBox((b) => (b && b.w === w && b.maxH === maxH && b.dpr === dpr ? b : { w, maxH, dpr }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const view = useMemo(() => (box && box.w > 0 ? makeView(match.sport, box.w, box.maxH, box.dpr) : null), [box, match.sport]);

  useEffect(() => {
    const cv = canvas.current;
    if (!view || !cv) return;
    cv.width = Math.round(view.w * view.dpr);
    cv.height = Math.round(view.h * view.dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const bg = paintBackground(view, match);
    const render = makeRender(match);
    const flash: Flash = { until: 0, side: 0, pts: 0 };
    let raf = 0;
    let hint = 0;
    let lastI = -1;
    let lastQ = NaN;
    let lastLen = -1;
    let drewEmpty = false;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const fr = framesRef.current;
      const now = performance.now();
      if (!fr.length) {
        if (!drewEmpty) {
          drawMatch(ctx, view, bg, render, fr, 0, 0, now, flash);
          drewEmpty = true;
        }
        return;
      }
      drewEmpty = false;
      const target = Date.now() + offsetRef.current - match.kickoffAt - DELAY;
      const t = Math.max(fr[0].t, Math.min(target, fr[fr.length - 1].t));
      const i = frameAt(fr, t, hint);
      hint = i;
      if (i < lastI || fr.length < lastLen) clearTrail(render);
      if (i !== lastI) {
        // New key moments since the last frame drawn: goal flashes, baskets.
        for (let k = Math.max(0, lastI + 1); k <= i; k++) {
          for (const e of fr[k].e ?? []) {
            if (e.k === "goal") flash.until = now + 2600;
            else if ((e.k === "score" || e.k === "three" || e.k === "dunk" || e.k === "ft") && e.n) {
              flash.until = now + 1600;
              flash.side = e.s ?? 0;
              flash.pts = e.n;
            }
          }
          if (lastI < 0) flash.until = 0;
        }
      }
      lastLen = fr.length;
      drawMatch(ctx, view, bg, render, fr, i, t, now, flash);
      const q = Math.floor(t / 250);
      if (i !== lastI || q !== lastQ) {
        lastI = i;
        lastQ = q;
        progressRef.current({ i, t });
      }
    };
    const start = () => {
      cancelAnimationFrame(raf);
      drewEmpty = false;
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") cancelAnimationFrame(raf);
      else start();
    };
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [view, match]);

  return (
    <div ref={wrap} className="relative w-full overflow-hidden rounded-2xl bg-ink" style={{ height: view ? view.h : 260 }}>
      <canvas
        ref={canvas}
        className={cn("block transition-[filter] duration-500", dim && "scale-105 blur-[6px] brightness-75")}
        style={{ width: view?.w ?? "100%", height: view?.h ?? 260 }}
      />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function Swatch({ side, size = 12 }: { side: Side; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: side.colour, boxShadow: `0 0 0 2px ${side.colour2}` }}
    />
  );
}

function LiveBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-hit px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      <span className="size-1.5 animate-pulse rounded-full bg-white" />
      {label}
    </span>
  );
}

function Bar({ value, colour, label }: { value: number; colour: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <span className="w-[4.5rem] shrink-0 text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: colour }} />
      </div>
    </div>
  );
}

function healthColour(v: number) {
  return v > 60 ? "#12a37a" : v > 30 ? "#f59e0b" : "#e5484d";
}

function FighterBars({ match, frame }: { match: MatchInfo; frame: Frame | undefined }) {
  if (!frame || (match.sport !== "boxing" && match.sport !== "wrestling")) return null;
  const box = match.sport === "boxing";
  const f = frame as BoxingFrame & WrestlingFrame;
  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl bg-panel-2 px-3 py-2">
      {[0, 1].map((i) => {
        const side = i === 0 ? match.home : match.away;
        const mo = box ? 0 : f.mo[i];
        return (
          <div key={i} className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5">
              <Swatch side={side} size={9} />
              <span className="min-w-0 truncate text-xs font-semibold">{side.short}</span>
              {box && f.kd[i] > 0 && <span className="ml-auto shrink-0 text-[10px] font-bold text-hit">Down x{f.kd[i]}</span>}
              {!box && mo >= 85 && <span className="ml-auto shrink-0 text-[10px] font-bold text-gold-dark">FINISHER READY</span>}
            </div>
            <Bar label={box ? "Health" : "Energy"} value={f.hp[i]} colour={healthColour(f.hp[i])} />
            {box ? <Bar label="Stamina" value={f.sp[i]} colour="#2d6bff" /> : <Bar label="Momentum" value={mo} colour={colourGap(side.colour, "#eef1f5") < 140 ? side.colour2 : side.colour} />}
          </div>
        );
      })}
    </div>
  );
}

function Scoreboard({
  match,
  frame,
  scoreline,
  status,
  over,
}: {
  match: MatchInfo;
  frame: Frame | undefined;
  scoreline: string | null;
  status: "pre" | "live" | "done";
  over: boolean;
}) {
  let clock = "";
  let score: number[] | null = null;
  if (frame) {
    if (match.sport === "football") {
      const f = frame as FootballFrame;
      clock = f.ph === 4 ? "Full time" : f.ph === 2 ? "Half-time" : footballMinute(f.c, f.ph);
      score = f.s;
    } else if (match.sport === "basketball") {
      const f = frame as BasketballFrame;
      clock = basketballClock(f.q, f.c, f.ph);
      score = f.s;
    } else if (match.sport === "boxing") {
      const f = frame as BoxingFrame;
      clock = boxingClock(f.r, f.c, f.ph);
    } else {
      const f = frame as WrestlingFrame;
      clock = f.ph === 0 ? "Entrances" : f.ph === 2 ? "Match over" : mmss(f.c);
    }
  }
  const badge = status === "live" && !over ? <LiveBadge label="Live" /> : status === "done" || over ? <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Final</span> : null;
  return (
    <div className="rounded-2xl bg-ink px-3 py-2.5 text-white">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Swatch side={match.home} />
          <span className="min-w-0 truncate text-sm font-bold">{match.home.short}</span>
        </div>
        <div className="text-center font-display text-2xl font-black tabular-nums leading-none">
          {score ? (
            <span>
              {score[0]}
              <span className="px-1 text-white/50">–</span>
              {score[1]}
            </span>
          ) : (
            <span className="text-base text-white/60">vs</span>
          )}
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <span className="min-w-0 truncate text-right text-sm font-bold">{match.away.short}</span>
          <Swatch side={match.away} />
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-2 text-xs text-white/75">
        {badge}
        <span className="truncate tabular-nums">{frame ? clock : (scoreline ?? (status === "pre" ? "Not started" : ""))}</span>
      </div>
    </div>
  );
}

function Ticker({ match, frames, events, count }: { match: MatchInfo; frames: Frame[]; events: Ev[]; count: number }) {
  const lines: Ev[] = [];
  for (let k = count - 1; k >= 0 && lines.length < 6; k--) if (events[k].e.tx) lines.push(events[k]);
  if (!lines.length) return null;
  return (
    <ol className="space-y-1" aria-live="polite">
      {lines.map((ev, n) => {
        const side = ev.e.s === undefined ? null : ev.e.s === 0 ? match.home : match.away;
        const big = BIG.has(ev.e.k);
        return (
          <li
            key={ev.key}
            className={cn("flex items-start gap-2 rounded-xl px-2.5 py-1.5 text-[13px] leading-snug", n === 0 ? "sp-rise bg-panel-2" : "", big && "font-semibold")}
            style={n === 0 && big && side ? { boxShadow: `inset 3px 0 0 ${side.colour}` } : undefined}
          >
            <span className="w-14 shrink-0 pt-px text-right text-[11px] font-semibold tabular-nums text-muted">{stampOf(match.sport, frames[ev.fi])}</span>
            {side ? <Swatch side={side} size={8} /> : <span className="mt-1.5 size-2 shrink-0 rounded-full bg-line" />}
            <span className="min-w-0 flex-1">{ev.e.tx}</span>
          </li>
        );
      })}
    </ol>
  );
}

function FinalCard({
  match,
  frame,
  finalEvent,
  result,
  official,
  onHide,
}: {
  match: MatchInfo;
  frame: Frame;
  finalEvent: MatchEvent | null;
  result: { winner: string; score: string; summary: string } | null;
  official: boolean;
  onHide: () => void;
}) {
  const teams = match.sport === "football" || match.sport === "basketball";
  const s = teams ? (frame as FootballFrame).s : null;
  const winnerKey = result?.winner ?? (s ? (s[0] > s[1] ? "home" : s[0] < s[1] ? "away" : "draw") : finalEvent?.s === 0 ? "home" : finalEvent?.s === 1 ? "away" : null);
  const winner = winnerKey === "home" ? match.home : winnerKey === "away" ? match.away : null;
  const title = match.sport === "football" ? "Full time" : match.sport === "basketball" ? "Final" : "Winner";
  const st = finalEvent?.st;
  const sl = finalEvent?.sl;
  return (
    <div className="sp-pop absolute inset-x-3 top-1/2 max-h-[92%] -translate-y-1/2 overflow-y-auto rounded-2xl bg-panel/95 p-4 text-ink shadow-2xl backdrop-blur">
      <button onClick={onHide} className="absolute right-2 top-2 grid size-8 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Hide">
        <X className="size-4" />
      </button>
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <Trophy className="size-3.5 text-gold-dark" />
        {title}
      </p>
      {s ? (
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span className={cn("min-w-0 truncate text-sm font-bold", winnerKey === "away" && "text-muted")}>{match.home.short}</span>
          <span className="font-display text-3xl font-black tabular-nums">
            {s[0]}–{s[1]}
          </span>
          <span className={cn("min-w-0 truncate text-right text-sm font-bold", winnerKey === "home" && "text-muted")}>{match.away.short}</span>
        </div>
      ) : (
        winner && (
          <div className="mt-2 flex items-center gap-2">
            <Swatch side={winner} size={14} />
            <span className="font-display text-xl font-black leading-tight">{winner.name}</span>
          </div>
        )
      )}
      {winnerKey === "draw" && <p className="mt-1 text-sm font-semibold">It&apos;s a draw.</p>}
      <p className="mt-2 text-sm leading-snug text-muted">{result?.summary ?? finalEvent?.tx ?? ""}</p>
      {st && sl && (
        <table className="mt-3 w-full text-xs tabular-nums">
          <tbody>
            {sl.map((label, k) => (
              <tr key={label} className="border-t border-line">
                <td className="py-1 text-left font-semibold">{st[0][k]}</td>
                <td className="py-1 text-center text-muted">{label}</td>
                <td className="py-1 text-right font-semibold">{st[1][k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!official && (
        <p className="mt-2 text-[11px] text-muted">The result becomes official when the {SPORT_INFO[match.sport].noun}&apos;s slot ends.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- overlays during play

function Overlays({ match, frames, pb, events, count }: { match: MatchInfo; frames: Frame[]; pb: Playback; events: Ev[]; count: number }) {
  const f = frames[pb.i];
  if (!f) return null;
  const recent = (ms: number, kinds: string[]) => {
    for (let k = count - 1; k >= 0; k--) {
      const ev = events[k];
      if (pb.t - ev.t > ms) break;
      if (kinds.includes(ev.e.k)) return ev;
    }
    return null;
  };
  const banner = (text: string, colour: string, sub?: string) => (
    <div className="sp-pop pointer-events-none absolute inset-x-0 top-[38%] flex flex-col items-center">
      <span className="rounded-2xl px-5 py-2 font-display text-3xl font-black italic tracking-tight text-white shadow-xl" style={{ background: colour }}>
        {text}
      </span>
      {sub && <span className="mt-1 rounded-full bg-ink/80 px-3 py-0.5 text-xs font-semibold text-white">{sub}</span>}
    </div>
  );
  const sideOf = (s?: number) => (s === 1 ? match.away : match.home);
  if (match.sport === "football") {
    const x = f as FootballFrame;
    const goal = recent(3200, ["goal"]);
    if (goal) return banner("GOAL!", sideOf(goal.e.s).colour, sideOf(goal.e.s).name);
    const card = recent(2200, ["red"]);
    if (card) return banner("RED CARD", "#e5484d");
    const pen = recent(2600, ["penalty"]);
    if (pen) return banner("PENALTY!", sideOf(pen.e.s).colour);
    if (x.ph === 2) return banner("HALF-TIME", "#18202b");
    return null;
  }
  if (match.sport === "basketball") {
    const x = f as BasketballFrame;
    const ot = recent(3000, ["ot"]);
    if (ot) return banner("OVERTIME!", "#c98a00");
    if (x.ph === 3) return banner("HALF-TIME", "#18202b");
    if (x.ph === 2) return banner(x.q >= 4 ? "END OF REGULATION" : `END OF Q${x.q}`, "#18202b");
    return null;
  }
  if (match.sport === "boxing") {
    const x = f as BoxingFrame;
    if (x.ph === 3 && x.n) {
      return (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span key={x.n} className="sp-pop font-display text-7xl font-black text-white [text-shadow:0_4px_20px_rgb(0_0_0/.6)]">
            {x.n}
          </span>
        </div>
      );
    }
    const end = recent(4000, ["ko", "tko", "rtd"]);
    if (end) return banner(end.e.k === "ko" ? "KNOCKOUT!" : "TKO!", sideOf(end.e.s).colour, sideOf(end.e.s).name);
    const down = recent(1800, ["down"]);
    if (down) return banner("DOWN!", "#e5484d");
    const bell = recent(1800, ["bell"]);
    if (bell && bell.e.n) return banner(`ROUND ${bell.e.n}`, "#18202b");
    return null;
  }
  // Wrestling.
  const x = f as WrestlingFrame;
  if (x.n && x.nk) {
    const label = x.nk === "p" ? String(x.n) : x.nk === "o" ? `COUNT ${x.n}` : null;
    if (label) {
      return (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span key={`${x.nk}${x.n}`} className="sp-pop font-display text-6xl font-black text-white [text-shadow:0_4px_20px_rgb(0_0_0/.6)]">
            {label}
          </span>
        </div>
      );
    }
  }
  const end = recent(4000, ["pin", "tap", "countout", "dq"]);
  if (end) {
    const word = end.e.k === "pin" ? "THREE!" : end.e.k === "tap" ? "TAP OUT!" : end.e.k === "dq" ? "DISQUALIFIED!" : "COUNTED OUT!";
    return banner(word, sideOf(end.e.s).colour, `${sideOf(end.e.s).name} wins`);
  }
  // The move that just happened, popping up big.
  for (let k = pb.i; k >= 0 && pb.t - frames[k].t < 1700; k--) {
    const mv = (frames[k] as WrestlingFrame).mv;
    if (mv) {
      const side = sideOf(mv[0]);
      const finisher = mv[2] >= 3;
      return (
        <div className="pointer-events-none absolute inset-x-0 top-[12%] flex justify-center">
          <span
            key={`${k}`}
            className={cn("sp-pop max-w-[90%] truncate rounded-xl px-3 py-1 font-display font-black uppercase italic text-white shadow-lg", finisher ? "text-2xl" : "text-lg")}
            style={{ background: finisher ? "#c98a00" : side.colour, color: finisher ? "#18202b" : undefined }}
          >
            {mv[1]}
            {mv[2] === 5 && x.n ? ` ${"|".repeat(x.n)}` : ""}
          </span>
        </div>
      );
    }
  }
  if (x.ph === 0) return null;
  return null;
}

// ---------------------------------------------------------------- the view

export function MatchView({ matchId, onClose, locked, children, feedUrl, className }: Props) {
  const match = useMemo(() => matchById(matchId), [matchId]);
  const feed = useMatchFeed(match ? matchId : null, true, feedUrl);
  const now = useServerNow(feed.serverOffset);
  const [pb, setPb] = useState<Playback>({ i: 0, t: -Infinity });
  const [hideCard, setHideCard] = useState(false);
  const [showLineups, setShowLineups] = useState(false);

  const frames = feed.frames;
  const events = useMemo(() => {
    const out: Ev[] = [];
    frames.forEach((f, fi) => f.e?.forEach((e, ei) => out.push({ t: f.t, fi, e, key: `${f.t}-${ei}` })));
    return out;
  }, [frames]);

  if (!match) {
    return (
      <div className="space-y-3 p-2 text-center">
        <p className="font-semibold">That match doesn&apos;t exist.</p>
        {onClose && (
          <button onClick={onClose} className="rounded-full bg-panel-2 px-4 py-2 text-sm font-semibold">
            Back
          </button>
        )}
      </div>
    );
  }

  const info = SPORT_INFO[match.sport];
  const Icon = SPORT_ICON[match.sport];
  const status: "pre" | "live" | "done" = !now ? "pre" : now < match.kickoffAt ? "pre" : now < match.endsAt && !feed.data?.done ? "live" : "done";
  const ticket = feed.data?.ticket ?? null;
  const lockedOut = ticket === false;
  const haveFrames = frames.length > 0 && !lockedOut;
  const playing = haveFrames && pb.t > -Infinity;
  const frame = playing ? frames[Math.min(pb.i, frames.length - 1)] : undefined;
  // Events up to the playback time.
  let count = 0;
  if (playing) {
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].t <= pb.t) lo = mid + 1;
      else hi = mid;
    }
    count = lo;
  }
  const over = playing && overIn(match.sport, frame);
  let finalEvent: MatchEvent | null = null;
  if (over) {
    for (let k = count - 1; k >= 0 && !finalEvent; k--) {
      const e = events[k].e;
      if (e.st && (e.k === "ft" || e.k === "final")) finalEvent = e;
    }
    if (finalEvent && !finalEvent.tx) {
      for (let k = count - 1; k >= 0; k--) {
        const e = events[k].e;
        if (e.tx && ["ko", "tko", "rtd", "decision", "pin", "tap", "countout", "dq"].includes(e.k)) {
          finalEvent = { ...finalEvent, tx: e.tx };
          break;
        }
      }
    }
  }
  const startWord = match.sport === "football" ? "Kick-off" : match.sport === "basketball" ? "Tip-off" : match.sport === "boxing" ? "First bell" : "Bell";

  return (
    <div className={cn("space-y-3", className)}>
      <SportsStyles />
      {/* Header */}
      <div className="flex items-center gap-2">
        {onClose && (
          <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-white">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">{match.title}</p>
          <p className="truncate text-xs text-muted">{match.league ?? info.label}</p>
        </div>
      </div>

      <Scoreboard match={match} frame={frame} scoreline={feed.data?.scoreline ?? null} status={status} over={over} />

      <Arena match={match} frames={haveFrames ? frames : NONE} offset={feed.serverOffset} dim={lockedOut} onProgress={setPb}>
        {lockedOut && (
          <div className="absolute inset-0 grid place-items-center p-4">
            <div className="w-full max-w-xs rounded-2xl bg-panel/95 p-4 text-center shadow-xl">
              <Lock className="mx-auto size-6 text-muted" />
              <p className="mt-1 text-sm font-bold">
                {status === "done" ? "This one's over" : status === "live" ? `${info.label} on now` : `${startWord} in ${countdown(match.kickoffAt - now)}`}
              </p>
              {feed.data?.scoreline && <p className="mt-0.5 text-xs font-semibold tabular-nums text-muted">{feed.data.scoreline}</p>}
              <div className="mt-3">{locked}</div>
            </div>
          </div>
        )}
        {!lockedOut && status === "pre" && (
          <div className="absolute inset-0 grid place-items-center bg-ink/35">
            <div className="text-center text-white">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/80">{startWord} in</p>
              <p className="font-display text-5xl font-black tabular-nums [text-shadow:0_2px_12px_rgb(0_0_0/.5)]">{now ? countdown(match.kickoffAt - now) : "--:--"}</p>
            </div>
          </div>
        )}
        {!lockedOut && status !== "pre" && !playing && (
          <div className="absolute inset-0 grid place-items-center bg-ink/35 text-white">
            {feed.error ? (
              <p className="max-w-[80%] text-center text-sm font-semibold">{feed.error}</p>
            ) : (
              <LoaderCircle className="size-8 animate-spin" aria-label="Loading the match" />
            )}
          </div>
        )}
        {playing && !over && <Overlays match={match} frames={frames} pb={pb} events={events} count={count} />}
        {playing && over && frame && !hideCard && (
          <FinalCard
            match={match}
            frame={frame}
            finalEvent={finalEvent}
            result={feed.data?.result ?? null}
            official={!!feed.data?.done}
            onHide={() => setHideCard(true)}
          />
        )}
        {playing && over && hideCard && (
          <button onClick={() => setHideCard(false)} className="absolute bottom-2 right-2 rounded-full bg-panel/95 px-3 py-1 text-xs font-semibold shadow">
            Show result
          </button>
        )}
      </Arena>

      {playing && <FighterBars match={match} frame={frame} />}

      {status === "pre" || !playing ? (
        <Lineups match={match} />
      ) : (
        <>
          <Ticker match={match} frames={frames} events={events} count={count} />
          <button
            onClick={() => setShowLineups((v) => !v)}
            className="flex w-full items-center justify-center gap-1 rounded-full py-1 text-xs font-semibold text-muted hover:bg-panel-2"
          >
            {showLineups ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {match.sport === "boxing" || match.sport === "wrestling" ? "Tale of the tape" : "Line-ups"}
          </button>
          {showLineups && <Lineups match={match} />}
        </>
      )}

      {children}
    </div>
  );
}

const NONE: Frame[] = [];
