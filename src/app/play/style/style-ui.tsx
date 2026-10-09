"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  Compass,
  Dices,
  Footprints,
  Gamepad2,
  Ghost,
  LoaderCircle,
  MessageCircleHeart,
  PartyPopper,
  ScanSearch,
  Share2,
  Trophy,
  UtensilsCrossed,
  VenetianMask,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  comboText,
  describeGame,
  lifetimeSummary,
  lineFor,
  rankStyles,
  STYLE_KEYS,
  STYLES,
  type LifetimeStyle,
  type StyleIconName,
  type StyleKey,
  type StyleResult,
} from "@/lib/play-style";
import { Sheet } from "../sheet";
import { diaryOf } from "./diary";
import { getMyPlayStyle, savePlayDiary } from "./style-actions";

// How you played: the end-of-game card ("This game you were The Explorer"), the bars that show
// your mix, and "My style" (your mix over all your games, and every style there is).

const ICONS: Record<StyleIconName, typeof Compass> = {
  Compass,
  Camera,
  ScanSearch,
  Ghost,
  Footprints,
  MessageCircleHeart,
  PartyPopper,
  UtensilsCrossed,
  Dices,
  VenetianMask,
  Gamepad2,
  Trophy,
};

export function StyleIcon({ style, className }: { style: StyleKey; className?: string }) {
  const Icon = ICONS[STYLES[style].icon] ?? Compass;
  return <Icon className={className} aria-hidden />;
}

