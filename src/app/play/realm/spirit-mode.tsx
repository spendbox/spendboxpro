"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Ghost, Swords } from "lucide-react";
import { Trophy, X } from "@/components/icons";
import { cn } from "@/lib/cn";
import { Battle, DT, STEPS, WILD, inArena, type BattleArmy, type Wave } from "@/lib/realm/battle";
import { MAX_SPEND_PER_BATTLE, battleAt, battleEnd, canSend, hourLabel } from "@/lib/realm/schedule";
import type { Army } from "@/lib/realm/fighters";
import { REGIONS } from "@/lib/world";
import { toTile } from "@/lib/world/geo";
import { cash } from "@/lib/world/value";
import type { RealmFrame, RealmSource } from "../city/realm-layer";
import { realmMe, sendTroops, type RealmMe } from "./actions";
import { armyColour } from "./draw";
import { TroopsSheet } from "./troops-sheet";

// Spirit mode (docs/REALM.md): the city empties and turns purple, and the hour's battle is fought
// on the map. This plays the battle on the phone (src/lib/realm/battle.ts) in step with the clock,
// asks the server every few seconds for troops just sent, hands each frame to the map
// (./city/realm-layer), and shows the few controls there are: the clock, the scores, the arenas,
// and Send troops.

/** The arena on the map: tiles per battle unit (100 units: 16 tiles, 160 m, from the middle). */
const SCALE = 0.16;
/** Arenas side by side on the map, this far apart (tiles). */
const ARENA_GAP = 40;
const WILD_COLOUR = "#b8c4ff";
/** Most battle steps worked out in one frame (catching up after opening mid-battle). */
const STEPS_PER_FRAME = 500;

type ArenaData = {
  at: number;
  seed: number;
  arena: number;
  arenas: number;
  armies: BattleArmy[];
  waves: Wave[];
  results: { id: string; rank: number; points: number; prize: number }[] | null;
  off?: boolean;
};

