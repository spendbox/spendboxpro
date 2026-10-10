"use client";

import { useEffect, useRef, useState } from "react";
import {
  Anchor, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bike, Bird, Cake, Car, Cat, Cherry, Crown, Diamond, Dog, Drum, Fish, Flame, Flower2, Gem, Ghost, Gift, Guitar, Heart, Key, Leaf, Moon, Music, Plane, Rocket, Shell, Snowflake, Star, Sun, TreePalm, Trophy, Umbrella, Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { makeRng, shuffle, type Rng } from "../rng";
import { tone } from "../sfx";
import { useFinish, useKeys } from "../stage";
import type { EngineProps } from "../types";

// Memory games. mode:
//   simon  - Vault Code: repeat the keypad code; one more key each level (score: levels).
//   outfit - Disguise Match: remember the outfit, then pick it from four (score: matches).
//   pairs  - Memory Pairs: find the pairs in as few turns and seconds as you can.
//   tiles  - Mahjong Tiles: clear free matching tiles in pairs (the deal is always solvable).
//   moves  - Dance Copy: repeat the dancer's moves; one more each round (score: moves).

export default function Memory(props: EngineProps) {
  const mode = String(props.cfg.mode ?? "pairs");
  if (mode === "simon" || mode === "moves") return <Simon {...props} moves={mode === "moves"} />;
  if (mode === "outfit") return <Outfit {...props} />;
  if (mode === "tiles") return <Tiles {...props} />;
  return <Pairs {...props} />;
}

// ---------------------------------------------------------------- Vault Code / Dance Copy

const KEY_COLOURS = ["#e03131", "#f08c00", "#fab005", "#2f9e44", "#1c7ed6", "#7048e8", "#e64980", "#12b886", "#868e96"];
const MOVE_ICONS = [ArrowUp, ArrowDown, ArrowLeft, ArrowRight];
const MOVE_NAMES = ["Hands up", "Get down", "Slide left", "Slide right"];

function Simon({ seed, onEnd, moves }: EngineProps & { moves: boolean }) {
  const finish = useFinish(onEnd);
  const keys = moves ? 4 : 9;
  const [seq, setSeq] = useState<number[]>(() => {
    const r = makeRng(seed);
    return Array.from({ length: 40 }, () => Math.floor(r() * keys));
  });
  const [level, setLevel] = useState(moves ? 2 : 3);
  const [lit, setLit] = useState<number | null>(null);
  const [showing, setShowing] = useState(true);
  const [pos, setPos] = useState(0);
  const [wrong, setWrong] = useState<number | null>(null);
  const done = useRef(false);

  // Show the sequence.
  useEffect(() => {
    if (!showing) return;
    let i = 0;
    const gap = Math.max(260, 620 - level * 25);
    const timers: number[] = [];
    const step = () => {
      if (i >= level) {
        setLit(null);
        setShowing(false);
        setPos(0);
        return;
      }
      setLit(seq[i]);
      tone(300 + seq[i] * 60, 0.18);
      timers.push(window.setTimeout(() => setLit(null), gap * 0.6));
      i++;
      timers.push(window.setTimeout(step, gap));
    };
    timers.push(window.setTimeout(step, 700));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [showing, level, seq]);

  function press(k: number) {
    if (showing || done.current) return;
    tone(300 + k * 60, 0.15);
    setLit(k);
    window.setTimeout(() => setLit((l) => (l === k ? null : l)), 150);
    if (k !== seq[pos]) {
      done.current = true;
      setWrong(k);
      playSfx("denied");
      window.setTimeout(() => finish(level - 1), 900);
      return;
    }
    if (pos + 1 >= level) {
      playSfx("chime");
      if (level + 1 > seq.length) setSeq((s) => [...s, ...s]);
      setLevel((l) => l + 1);
      setShowing(true);
    } else setPos(pos + 1);
  }
  useKeys((k) => {
    if (moves) {
      const i = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(k);
      if (i >= 0) press(i);
    } else if (/^[1-9]$/.test(k)) press(Number(k) - 1);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 font-bold text-white">
        <span>{moves ? `Moves: ${level}` : `Code length: ${level}`}</span>
        <span className="text-sm text-white/70">{showing ? "Watch…" : wrong !== null ? "Wrong!" : `Your turn (${pos}/${level})`}</span>
      </div>
      {moves && (
        <div className="grid h-40 place-items-center rounded-3xl bg-[#2b1d35]">
          {(() => {
            const Icon = lit !== null ? MOVE_ICONS[lit] : Music;
            return (
              <div className="text-center text-white">
                <Icon className={cn("mx-auto size-16", lit !== null && "act-pop")} key={`${lit}-${pos}-${level}`} />
                <p className="mt-1 font-semibold">{lit !== null ? MOVE_NAMES[lit] : showing ? "…" : "Copy the moves!"}</p>
              </div>
            );
          })()}
        </div>
      )}
      <div className={cn("grid gap-2", moves ? "grid-cols-4" : "mx-auto max-w-xs grid-cols-3")}>
        {Array.from({ length: keys }, (_, k) => {
          const Icon = moves ? MOVE_ICONS[k] : null;
          return (
            <button
              key={k}
              onPointerDown={() => press(k)}
              disabled={showing}
              className={cn("grid aspect-square place-items-center rounded-2xl text-2xl font-extrabold text-white transition", lit === k ? "scale-95 brightness-150" : "opacity-80", wrong === k && "act-shake bg-hit")}
              style={{ background: wrong === k ? undefined : lit === k ? KEY_COLOURS[k] : moves ? "#495057" : "#343a40", boxShadow: lit === k ? `0 0 24px ${KEY_COLOURS[k]}` : undefined }}
              aria-label={moves ? MOVE_NAMES[k] : `Key ${k + 1}`}
            >
              {Icon ? <Icon className="size-7" /> : k + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Disguise Match

const PALETTE = ["#e03131", "#1c7ed6", "#2f9e44", "#fab005", "#7048e8", "#212529", "#f8f9fa", "#e64980"];
type Look = [number, number, number, number];

function Person({ look, size = 90 }: { look: Look; size?: number }) {
  const [hat, shirt, trousers, glasses] = look;
  return (
    <svg viewBox="0 0 60 100" width={size * 0.6} height={size} aria-hidden>
      <rect x="18" y="4" width="24" height="10" rx="3" fill={PALETTE[hat]} />
      <rect x="14" y="12" width="32" height="4" rx="2" fill={PALETTE[hat]} />
      <circle cx="30" cy="24" r="9" fill="#f1c27d" />
      {glasses % 2 === 1 && <rect x="22" y="21" width="16" height="4" rx="2" fill="#212529" />}
      <rect x="17" y="34" width="26" height="30" rx="6" fill={PALETTE[shirt]} stroke="#0002" />
      <rect x="18" y="62" width="10" height="32" rx="4" fill={PALETTE[trousers]} />
      <rect x="32" y="62" width="10" height="32" rx="4" fill={PALETTE[trousers]} />
    </svg>
  );
}

function Outfit({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const rounds = Number(cfg.rounds ?? 8);
  const [R] = useState<Rng>(() => makeRng(seed));
  const make = (): { look: Look; options: Look[]; right: number } => {
    const look: Look = [Math.floor(R() * 8), Math.floor(R() * 8), Math.floor(R() * 8), Math.floor(R() * 2)];
    const options: Look[] = [look];
    while (options.length < 4) {
      const o = [...look] as Look;
      const k = Math.floor(R() * 4);
      o[k] = k === 3 ? 1 - o[3] : (o[k] + 1 + Math.floor(R() * 7)) % 8;
      if (!options.some((x) => x.join() === o.join())) options.push(o);
    }
    const sh = shuffle(R, options);
    return { look, options: sh, right: sh.findIndex((x) => x === look) };
  };
  const [q, setQ] = useState(make);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<"look" | "pick" | "result">("look");
  const [picked, setPicked] = useState<number | null>(null);
  const showMs = Math.max(900, 3000 - round * 280);

  useEffect(() => {
    if (phase !== "look") return;
    const id = window.setTimeout(() => setPhase("pick"), showMs);
    return () => window.clearTimeout(id);
  }, [phase, showMs]);

  function pick(i: number) {
    if (phase !== "pick") return;
    setPicked(i);
    setPhase("result");
    const ok = i === q.right;
    const next = score + (ok ? 1 : 0);
    if (ok) setScore(next);
    playSfx(ok ? "chime" : "denied");
    window.setTimeout(() => {
      if (round + 1 >= rounds) return finish(next);
      setRound(round + 1);
      setQ(make());
      setPicked(null);
      setPhase("look");
    }, 900);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 font-bold text-white">
        <span>
          Round {round + 1} of {rounds}
        </span>
        <span>{score} matched</span>
      </div>
      {phase === "look" ? (
        <div className="grid h-72 place-items-center rounded-3xl bg-[#e7f5ff]">
          <div className="text-center">
            <p className="mb-2 text-sm font-semibold text-muted">Remember this guard&apos;s outfit</p>
            <Person look={q.look} size={170} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {q.options.map((o, i) => (
            <button
              key={i}
              onClick={() => pick(i)}
              className={cn("grid h-36 place-items-center rounded-2xl bg-panel-2", picked !== null && i === q.right && "ring-4 ring-me", picked === i && i !== q.right && "ring-4 ring-hit")}
            >
              <Person look={o} size={120} />
            </button>
          ))}
        </div>
      )}
      <p className="text-center text-sm text-muted">{phase === "look" ? "Hat, glasses, shirt, trousers…" : "Which one is the same?"}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Memory Pairs

const PAIR_ICONS: LucideIcon[] = [Star, Heart, Sun, Moon, Fish, Bird, Car, Plane, Rocket, Gift, Crown, Key, Anchor, Flame, Leaf, Music];
const PAIR_COLOURS = ["#e03131", "#e64980", "#f08c00", "#5f3dc4", "#1c7ed6", "#2f9e44", "#d6336c", "#1971c2", "#7048e8", "#c2255c", "#e8590c", "#495057", "#0c8599", "#fd7e14", "#37b24d", "#ae3ec9"];

function Pairs({ seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const [cards] = useState(() => {
    const r = makeRng(seed);
    const kinds = shuffle(r, PAIR_ICONS.map((_, i) => i)).slice(0, 8);
    return shuffle(r, [...kinds, ...kinds]);
  });
  const [open, setOpen] = useState<number[]>([]);
  const [found, setFound] = useState<Set<number>>(new Set());
  const [turns, setTurns] = useState(0);
  const [secs, setSecs] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    const id = window.setInterval(() => setSecs((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  function flip(i: number) {
    if (busy.current || open.includes(i) || found.has(cards[i])) return;
    playSfx("tick");
    const next = [...open, i];
    setOpen(next);
    if (next.length < 2) return;
    setTurns((t) => t + 1);
    busy.current = true;
    const [a, b] = next;
    if (cards[a] === cards[b]) {
      const f = new Set(found).add(cards[a]);
      window.setTimeout(() => {
        setFound(f);
        setOpen([]);
        busy.current = false;
        playSfx("chime");
        if (f.size === 8) {
          finish(Math.max(0, Math.round(900 - (turns + 1) * 25 - secs * 4)));
        }
      }, 350);
    } else {
      window.setTimeout(() => {
        setOpen([]);
        busy.current = false;
      }, 750);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 font-bold text-white">
        <span>{turns} turns</span>
        <span>{found.size} / 8 pairs</span>
      </div>
      <div className="mx-auto grid max-w-sm grid-cols-4 gap-2">
        {cards.map((k, i) => {
          const up = open.includes(i) || found.has(k);
          const Icon = PAIR_ICONS[k];
          return (
            <button
              key={i}
              onClick={() => flip(i)}
              className={cn("grid aspect-square place-items-center rounded-2xl transition", up ? "bg-white shadow" : "bg-[#5f3dc4]", found.has(k) && "opacity-60")}
              aria-label={up ? "Card" : "Hidden card"}
            >
              {up ? <Icon className="act-pop size-8" style={{ color: PAIR_COLOURS[k] }} /> : <Ghost className="size-6 text-white/30" />}
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted">Fewer turns and a quicker finish score more.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Mahjong Tiles

const TILE_ICONS: LucideIcon[] = [Star, Heart, Sun, Moon, Fish, Bird, Cat, Dog, Flower2, Leaf, Cherry, Cake, Diamond, Gem, Zap, Drum, Guitar, Snowflake, Umbrella, TreePalm, Shell, Bike, Trophy, Crown];
type Tile = { id: number; x: number; y: number; z: number; kind: number; gone: boolean };
const TIME = 150;

/** The layout: a three-layer pyramid (x, y in half-tile steps). */
function layout(): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) out.push({ x: x * 2, y: y * 2, z: 0 });
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) out.push({ x: 2 + x * 2, y: 2 + y * 2, z: 1 });
  for (let y = 0; y < 1; y++) for (let x = 0; x < 2; x++) out.push({ x: 4 + x * 2, y: 4, z: 2 });
  return out; // 30 + 12 + 2 = 44 tiles, 22 pairs
}

function isFree(t: Tile, all: Tile[]) {
  if (t.gone) return false;
  const live = all.filter((o) => !o.gone && o !== t);
  const covered = live.some((o) => o.z === t.z + 1 && Math.abs(o.x - t.x) < 2 && Math.abs(o.y - t.y) < 2);
  if (covered) return false;
  const left = live.some((o) => o.z === t.z && o.y === t.y && o.x === t.x - 2);
  const right = live.some((o) => o.z === t.z && o.y === t.y && o.x === t.x + 2);
  return !left || !right;
}

function deal(seed: number): Tile[] {
  const r = makeRng(seed);
  const pos = layout();
  const tiles: Tile[] = pos.map((p, id) => ({ id, ...p, kind: -1, gone: false }));
  // Take pairs off a full board in reverse; giving each pair the same picture guarantees a way
  // to clear the board.
  const kinds = shuffle(r, Array.from({ length: tiles.length / 2 }, (_, i) => i % TILE_ICONS.length));
  for (let k = 0; k < kinds.length; k++) {
    const free = tiles.filter((t) => isFree(t, tiles));
    if (free.length < 2) break;
    const a = free.splice(Math.floor(r() * free.length), 1)[0];
    const b = free.splice(Math.floor(r() * free.length), 1)[0];
    a.kind = b.kind = kinds[k];
    a.gone = b.gone = true;
  }
  for (const t of tiles) t.gone = t.kind < 0;
  return tiles.map((t) => ({ ...t, gone: t.kind < 0 }));
}

function Tiles({ seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const [tiles, setTiles] = useState<Tile[]>(() => deal(seed));
  const [sel, setSel] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME);
  const done = useRef(false);
  const left = tiles.filter((t) => !t.gone).length;
  const freeKinds = new Map<number, number>();
  for (const t of tiles) if (isFree(t, tiles)) freeKinds.set(t.kind, (freeKinds.get(t.kind) ?? 0) + 1);
  const stuck = left > 0 && ![...freeKinds.values()].some((n) => n >= 2);

  useEffect(() => {
    const id = window.setInterval(() => setTimeLeft((x) => x - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (timeLeft > 0 || done.current) return;
    done.current = true;
    finish(score);
  }, [timeLeft, score, finish]);

  function tap(t: Tile) {
    if (done.current || !isFree(t, tiles)) return;
    if (sel === null || sel === t.id) return setSel(sel === t.id ? null : t.id);
    const other = tiles[sel];
    if (other.kind !== t.kind) return setSel(t.id);
    playSfx("chime");
    const next = tiles.map((x) => (x.id === t.id || x.id === other.id ? { ...x, gone: true } : x));
    setTiles(next);
    setSel(null);
    const s = score + 40;
    setScore(s);
    if (next.every((x) => x.gone)) {
      done.current = true;
      const bonus = Math.max(0, timeLeft * 3);
      finish(s + bonus);
    }
  }
  function reshuffle() {
    const r = makeRng(seed + left * 31 + score);
    const live = tiles.filter((t) => !t.gone);
    const kinds = shuffle(r, live.map((t) => t.kind));
    let k = 0;
    setTiles(tiles.map((t) => (t.gone ? t : { ...t, kind: kinds[k++] })));
    setScore((s) => Math.max(0, s - 50));
    setSel(null);
  }

  const cell = 46;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 font-bold text-white">
        <span>{score} pts</span>
        <span>{left / 2} pairs left</span>
        <span className="tabular-nums">{Math.max(0, timeLeft)}s</span>
      </div>
      <div className="relative mx-auto overflow-hidden rounded-3xl bg-[#2b8a3e] p-2" style={{ width: cell * 6.5 + 16, height: cell * 1.25 * 5.3 + 16, maxWidth: "100%" }}>
        {[...tiles]
          .sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)
          .map((t) => {
            if (t.gone) return null;
            const free = isFree(t, tiles);
            const Icon = TILE_ICONS[t.kind];
            return (
              <button
                key={t.id}
                onClick={() => tap(t)}
                className={cn("absolute grid place-items-center rounded-lg border-b-4 border-r-4 transition", sel === t.id ? "border-[#e8590c] bg-[#fff3bf]" : "border-[#c9b98a] bg-[#fffbe6]", !free && "brightness-75")}
                style={{ left: 8 + (t.x / 2) * cell - t.z * 4, top: 8 + (t.y / 2) * cell * 1.25 - t.z * 5, width: cell - 2, height: cell * 1.25 - 2, zIndex: t.z * 10 + t.y }}
                aria-label="Tile"
              >
                <Icon className="size-6" style={{ color: PAIR_COLOURS[t.kind % PAIR_COLOURS.length] }} />
              </button>
            );
          })}
      </div>
      {stuck && (
        <button onClick={reshuffle} className="w-full rounded-2xl bg-gold py-2.5 text-sm font-bold">
          No pairs free: shuffle (−50)
        </button>
      )}
      <p className="text-center text-xs text-muted">A tile is free when nothing is on top of it and its left or right side is open.</p>
    </div>
  );
}