/** Bars: each style's share (0..1), biggest first. */
export function StyleBars({ shares, max = 5, light }: { shares: Partial<Record<StyleKey, number>>; max?: number; light?: boolean }) {
  const order = rankStyles(shares).filter((k) => (shares[k] ?? 0) > 0.005).slice(0, max);
  if (!order.length) return null;
  return (
    <ul className="space-y-1.5">
      {order.map((k) => {
        const pct = Math.round((shares[k] ?? 0) * 100);
        return (
          <li key={k} className="flex items-center gap-2 text-xs">
            <span className={cn("flex w-28 shrink-0 items-center gap-1.5 truncate font-semibold", light && "text-white")}>
              <StyleIcon style={k} className="size-3.5 shrink-0" />
              {STYLES[k].short}
            </span>
            <span className={cn("h-2.5 flex-1 overflow-hidden rounded-full", light ? "bg-white/20" : "bg-panel-2")}>
              <span className="block h-full rounded-full" style={{ width: `${Math.max(3, pct)}%`, background: light ? "#ffffff" : STYLES[k].color }} />
            </span>
            <span className={cn("w-9 shrink-0 text-right tabular-nums", light ? "text-white/85" : "text-muted")}>{pct}%</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Points → shares adding up to 1. */
function sharesOf(scores: Partial<Record<StyleKey, number>>) {
  const total = STYLE_KEYS.reduce((n, k) => n + Math.max(0, scores[k] ?? 0), 0);
  return Object.fromEntries(STYLE_KEYS.map((k) => [k, total > 0 ? Math.max(0, scores[k] ?? 0) / total : 0])) as Record<StyleKey, number>;
}

/**
 * The end-of-game card: saves this game's diary (signed in) and shows the style it earned, a
 * tease line, the numbers behind it, this game's mix and your mix over time, with a Share button.
 */
export function PlayStyleCard({ roundId, signedIn, player, city }: { roundId: number; signedIn: boolean; player: string; city: string }) {
  const [game, setGame] = useState<StyleResult | null>(null);
  const [lifetime, setLifetime] = useState<LifetimeStyle | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  const iconRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let live = true;
    const diary = diaryOf(roundId);
    if (!signedIn) {
      // Watching without an account: work it out on the phone.
      queueMicrotask(() => live && setGame(describeGame(diary)));
      return () => {
        live = false;
      };
    }
    void savePlayDiary(roundId, diary).then((r) => {
      if (!live) return;
      if (r.ok) {
        setGame(describeGame(r.counters, r.style, r.scores));
        setLifetime(r.lifetime);
      } else setGame(describeGame(diary));
    });
    return () => {
      live = false;
    };
  }, [roundId, signedIn]);

  if (!game) {
    return (
      <div className="mt-4 grid h-44 place-items-center rounded-3xl bg-panel-2" aria-busy>
        <LoaderCircle className="size-6 animate-spin text-muted" />
      </div>
    );
  }
  const s = STYLES[game.style];
  const combo = comboText(game.side);
  const line = lineFor(game.style, `${roundId}:${player}`, game.counters);

  async function share() {
    if (sharing || !game) return;
    setSharing(true);
    const how = await shareStyle(game, line, player, city, iconRef.current?.querySelector("svg") ?? null);
    setSharing(false);
    if (how === "saved") setShared("Picture saved. Share it anywhere!");
  }

  return (
    <div className="style-pop mt-4 overflow-hidden rounded-3xl text-white shadow-lg" style={{ background: `linear-gradient(150deg, ${s.color}, #18202b 135%)` }}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span ref={iconRef} className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15">
            <StyleIcon style={game.style} className="size-8" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/75">This game you were</p>
            <h3 className="font-display text-2xl font-extrabold leading-tight">{s.title}</h3>
            {combo && <p className="text-sm font-semibold text-white/85">{combo}</p>}
          </div>
        </div>
        <p className="mt-3 font-display text-lg font-bold leading-snug">&ldquo;{line}&rdquo;</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {game.stats.map((st) => (
            <span key={st.key} className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
              {st.text}
            </span>
          ))}
        </div>
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/75">This game&apos;s mix</p>
          <StyleBars shares={sharesOf(game.scores)} max={3} light />
        </div>
        {lifetime && lifetime.games > 1 && <LifetimeLine lifetime={lifetime} light />}
        <button
          onClick={share}
          disabled={sharing}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 font-semibold text-ink disabled:opacity-70"
        >
          {sharing ? <LoaderCircle className="size-4 animate-spin" /> : <Share2 className="size-4" />}
          Share my style
        </button>
        {shared && <p className="mt-1.5 text-center text-xs text-white/80">{shared}</p>}
        {!signedIn && <p className="mt-2 text-center text-xs text-white/80">Sign in to keep track of your style game after game.</p>}
      </div>
      <style>{`.style-pop{animation:style-pop .5s cubic-bezier(.2,1.4,.4,1)}@keyframes style-pop{from{transform:scale(.92);opacity:0}to{transform:none;opacity:1}}@media (prefers-reduced-motion: reduce){.style-pop{animation:none}}`}</style>
    </div>
  );
}

function LifetimeLine({ lifetime, light }: { lifetime: LifetimeStyle; light?: boolean }) {
  const sum = lifetimeSummary(lifetime);
  if (!sum) return null;
  return (
    <div className={cn("mt-4 rounded-2xl p-3", light ? "bg-white/10" : "bg-panel-2")}>
      <p className={cn("text-[11px] font-bold uppercase tracking-wider", light ? "text-white/75" : "text-muted")}>
        Over {lifetime.games} games
      </p>
      <p className="mt-0.5 text-sm font-semibold">
        Mostly {STYLES[sum.style].title}
        {sum.side ? `, ${comboText(sum.side)}` : ""}
      </p>
      <div className="mt-2">
        <StyleBars shares={lifetime.shares} max={4} light={light} />
      </div>
    </div>
  );
}

/** "My style": your mix over all your games, your latest styles, and every style there is. */
export function StyleSheet({ onClose }: { onClose: () => void }) {
  const [lifetime, setLifetime] = useState<LifetimeStyle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    void getMyPlayStyle().then((r) => {
      if (!live) return;
      if (r.ok) setLifetime(r.lifetime);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [tries]);

  const sum = lifetime ? lifetimeSummary(lifetime) : null;
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl text-white" style={{ background: sum ? STYLES[sum.style].color : "#18202b" }}>
          {sum ? <StyleIcon style={sum.style} className="size-5" /> : <Gamepad2 className="size-5" />}
        </span>
        <h2 className="min-w-0 flex-1 font-display text-xl font-bold">My play style</h2>
        <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-panel-2" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl bg-panel-2 p-4 text-center text-sm">
          <p>{error}</p>
          <button onClick={() => { setError(null); setTries((t) => t + 1); }} className="mt-3 rounded-xl bg-ink px-4 py-2 font-semibold text-white">
            Try again
          </button>
        </div>
      ) : !lifetime ? (
        <div className="mt-4 space-y-2" aria-busy>
          <div className="h-16 animate-pulse rounded-2xl bg-panel-2" />
          <div className="h-28 animate-pulse rounded-2xl bg-panel-2" />
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {sum ? (
            <div className="rounded-2xl p-4 text-white" style={{ background: `linear-gradient(150deg, ${STYLES[sum.style].color}, #18202b 135%)` }}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/75">Over {lifetime.games} game{lifetime.games === 1 ? "" : "s"} you&apos;re mostly</p>
              <p className="font-display text-2xl font-extrabold leading-tight">{STYLES[sum.style].title}</p>
              {sum.side && <p className="text-sm font-semibold text-white/85">{comboText(sum.side)}</p>}
              <p className="mt-2 text-sm text-white/90">{STYLES[sum.style].blurb}</p>
              <div className="mt-3">
                <StyleBars shares={lifetime.shares} max={6} light />
              </div>
            </div>
          ) : (
            <p className="rounded-2xl bg-panel-2 p-4 text-sm">
              Play a game and your style shows up here: what you get up to decides it. Over time the bars show your mix.
            </p>
          )}

          {lifetime.recent.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">Your latest games</h3>
              <div className="flex flex-wrap gap-1.5">
                {lifetime.recent.map((g) => (
                  <span key={g.round} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: STYLES[g.style].color }}>
                    <StyleIcon style={g.style} className="size-3.5" />
                    {STYLES[g.style].short}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <button onClick={() => setAll((v) => !v)} className="flex w-full items-center justify-between rounded-xl bg-panel-2 px-3 py-2.5 text-sm font-semibold">
              All {STYLE_KEYS.length} styles and how to get them
              <ChevronDown className={cn("size-4 transition-transform", all && "rotate-180")} />
            </button>
            {all && (
              <ul className="mt-2 space-y-1.5">
                {STYLE_KEYS.map((k) => (
                  <li key={k} className="flex items-start gap-2.5 rounded-xl bg-panel-2 px-3 py-2">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg text-white" style={{ background: STYLES[k].color }}>
                      <StyleIcon style={k} className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        {STYLES[k].title}
                        {(lifetime.tops[k] ?? 0) > 0 && <span className="text-[10px] font-bold text-muted">×{lifetime.tops[k]}</span>}
                      </span>
                      <span className="block text-xs text-muted">{STYLES[k].how}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}

/** A picture of the card (1080×1350) to share or save. */
async function shareStyle(game: StyleResult, line: string, player: string, city: string, icon: SVGSVGElement | null) {
  const s = STYLES[game.style];
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d")!;
  const g = c.createLinearGradient(0, 0, W * 0.6, H);
  g.addColorStop(0, s.color);
  g.addColorStop(1, "#18202b");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.fillStyle = "rgba(255,255,255,0.12)";
  c.beginPath();
  c.roundRect(W / 2 - 140, 120, 280, 280, 64);
  c.fill();
  if (icon) {
    try {
      const svg = icon.cloneNode(true) as SVGSVGElement;
      svg.setAttribute("stroke", "#ffffff");
      svg.setAttribute("width", "180");
      svg.setAttribute("height", "180");
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
      await img.decode();
      c.drawImage(img, W / 2 - 90, 170, 180, 180);
    } catch {}
  }
  c.textAlign = "center";
  c.fillStyle = "rgba(255,255,255,0.8)";
  c.font = "700 40px system-ui, sans-serif";
  c.fillText("THIS GAME I WAS", W / 2, 490);
  c.fillStyle = "#ffffff";
  c.font = "900 104px system-ui, sans-serif";
  c.fillText(s.title, W / 2, 610, W - 100);
  const combo = comboText(game.side);
  if (combo) {
    c.font = "700 46px system-ui, sans-serif";
    c.fillStyle = "rgba(255,255,255,0.88)";
    c.fillText(combo, W / 2, 680, W - 120);
  }
  // The tease line, wrapped.
  c.font = "800 54px system-ui, sans-serif";
  c.fillStyle = "#ffffff";
  const words = `“${line}”`.split(" ");
  const lines = [""];
  for (const w of words) {
    const next = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w;
    if (c.measureText(next).width > W - 160 && lines[lines.length - 1]) lines.push(w);
    else lines[lines.length - 1] = next;
  }
  lines.slice(0, 3).forEach((l, k) => c.fillText(l, W / 2, 800 + k * 68));
  c.font = "700 40px system-ui, sans-serif";
  c.fillStyle = "rgba(255,255,255,0.9)";
  game.stats.slice(0, 3).forEach((st, k) => c.fillText(st.text, W / 2, 1040 + k * 56));
  c.font = "700 40px system-ui, sans-serif";
  c.fillStyle = "#ffc53d";
  c.fillText(`${player}${city ? ` · ${city}` : ""}`, W / 2, 1250);
  c.font = "600 32px system-ui, sans-serif";
  c.fillStyle = "rgba(255,255,255,0.7)";
  c.fillText("Newtown · newtown.world", W / 2, 1305);

  const blob: Blob = await new Promise((resolve) => canvas.toBlob((bl) => resolve(bl!), "image/png"));
  const file = new File([blob], `newtown-${game.style}.png`, { type: "image/png" });
  const text = `This game I was ${s.title} in Newtown. What are you? newtown.world`;
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, title: s.title });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share({ text, title: s.title, url: location.origin });
      return "shared";
    }
  } catch {
    return "cancelled";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  return "saved";
}