/** Where an arena is on the map: the first round the region's starting spot, the rest in rings round it. */
function arenaCentre(region: string, arena: number) {
  const r = REGIONS[region];
  const base = r ? toTile(r, r.start) : { x: 0, z: 0 };
  if (arena === 0) return { x: Math.round(base.x), z: Math.round(base.z) };
  // Rings of 8, 16, 24... round the first.
  let ring = 1;
  let i = arena - 1;
  while (i >= ring * 8) {
    i -= ring * 8;
    ring++;
  }
  const side = ring * 2;
  const k = i % (side * 4);
  const leg = Math.floor(k / side);
  const t = (k % side) - ring;
  const [dx, dz] = leg === 0 ? [t, -ring] : leg === 1 ? [ring, t] : leg === 2 ? [-t, ring] : [-ring, -t];
  return { x: Math.round(base.x + dx * ARENA_GAP), z: Math.round(base.z + dz * ARENA_GAP) };
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

type Score = { id: string; name: string; colour: string; points: number; now: number; mine: boolean };

export function SpiritMode({
  region,
  guest,
  source,
  tapRef,
  onExit,
  onSignIn,
}: {
  region: string;
  guest: boolean;
  /** Filled with what the map draws (the map reads it every frame). */
  source: { current: RealmSource | null };
  /** Filled with what a tap on the map does in Spirit mode. */
  tapRef: { current: ((x: number, z: number) => void) | null };
  onExit: () => void;
  onSignIn: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const at = battleAt(now);
  const [me, setMe] = useState<RealmMe | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [data, setData] = useState<ArenaData | null>(null);
  const [off, setOff] = useState(false);
  const [scores, setScores] = useState<Score[]>([]);
  const [catching, setCatching] = useState(0);
  const [boardOpen, setBoardOpen] = useState(true);
  const [shop, setShop] = useState(false);
  const [troops, setTroops] = useState<Army>({ fighters: { soldier: 20, archer: 10 }, weapons: 0, armour: 0 });
  // Choosing where troops come in: waiting for a tap, then the spot tapped.
  const [placing, setPlacing] = useState<{ x: number; y: number } | null | "tap">(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [lastSeen, setLastSeen] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadMe = useCallback(() => {
    realmMe().then((m) => {
      setMe(m);
      if (m.off) setOff(true);
    }, () => {});
  }, []);
  // You, again when a new battle begins.
  useEffect(loadMe, [loadMe, at]);

  const mine = me?.now.at === at ? me.now.mine : null;
  const arena = pick ?? mine?.arena ?? 0;
  const centre = useMemo(() => arenaCentre(region, arena), [region, arena]);

  // The arena's players and troops, again every few seconds (troops come through 20 s after they're sent).
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let stop = false;
    const get = () =>
      fetch(`/api/realm?at=${at}&arena=${arena}`)
        .then((r) => r.json())
        .then((d: ArenaData) => {
          if (stop) return;
          // Not set up yet: the realm still shows, with only its wild spirits roaming.
          if (d.off) {
            setOff(true);
            return setData({ at, arena, arenas: 0, seed: 0, armies: [], waves: [], results: null });
          }
          if (d.at === at && d.arena === arena) setData(d);
        })
        .catch(() => {});
    get();
    const t = setInterval(get, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [at, arena, nonce]);

  // The battle itself, played here. Rebuilt for a new battle or arena, or when troops turn up that
  // should already have come through (it plays back up to now in a moment).
  const battle = useRef<{ key: string; b: Battle; known: Set<string> } | null>(null);
  useEffect(() => {
    if (!data) return;
    // No battle kept yet (nobody has sent troops): the wild spirits still roam, from a seed of the hour's own.
    const seed = data.seed || Math.floor(data.at / 3_600_000) + data.arena * 7919;
    const key = `${data.at}|${data.arena}|${seed}`;
    const cur = battle.current;
    const fresh = () => {
      battle.current = { key, b: new Battle({ seed, armies: data.armies, waves: data.waves }), known: new Set(data.waves.map((w) => `${w.by}:${w.n}`)) };
    };
    if (!cur || cur.key !== key) return fresh();
    // New players join at the end of the list; anything else: start again.
    const have = cur.b.armies.length - 1;
    if (data.armies.slice(0, have).some((a, i) => a.id !== cur.b.armies[i + 1].id)) return fresh();
    for (const a of data.armies.slice(have)) cur.b.addArmy(a);
    for (const w of data.waves) {
      const id = `${w.by}:${w.n}`;
      if (cur.known.has(id)) continue;
      if (!cur.b.addWave(w)) return fresh();
      cur.known.add(id);
    }
  }, [data]);

  const mySeq = mine?.seq ?? null;
  const placingRef = useRef(placing);
  useEffect(() => {
    placingRef.current = placing;
  }, [placing]);

  // What the map draws each frame.
  useEffect(() => {
    let lastUi = 0;
    source.current = {
      centre,
      scale: SCALE,
      frame: (): RealmFrame | null => {
        const cur = battle.current;
        const p = placingRef.current;
        const place = p && p !== "tap" ? { x: p.x, y: p.y, ok: inArena(p.x, p.y) } : null;
        if (!cur) return null;
        const b = cur.b;
        const wall = Date.now();
        const target = Math.min(STEPS, (wall - at) / (DT * 1000));
        // Catch up a bit at a time, so opening mid-battle never freezes the phone.
        let budget = STEPS_PER_FRAME;
        while (b.step < Math.floor(target) && budget-- > 0) b.advance();
        const behind = Math.floor(target) - b.step;
        const colours = b.armies.map((a) => (a.id === WILD ? WILD_COLOUR : armyColour(Number(a.id))));
        const mineIdx = mySeq === null ? -1 : b.armies.findIndex((a) => a.id === String(mySeq));
        const portals: RealmFrame["portals"] = [];
        for (const w of b.pending) {
          const secs = (w.step - b.step) * DT;
          if (secs > 25) break;
          portals.push({ x: w.x, y: w.y, colour: colours[w.by + 1] ?? WILD_COLOUR, secs });
        }
        for (let k = b.arrived.length - 1; k >= 0 && portals.length < 40; k--) {
          const w = b.arrived[k];
          const secs = (w.step - b.step) * DT;
          if (secs < -3) break;
          portals.push({ x: w.x, y: w.y, colour: colours[w.by + 1] ?? WILD_COLOUR, secs });
        }
        if (wall - lastUi > 500) {
          lastUi = wall;
          setCatching(behind > 40 ? Math.round((b.step / Math.max(1, target)) * 100) : 0);
          setScores(
            b.armies
              .map((a, i) => ({ id: a.id, name: a.name, colour: colours[i], points: a.points, now: a.now, mine: i === mineIdx }))
              .filter((a) => a.id !== WILD)
              .sort((x, y) => y.points - x.points),
          );
        }
        return { battle: b, t: behind > 0 ? 1 : Math.max(0, Math.min(1, target - b.step)), colours, mine: mineIdx < 0 ? null : mineIdx, portals, placing: place };
      },
    };
    return () => {
      source.current = null;
    };
  }, [centre, at, mySeq, source]);

  // A tap on the map while choosing where: that spot (in the arena's units).
  useEffect(() => {
    tapRef.current = (x, z) => {
      if (!placingRef.current) return;
      setPlacing({ x: (x - centre.x) / SCALE, y: (z - centre.z) / SCALE });
    };
    return () => {
      tapRef.current = null;
    };
  }, [centre, tapRef]);

  const say = (text: string, good = false) => {
    setMessage({ text, good });
    setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 5000);
  };

  const open = canSend(at, now);
  const leftInBattle = MAX_SPEND_PER_BATTLE - (mine?.spent ?? 0);
  const send = async () => {
    if (!placing || placing === "tap" || busy) return;
    if (!inArena(placing.x, placing.y)) return say("Pick a spot inside the glowing ring.");
    setBusy(true);
    const r = await sendTroops(at, placing.x, placing.y, troops);
    setBusy(false);
    if (!r.ok) return say(r.error);
    setMe(r.me);
    setPlacing(null);
    setPick(null);
    setNonce((n) => n + 1);
    say(`On their way! They come through the portal in ${r.secs} seconds.`, true);
  };

  // The last battle's result, once it's paid (shown once).
  const last = me?.last ?? null;
  const showLast = last && last.at === at - 3_600_000 && lastSeen !== last.at;

  const ends = battleEnd(at);
  const myScore = scores.find((s) => s.mine);
  const top = scores.slice(0, 5);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col text-white">
      {/* The top: what this is, the clock, and the way back. */}
      <div className="pointer-events-auto mx-2.5 mt-[max(10px,env(safe-area-inset-top))] flex items-center gap-2 rounded-2xl bg-[#140a2e]/85 px-3 py-2 shadow-lg backdrop-blur sm:mx-4">
        <Ghost className="size-5 shrink-0 text-violet-300" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-sm font-extrabold tracking-tight">Spirit Realm</div>
          <div className="truncate text-[11px] text-violet-200">
            Battle {hourLabel(at)}–{hourLabel(ends)} · <b className="tabular-nums text-gold">{mmss(ends - now)}</b> left
            {data && data.armies.length > 0 && ` · ${data.armies.length} ${data.armies.length === 1 ? "army" : "armies"} here`}
          </div>
        </div>
        <button onClick={onExit} className="flex items-center gap-1 rounded-xl bg-white/10 px-2.5 py-1.5 text-xs font-semibold" aria-label="Back to the city">
          <X className="size-4" /> City
        </button>
      </div>

      {data && data.arenas > 1 && (
        <div className="pointer-events-auto mx-2.5 mt-2 flex gap-1.5 overflow-x-auto pb-1 sm:mx-4">
          {Array.from({ length: data.arenas }, (_, n) => (
            <button key={n} onClick={() => setPick(n)} className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold shadow", n === arena ? "bg-violet-400 text-[#140a2e]" : "bg-[#140a2e]/80 text-violet-100")}>
              Arena {n + 1}
              {mine?.arena === n && " (yours)"}
            </button>
          ))}
        </div>
      )}

      {/* The scores: points for every enemy brought down. */}
      <div className="pointer-events-auto mx-2.5 mt-2 w-56 self-end rounded-2xl bg-[#140a2e]/80 p-2 text-xs shadow-lg backdrop-blur sm:mx-4">
        <button onClick={() => setBoardOpen((o) => !o)} className="flex w-full items-center gap-1.5 font-bold text-violet-100">
          <Trophy className="size-3.5 text-gold" /> Scores
          <span className="flex-1" />
          {boardOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        {boardOpen && (
          <ol className="mt-1.5 space-y-1">
            {top.length === 0 && <li className="text-violet-200">No armies yet. Wild spirits roam the realm.</li>}
            {top.map((s, i) => (
              <li key={s.id} className={cn("flex items-center gap-1.5 rounded-lg px-1.5 py-0.5", s.mine && "bg-white/15")}>
                <span className="w-3 text-violet-300">{i + 1}</span>
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.colour }} />
                <span className="min-w-0 flex-1 truncate">{s.mine ? "You" : s.name}</span>
                <span className="tabular-nums font-semibold">{Math.round(s.points)}</span>
              </li>
            ))}
            {myScore && !top.includes(myScore) && (
              <li className="flex items-center gap-1.5 rounded-lg bg-white/15 px-1.5 py-0.5">
                <span className="w-3 text-violet-300">{scores.indexOf(myScore) + 1}</span>
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: myScore.colour }} />
                <span className="min-w-0 flex-1 truncate">You</span>
                <span className="tabular-nums font-semibold">{Math.round(myScore.points)}</span>
              </li>
            )}
          </ol>
        )}
        {boardOpen && <p className="mt-1.5 text-[10px] leading-snug text-violet-300">At the end of the hour the top 3 share 85% of what everyone here spent.</p>}
      </div>

      <div className="flex-1" />

      {catching > 0 && (
        <div className="mx-auto mb-3 rounded-full bg-[#140a2e]/85 px-3 py-1.5 text-xs text-violet-100 shadow">Entering the realm… {catching}%</div>
      )}
      {message && (
        <div className={cn("pointer-events-auto mx-auto mb-3 max-w-sm rounded-xl px-3 py-2 text-center text-sm shadow-lg", message.good ? "bg-me text-white" : "bg-hit text-white")} role="status">
          {message.text}
        </div>
      )}
      {showLast && last && (
        <div className="pointer-events-auto mx-auto mb-3 w-[min(92vw,360px)] rounded-2xl bg-[#140a2e]/90 p-3 text-center shadow-lg backdrop-blur">
          <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-gold">
            <Trophy className="size-4" /> {last.rank === 1 ? "You won the last battle!" : `Last battle: you were number ${last.rank} of ${last.players}`}
          </div>
          <div className="mt-0.5 text-xs text-violet-100">
            {Math.round(last.points)} points{last.prize > 0 ? ` · you won ${cash(last.prize)}` : ""}
          </div>
          <button onClick={() => setLastSeen(last.at)} className="mt-2 rounded-xl bg-white/10 px-3 py-1 text-xs font-semibold">
            OK
          </button>
        </div>
      )}
      {off && <div className="mx-auto mb-3 rounded-xl bg-[#140a2e]/90 px-3 py-2 text-sm">The Spirit Realm opens soon (the game&apos;s owner has one update to run).</div>}

      {/* The bottom: send troops, or choose where they come in. */}
      <div className="pointer-events-auto mx-2.5 mb-[max(12px,env(safe-area-inset-bottom))] rounded-2xl bg-[#140a2e]/85 p-2.5 shadow-lg backdrop-blur sm:mx-auto sm:w-[420px]">
        {placing ? (
          <>
            <p className="mb-2 text-center text-sm text-violet-100">
              {placing === "tap" ? "Tap a spot inside the glowing ring." : inArena(placing.x, placing.y) ? "Your troops come through a portal here and march on the middle." : "That's outside the ring: tap inside it."}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPlacing(null)} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold">
                Cancel
              </button>
              <button onClick={send} disabled={busy || placing === "tap" || !inArena(placing.x, placing.y)} className="flex-1 rounded-xl bg-gold py-2.5 text-sm font-bold text-[#140a2e] disabled:opacity-40">
                {busy ? "…" : "Send them here"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 text-xs leading-snug text-violet-100">
              {myScore ? (
                <>
                  You: <b className="text-white">{Math.round(myScore.points)} points</b> · {cash(mine?.spent ?? 0)} spent
                </>
              ) : (
                "Buy troops and send them in. Bring down the most enemies to win."
              )}
            </div>
            <button
              onClick={() => (guest ? onSignIn() : setShop(true))}
              disabled={!open || off}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-400 px-4 py-2.5 text-sm font-bold text-[#140a2e] shadow-[0_0_20px_rgba(167,139,250,0.6)] disabled:opacity-40 disabled:shadow-none"
            >
              <Swords className="size-4" /> {open ? "Send troops" : `Next battle ${hourLabel(ends)}`}
            </button>
          </div>
        )}
      </div>

      {shop && (
        <div className="pointer-events-auto">
          <TroopsSheet
            start={troops}
            canSpend={me?.canSpend ?? null}
            leftInBattle={leftInBattle}
            onClose={() => setShop(false)}
            onChoose={(t) => {
              setTroops(t);
              setShop(false);
              // Your own arena (where your troops go).
              if (mine) setPick(null);
              setPlacing("tap");
            }}
          />
        </div>
      )}
    </div>
  );
}
