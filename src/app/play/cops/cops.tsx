"use client";

import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Bomb, Bot, Check, Clock, Copy, Crosshair, Crown, Download, Eye, HeartPulse, LoaderCircle, LogOut, Play, Shield, ShoppingCart, Siren, Swords, Trophy, Truck, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { GEAR, PRACTICE_LOADOUT, SIDES, copsMint, type GearId, type Loadout } from "@/lib/cops";
import { countdown, sessionsNow, startLabel, timeOfDay } from "@/lib/scheduled";
import { cash } from "@/lib/world/value";
import { copsBuy, copsJoin, copsLeave, copsReport, copsRoom, copsStatus, type BoardRow, type CopsResult, type CopsRoom, type CopsStatus } from "../cops-actions";
import { FullScreen } from "../minigames/fullscreen";
import { newCode } from "../paintball/net";
import { playSfx } from "../sound";
import { CopsNet, type Msg } from "./net";
import { Match, type EndResult, type Setup } from "./match";

// Police & Thieves: the lobby. A big game every 8 hours (2am, 10am and 6pm Lagos time). Sign up
// on a side (the sides stay even), buy your guns, grenades, rocket launchers and tank before it
// starts (everything spent goes into the pool), then play: thieves rob the bank, police stop
// them. The winning side shares its match's pool by what each of them did. Not playing? Watch a
// match that's on. The end: the last moment captured, with the leaderboard over it.

const GAME = "cops-robbers";
type Me = { id: string; name: string; avatar?: unknown };
/** sample: the code of the friends' room a sample game is played from (null: alone, or the real game). */
type Screen = { k: "lobby" } | { k: "room" } | { k: "play"; setup: Setup; live: boolean; sample: boolean } | { k: "done"; result: EndResult; setup: Setup; live: boolean; sample: boolean };
const TODS = ["day", "dusk", "night"] as const;

/** A sample game alone against bots: 5 minutes, a random city and time of day, every weapon. */
function soloSample(p: Me, tm: number): Setup {
  const t = Date.now();
  return { key: null, room: 0, seed: Math.floor(Math.random() * 1e9), fightAt: t + 5000, endsAt: t + 5000 + 300_000, roster: [{ i: p.id, n: p.name, tm, g: PRACTICE_LOADOUT, a: p.avatar }], tod: TODS[Math.floor(Math.random() * 3)], watch: false, pool: 0 };
}

const GEAR_ICON: Record<GearId, React.ComponentType<{ className?: string }>> = { smg: Crosshair, shotgun: Crosshair, rifle: Crosshair, sniper: Crosshair, rocket: Swords, grenade: Bomb, medkit: HeartPulse, armour: Shield, tank: Truck };

/** The clock, ticking once a second (for countdowns). */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function CopsRobbers({ me, onClose, demo }: { me: Me | null; onClose: () => void; demo?: CopsStatus }) {
  const meAvatar = me?.avatar;
  const router = useRouter();
  const now = useNow();
  const { live, next } = sessionsNow(GAME, now);
  const [st, setSt] = useState<CopsStatus | null>(demo ?? null);
  const [off, setOff] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ k: "lobby" });
  const meId = me?.id ?? null;
  const meName = me?.name ?? "Player";
  const who = useMemo(() => (meId ? { id: meId, name: meName, avatar: meAvatar } : null), [meId, meName, meAvatar]);
  // Sample games need no sign-in: someone who isn't signed in plays as a guest.
  const [guest] = useState(() => ({ id: crypto.randomUUID(), name: "Guest" }));
  const player = who ?? guest;
  // A sample game with friends: the room's code, and its live channel (from the room through its matches).
  const [sample, setSample] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const sampleNet = useMemo(() => (sample ? new CopsNet(`sample:${sample}`, player, "play") : null), [sample, player]);
  useEffect(() => {
    if (!sampleNet) return;
    sampleNet.open();
    return () => sampleNet.close();
  }, [sampleNet]);

  const refresh = useCallback(async () => {
    const res = await copsStatus().catch(() => null);
    if (!res) return;
    if (!res.ok) {
      if (res.off) setOff(true);
      else setErr(res.error);
      return;
    }
    setOff(false);
    setSt(res);
  }, []);
  // Every 15 seconds while the lobby is open (and when a game starts or ends).
  const phase = `${live?.key ?? ""}|${next.key}`;
  useEffect(() => {
    if (screen.k !== "lobby" || demo) return;
    const first = window.setTimeout(() => void refresh(), 0);
    const id = window.setInterval(() => void refresh(), 15000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [refresh, phase, screen.k, demo]);

  const nextMe = st?.next.key === next.key ? st.next.me : { in: false };
  const liveMe = live && st?.live?.key === live.key ? st.live.me : { in: false };
  const counts = st?.next.key === next.key ? st.next : { police: 0, thieves: 0, pool: 0 };

  async function act(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(label);
    setErr(null);
    const res = await fn().catch(() => ({ ok: false, error: "The connection blinked. Try again." }));
    setBusy(null);
    if (!res.ok) {
      setErr(res.error ?? "Couldn't do that.");
      playSfx("miss");
      return false;
    }
    playSfx("tick");
    startTransition(() => router.refresh());
    await refresh();
    return true;
  }

  /** Into your match of the game that's on (or one to watch). */
  async function goIn(watch: boolean, room: number | null = null) {
    if (!live || !who) return;
    setBusy(watch ? "watch" : "play");
    setErr(null);
    const res = await copsRoom(live.key, room).catch(() => null);
    setBusy(null);
    if (!res || !res.ok) return setErr(res && !res.ok ? res.error : "The connection blinked. Try again.");
    if (!("seed" in res)) return setErr(res.status === "none" || !res.rooms ? "Nobody signed up for this one. Sign up for the next!" : "Getting the matches ready… try again in a moment.");
    const r = res as CopsRoom;
    setScreen({ k: "play", live: true, sample: false, setup: { key: live.key, room: r.room, seed: r.seed, fightAt: r.fightAt, endsAt: r.endsAt, roster: r.roster, tod: timeOfDay(live.starts), watch: watch || !r.me.in || r.me.room !== r.room, pool: r.pool } });
  }

  /** A free sample game against bots, now: every weapon to try, nothing to pay or win. */
  function practice(tm: number) {
    setScreen({ k: "play", live: false, sample: false, setup: soloSample(player, tm) });
  }
  const back = () => setScreen(sample ? { k: "room" } : { k: "lobby" });

  if (screen.k === "play") {
    return <Playing me={player} setup={screen.setup} net={screen.sample ? sampleNet : undefined} onQuit={back} onEnd={(result) => setScreen({ k: "done", result, setup: screen.setup, live: screen.live, sample: screen.sample })} />;
  }
  if (screen.k === "done") return <Results me={player} result={screen.result} setup={screen.setup} onBack={back} />;
  if (screen.k === "room" && sample && sampleNet) {
    return (
      <SampleRoom
        me={player}
        net={sampleNet}
        code={sample}
        onLeave={() => {
          setSample(null);
          setScreen({ k: "lobby" });
        }}
        onStart={(setup) => setScreen({ k: "play", live: false, sample: true, setup })}
      />
    );
  }
  const openRoom = (code: string) => {
    setSample(code);
    setScreen({ k: "room" });
  };

  const until = next.starts - now;
  const side = nextMe.in ? (nextMe.side ?? 0) : null;
  const ahead = counts.police > counts.thieves ? 0 : counts.thieves > counts.police ? 1 : -1;
  return (
    <FullScreen onQuit={onClose} quitLabel="Close Police & Thieves" className="bg-[#0b0e14]">
      <div className="relative flex flex-1 flex-col overflow-y-auto">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(28,79,214,.45),transparent_55%),radial-gradient(ellipse_at_85%_100%,rgba(240,140,0,.35),transparent_55%)]" />
        <div className="relative mx-auto flex w-full max-w-md flex-col gap-3 px-4 pb-10 pt-12">
          <div className="text-center">
            <p className="text-[11px] font-black tracking-[0.3em] text-[#74c0fc]">EVERY 8 HOURS · 2AM · 10AM · 6PM</p>
            <h1 className="font-display text-[44px] font-black leading-none tracking-tight text-white [text-shadow:0_4px_24px_rgba(0,0,0,.6)]">
              <span className="text-[#5c8dff]">POLICE</span> <span className="text-white/60">&amp;</span> <span className="text-[#ffa94d]">THIEVES</span>
            </h1>
            <p className="mt-1 text-sm text-white/65">Thieves rob the bank and run for the hideout. Police stop them. A whole city to fight in. The winners share the pool.</p>
          </div>

          {/* Sample games: free, any time, every weapon to try; nothing to pay and nothing won. */}
          <div className="space-y-2 rounded-3xl border border-white/10 bg-black/40 p-4 text-white">
            <p className="text-[11px] font-black tracking-[0.2em] text-white/55">SAMPLE GAMES · FREE · ANY TIME</p>
            <p className="text-xs text-white/60">Try it before the real thing: every weapon and a tank to try, unlimited lives, 5 minutes. Nothing to pay, nothing to win.</p>
            <div className="flex gap-2">
              {[0, 1].map((tm) => (
                <button key={tm} onClick={() => practice(tm)} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-2.5 text-sm font-bold" style={{ background: tm === 0 ? "rgba(28,79,214,.55)" : "rgba(232,89,12,.55)" }}>
                  <Bot className="size-4" /> As {tm === 0 ? "police" : "a thief"}
                </button>
              ))}
            </div>
            <button onClick={() => openRoom(newCode())} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/12 py-2.5 text-sm font-bold">
              <Users className="size-4" /> Sample game with friends (get a code)
            </button>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const c = joinCode.trim().toUpperCase();
                if (c.length >= 4) openRoom(c);
              }}
            >
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))} placeholder="Friend's code" className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2 font-bold tracking-widest text-white placeholder:font-normal placeholder:tracking-normal placeholder:text-white/40" />
              <button disabled={joinCode.trim().length < 4} className="rounded-xl bg-white/15 px-4 text-sm font-bold disabled:opacity-40">
                Join
              </button>
            </form>
          </div>
          {off && <p className="rounded-2xl bg-white/10 p-3 text-center text-sm text-white/80">Scheduled games are switched on soon. Practice against bots meanwhile.</p>}
          {err && <p className="rounded-2xl bg-[#ffe3e3] px-3 py-2 text-center text-sm font-semibold text-[#c92a2a]">{err}</p>}

          {/* The game being played now. */}
          {live && (
            <div className="space-y-2 rounded-3xl border border-[#ff6b6b]/40 bg-[#e03131]/15 p-4 text-white">
              <p className="flex items-center gap-2 text-xs font-black tracking-[0.2em] text-[#ff8787]">
                <span className="size-2 animate-pulse rounded-full bg-[#ff6b6b]" /> LIVE NOW · {startLabel(live.starts).toUpperCase()} GAME
              </p>
              <p className="text-sm text-white/75">
                {now < live.fight ? `Starting in ${countdown(live.fight - now)}` : `${countdown(live.ends - now)} left`}
                {st?.live ? ` · ${st.live.police + st.live.thieves} players${st.live.rooms > 1 ? ` in ${st.live.rooms} matches` : ""} · pool ${cash(st.live.pool)}` : ""}
              </p>
              <div className="flex gap-2">
                {liveMe.in && (
                  <button disabled={!!busy} onClick={() => void goIn(false)} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#e03131] py-3 font-bold shadow-[0_5px_0_#a51d1d] active:translate-y-1 active:shadow-none disabled:opacity-60">
                    {busy === "play" ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />} Go in
                  </button>
                )}
                <button disabled={!!busy || !who} onClick={() => void goIn(true, liveMe.in ? null : 1)} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/12 py-3 font-bold disabled:opacity-60">
                  {busy === "watch" ? <LoaderCircle className="size-4 animate-spin" /> : <Eye className="size-4" />} Watch
                </button>
              </div>
              {st?.live && st.live.rooms > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: st.live.rooms }, (_, k) => (
                    <button key={k} disabled={!!busy} onClick={() => void goIn(true, k + 1)} className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
                      Watch match {k + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* The next game: sign up, pick a side, buy gear. */}
          <div className="space-y-3 rounded-3xl border border-white/10 bg-black/40 p-4 text-white backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-black tracking-[0.2em] text-white/50">NEXT GAME</p>
                <p className="font-display text-2xl font-black">{startLabel(next.starts)} · {timeOfDay(next.starts) === "night" ? "at night" : timeOfDay(next.starts) === "dusk" ? "at sunset" : "in the day"}</p>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-sm font-bold tabular-nums">
                <Clock className="size-4" /> {countdown(until)}
              </span>
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold">
                <span style={{ color: SIDES[0].css }}>{counts.police} police</span>
                <span className="text-white/50">
                  <Users className="mr-1 inline size-3.5" />
                  even sides
                </span>
                <span style={{ color: SIDES[1].css }}>{counts.thieves} thieves</span>
              </div>
              <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-white/10">
                <div style={{ width: `${(counts.police / Math.max(1, counts.police + counts.thieves)) * 100}%`, background: SIDES[0].css }} />
                <div className="flex-1" style={{ background: counts.police + counts.thieves ? SIDES[1].css : "transparent" }} />
              </div>
            </div>
            <div className="flex gap-2 text-center">
              <div className="flex-1 rounded-2xl bg-[#ffd43b]/12 p-2">
                <p className="text-[10px] font-black tracking-widest text-[#ffe066]">POOL SO FAR</p>
                <p className="text-lg font-black">{cash(counts.pool)}</p>
              </div>
              {(st?.jackpot ?? 0) > 0 && (
                <div className="flex-1 rounded-2xl bg-[#ffd43b]/12 p-2">
                  <p className="text-[10px] font-black tracking-widest text-[#ffe066]">+ JACKPOT</p>
                  <p className="text-lg font-black">{cash(st?.jackpot ?? 0)}</p>
                </div>
              )}
            </div>

            {side === null ? (
              <>
                <p className="text-sm text-white/70">Pick a side: joining is free. Then buy your weapons (that&apos;s the pool). A side can&apos;t get ahead by more than one.</p>
                <div className="flex gap-2">
                  {[0, 1].map((tm) => (
                    <button
                      key={tm}
                      disabled={!who || !!busy || off || ahead === tm}
                      onClick={() => void act(`join${tm}`, () => copsJoin(next.key, tm))}
                      className="flex flex-1 flex-col items-center gap-1 rounded-2xl py-3 font-bold text-white shadow-[0_5px_0_rgba(0,0,0,.35)] active:translate-y-1 active:shadow-none disabled:opacity-45"
                      style={{ background: tm === 0 ? "#1c4fd6" : "#e8590c" }}
                    >
                      {busy === `join${tm}` ? <LoaderCircle className="size-6 animate-spin" /> : tm === 0 ? <Siren className="size-6" /> : <Swords className="size-6" />}
                      Join {SIDES[tm].name}
                      {ahead === tm && <span className="text-[10px] font-semibold text-white/80">ahead: pick the other</span>}
                    </button>
                  ))}
                </div>
                {!who && <p className="text-center text-sm text-white/70">Sign in to play.</p>}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-2xl p-3" style={{ background: side === 0 ? "rgba(28,79,214,.3)" : "rgba(232,89,12,.3)" }}>
                  {side === 0 ? <Siren className="size-6" /> : <Swords className="size-6" />}
                  <div className="min-w-0 flex-1">
                    <b className="block">You&apos;re {side === 0 ? "police" : "a thief"}</b>
                    <span className="text-xs text-white/70">Spent {cash(nextMe.spent ?? 0)} · come back at {startLabel(next.starts)}</span>
                  </div>
                  <Check className="size-5 text-[#8ce99a]" />
                </div>
                <div className="flex gap-2">
                  <button disabled={!!busy || ahead !== side} onClick={() => void act("swap", () => copsJoin(next.key, 1 - side))} className="flex-1 rounded-2xl bg-white/10 py-2 text-sm font-semibold disabled:opacity-40">
                    Switch to {SIDES[1 - side].name.toLowerCase()}
                  </button>
                  <button disabled={!!busy} onClick={() => void act("leave", () => copsLeave(next.key))} className="flex items-center justify-center gap-1.5 rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold">
                    <LogOut className="size-4" /> Pull out
                  </button>
                </div>
                <Armoury side={side} gear={nextMe.gear ?? {}} busy={busy} buy={(id) => void act(`buy:${id}`, () => copsBuy(next.key, id, 1))} />
              </>
            )}
          </div>


          {st?.last && st.last.rows.length > 0 && <LastBoard last={st.last} meId={meId} />}

          <div className="rounded-2xl bg-black/30 p-3 text-xs leading-relaxed text-white/60">
            <b className="text-white/85">How it works.</b> Joining is free: pick a side before the start, then buy your weapons and gear. Everything spent on gear goes into the pool (a tenth to the house). Up to 8 a side in a match; more players make more matches, and bots fill any gaps so the sides are always even. Unlimited lives: after every takedown you&apos;re back in 4 seconds with your weapons, until the 10 minutes are up. Thieves: stand in the vault to crack a bag of money (2 seconds) and carry it to the hideout: 3 points. Police: guard the vault; a takedown is 1, a bag taken back is 1. Most points wins, and the winning side shares its pool by what each player did (damage, takedowns, loot, time in the fight). Controls: left thumb moves, right thumb looks, tap to shoot, AIM (or SCOPE), DUCK behind low cover, JUMP, SWAP guns, grenades, medkits, TANK. AUTO aim helps you on a phone. Team chat and pings are for your side only.
        </div>
        </div>
      </div>
    </FullScreen>
  );
}

// ---------------------------------------------------------------- the shop

function Armoury({ side, gear, busy, buy }: { side: number; gear: Loadout; busy: string | null; buy: (id: GearId) => void }) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-xs font-black tracking-[0.2em] text-white/60">
        <ShoppingCart className="size-4" /> THE ARMOURY · BUY BEFORE THE START
      </p>
      <p className="text-xs text-white/55">You always have a pistol{side === 0 ? " and body armour (police get it free)" : ""}. Everything else you buy here is yours for this game.</p>
      <div className="grid grid-cols-2 gap-2">
        {GEAR.filter((g) => !(side === 0 && g.id === "armour")).map((g) => {
          const have = gear[g.id] ?? 0;
          const full = have >= g.max;
          const Icon = GEAR_ICON[g.id];
          return (
            <div key={g.id} className={cn("flex flex-col gap-1 rounded-2xl p-2.5", have ? "bg-[#2f9e44]/20 ring-1 ring-[#8ce99a]/40" : "bg-white/6")}>
              <div className="flex items-center gap-2">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", g.id === "tank" ? "bg-[#fab005] text-black" : "bg-white/10")}>
                  <Icon className="size-4" />
                </span>
                <b className="min-w-0 flex-1 text-sm leading-tight">{g.name}</b>
                {have > 0 && <span className="rounded-full bg-black/40 px-1.5 text-[10px] font-black">{g.max > 1 ? `${have}/${g.max}` : "✓"}</span>}
              </div>
              <p className="line-clamp-2 min-h-8 text-[11px] leading-tight text-white/55">{g.blurb}</p>
              <button disabled={full || !!busy} onClick={() => buy(g.id)} className="mt-auto flex items-center justify-center gap-1 rounded-xl bg-[#ffd43b] py-1.5 text-xs font-black text-black disabled:bg-white/10 disabled:text-white/40">
                {busy === `buy:${g.id}` ? <LoaderCircle className="size-3.5 animate-spin" /> : full ? "Owned" : `Buy · ${cash(copsMint(g.naira))}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LastBoard({ last, meId }: { last: NonNullable<CopsStatus["last"]>; meId: string | null }) {
  return (
    <div className="space-y-2 rounded-3xl border border-white/10 bg-black/40 p-4 text-white">
      <p className="flex items-center gap-2 text-[11px] font-black tracking-[0.2em] text-white/55">
        <Trophy className="size-4 text-[#ffd43b]" /> LAST GAME · {startLabel(Date.parse(last.starts_at)).toUpperCase()}
      </p>
      {last.me && <p className="rounded-xl bg-white/10 px-3 py-2 text-sm">{last.me.prize > 0 ? <>You won <b className="text-[#ffe066]">{cash(last.me.prize)}</b></> : "No prize for you that time."}</p>}
      <Board rows={last.rows} meId={meId} />
    </div>
  );
}

function Board({ rows, meId, pool }: { rows: BoardRow[]; meId: string | null; pool?: boolean }) {
  return (
    <ol className="space-y-1">
      {rows.map((r, k) => (
        <li key={`${r.i}${k}`} className={cn("flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm", r.i === meId ? "bg-white/15" : "bg-white/5")}>
          <span className="w-5 text-center font-black text-white/50">{k === 0 ? <Crown className="mx-auto size-4 text-[#ffd43b]" /> : k + 1}</span>
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: SIDES[r.tm]?.css }} />
          <span className="min-w-0 flex-1 truncate font-semibold">{r.n}</span>
          <span className="text-xs tabular-nums text-white/70">{r.k} KO</span>
          {r.l > 0 && <span className="text-xs tabular-nums text-[#ffe066]">{r.l} ₦</span>}
          {(pool ?? true) && <span className="w-16 text-right text-xs font-bold tabular-nums text-[#8ce99a]">{r.p > 0 ? cash(r.p) : ""}</span>}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- playing (with the live channel)

function Playing({ me, setup, net: given, onQuit, onEnd }: { me: Me; setup: Setup; net?: CopsNet | null; onQuit: () => void; onEnd: (r: EndResult) => void }) {
  // A sample game with friends brings its room's channel; the real game opens its match's.
  const code = setup.key && given === undefined ? `${setup.key}:${setup.room}` : null;
  const net = useMemo(() => (code ? new CopsNet(code, me, setup.watch || !setup.roster.some((s) => s.i === me.id) ? "watch" : "play") : null), [code, me, setup.watch, setup.roster]);
  useEffect(() => {
    if (!net) return;
    net.open();
    return () => net.close();
  }, [net]);
  return <Match me={me} setup={setup} net={given ?? net} onQuit={onQuit} onEnd={onEnd} />;
}

// ---------------------------------------------------------------- a sample game with friends

/**
 * A room with a code: friends come in with the code, the sides are shared out in turn as they
 * come (so they stay even; bots fill the rest), and the first one in starts it. Free, every weapon.
 */
function SampleRoom({ me, net, code, onLeave, onStart }: { me: Me; net: CopsNet; code: string; onLeave: () => void; onStart: (s: Setup) => void }) {
  const members = useSyncExternalStore(net.subscribe, net.getMembers, net.getMembers);
  const [mins, setMins] = useState(5);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);
  const cb = useRef(onStart);
  useEffect(() => {
    cb.current = onStart;
  });
  const setupOf = useCallback(
    (m: Extract<Msg, { t: "start" }>): Setup => ({ key: null, room: 0, seed: m.seed, fightAt: m.at, endsAt: m.ends, tod: m.tod, watch: !m.roster.some((r) => r.i === me.id), pool: 0, roster: m.roster.map((r) => ({ ...r, g: PRACTICE_LOADOUT })) }),
    [me.id],
  );
  useEffect(() => {
    started.current = false;
    return net.listen((m) => {
      if (m.t !== "start" || started.current) return;
      started.current = true;
      cb.current(setupOf(m));
    });
  }, [net, setupOf]);
  const people = members.length ? members : [{ id: me.id, name: me.name, at: 0, st: "play" as const }];
  const host = people[0]?.id === me.id;
  function start() {
    if (started.current) return;
    const at = Date.now() + 6000;
    const msg: Extract<Msg, { t: "start" }> = { t: "start", seed: Math.floor(Math.random() * 1e9), at, ends: at + mins * 60_000, tod: TODS[Math.floor(Math.random() * 3)], roster: people.slice(0, 16).map((p, k) => ({ i: p.id, n: p.name, tm: k % 2, a: p.id === me.id ? me.avatar : p.av })) };
    net.send(msg);
    started.current = true;
    onStart(setupOf(msg));
  }
  return (
    <FullScreen onQuit={onLeave} quitLabel="Leave the room" className="bg-[#0b0e14]">
      <div className="relative flex flex-1 flex-col overflow-y-auto">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(28,79,214,.45),transparent_55%),radial-gradient(ellipse_at_85%_100%,rgba(240,140,0,.35),transparent_55%)]" />
        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-4 py-14 text-white">
          <p className="text-center text-[11px] font-black tracking-[0.3em] text-white/60">SAMPLE GAME WITH FRIENDS · FREE</p>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(code).catch(() => {});
              setCopied(true);
            }}
            className="mx-auto flex items-center gap-2 font-mono text-4xl font-black tracking-[0.25em]"
          >
            {code} {copied ? <Check className="size-5 text-[#8ce99a]" /> : <Copy className="size-5 text-white/50" />}
          </button>
          <p className="text-center text-sm text-white/65">Friends open Police &amp; Thieves, put this code in under Sample games, and Join. Sides are shared out in turn; bots fill the rest.</p>
          <ul className="grid grid-cols-2 gap-1.5">
            {people.slice(0, 16).map((p, k) => (
              <li key={p.id} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold" style={{ background: k % 2 ? "rgba(232,89,12,.3)" : "rgba(28,79,214,.35)" }}>
                {k === 0 && <Crown className="size-3.5 shrink-0 text-[#ffd43b]" />}
                <span className="truncate">{p.id === me.id ? `${p.name} (you)` : p.name}</span>
              </li>
            ))}
          </ul>
          {host ? (
            <>
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-white/60">Length</span>
                {[3, 5, 10].map((m) => (
                  <button key={m} onClick={() => setMins(m)} className={cn("rounded-full px-3 py-1 font-bold", mins === m ? "bg-white text-black" : "bg-white/10")}>
                    {m} min
                  </button>
                ))}
              </div>
              <button onClick={start} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2f9e44] py-3 font-bold shadow-[0_5px_0_#1e6b2d] active:translate-y-1 active:shadow-none">
                <Play className="size-4" /> Start ({people.length} {people.length === 1 ? "player" : "players"}, bots fill the rest)
              </button>
            </>
          ) : (
            <p className="flex items-center justify-center gap-2 py-2 text-sm text-white/70">
              <LoaderCircle className="size-4 animate-spin" /> Waiting for {people[0]?.name ?? "the host"} to start…
            </p>
          )}
        </div>
      </div>
    </FullScreen>
  );
}

// ---------------------------------------------------------------- the end

export function Results({ me, result, setup, onBack }: { me: Me | null; result: EndResult; setup: Setup; onBack: () => void }) {
  const [server, setServer] = useState<CopsResult | null>(null);
  const [waiting, setWaiting] = useState(!!setup.key);
  const mine = result.rows.find((r) => r.me);
  const playing = !!setup.key && !setup.watch && !!mine;
  // Tell the server what this phone saw, then wait for the match to be settled.
  useEffect(() => {
    if (!setup.key) return;
    let stop = false;
    const key = setup.key;
    const scores: Record<string, [number, number, number, number]> = {};
    for (const r of result.rows) if (!r.bot) scores[r.id] = [r.act, r.kills, r.downs, r.loot];
    const tick = async () => {
      if (playing) {
        const res = await copsReport(key, result.winner, scores).catch(() => null);
        if (stop) return;
        if (res?.ok && res.result) {
          setServer(res.result);
          setWaiting(false);
          return;
        }
      }
      const room = await copsRoom(key, setup.room).catch(() => null);
      if (stop) return;
      if (room?.ok && "result" in room && room.done && room.result) {
        setServer(room.result);
        setWaiting(false);
        return;
      }
      window.setTimeout(() => void tick(), 6000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [setup.key, setup.room, result, playing]);

  const sorted = [...result.rows].sort((a, b) => b.act - a.act);
  const myTeam = mine?.team ?? 0;
  const w = server ? server.w : result.winner;
  const title = w === -1 || w === -2 ? "A DRAW" : setup.watch || !mine ? `${SIDES[w].name.toUpperCase()} WIN` : w === myTeam ? "VICTORY" : "DEFEAT";
  const myPrize = server?.rows.find((r) => r.i === me?.id)?.p ?? 0;

  async function save() {
    // The last moment with the leaderboard drawn over it.
    const c = document.createElement("canvas");
    c.width = 1080;
    c.height = 1350;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0b0e14";
    g.fillRect(0, 0, c.width, c.height);
    if (result.shot) {
      const img = new Image();
      img.src = result.shot;
      await new Promise((ok) => {
        img.onload = ok;
        img.onerror = ok;
      });
      const s = Math.max(c.width / img.width, 760 / img.height);
      g.drawImage(img, (c.width - img.width * s) / 2, 0, img.width * s, img.height * s);
    }
    const grd = g.createLinearGradient(0, 520, 0, 1350);
    grd.addColorStop(0, "rgba(11,14,20,0)");
    grd.addColorStop(0.25, "rgba(11,14,20,.92)");
    grd.addColorStop(1, "#0b0e14");
    g.fillStyle = grd;
    g.fillRect(0, 520, c.width, 830);
    g.textAlign = "center";
    g.fillStyle = "#ffffff";
    g.font = "900 44px system-ui, sans-serif";
    g.fillText("POLICE & THIEVES · NEWTOWN", 540, 70);
    g.font = "900 110px system-ui, sans-serif";
    g.fillStyle = title === "VICTORY" ? "#ffd43b" : "#ffffff";
    g.fillText(title, 540, 700);
    g.font = "900 64px system-ui, sans-serif";
    g.fillStyle = SIDES[0].css;
    g.fillText(String(result.scores[0]), 420, 790);
    g.fillStyle = "#adb5bd";
    g.fillText("–", 540, 790);
    g.fillStyle = SIDES[1].css;
    g.fillText(String(result.scores[1]), 660, 790);
    g.textAlign = "left";
    sorted.slice(0, 8).forEach((r, k) => {
      const y = 870 + k * 56;
      g.fillStyle = r.me ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.06)";
      g.fillRect(90, y - 38, 900, 48);
      g.fillStyle = SIDES[r.team].css;
      g.beginPath();
      g.arc(130, y - 14, 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffffff";
      g.font = "700 30px system-ui, sans-serif";
      g.fillText(`${k + 1}. ${r.name}`.slice(0, 26), 156, y - 4);
      g.textAlign = "right";
      g.fillStyle = "#ced4da";
      g.fillText(`${r.kills} KO · ${r.loot} ₦ · ${r.act}`, 970, y - 4);
      g.textAlign = "left";
    });
    const url = c.toDataURL("image/jpeg", 0.9);
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "police-and-thieves.jpg", { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) return void (await navigator.share({ files: [file], title: "Police & Thieves" }));
    } catch {
      // Not shared: download it instead.
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = "police-and-thieves.jpg";
    a.click();
  }

  return (
    <FullScreen onQuit={onBack} quitLabel="Back" className="bg-[#0b0e14]">
      <div className="relative flex flex-1 flex-col overflow-y-auto">
        {result.shot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.shot} alt="The last moment of the match" className="pointer-events-none absolute inset-x-0 top-0 h-[60%] w-full object-cover" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(11,14,20,.1)_0%,rgba(11,14,20,.55)_35%,#0b0e14_62%)]" />
        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-end gap-3 px-4 pb-8 pt-20 text-white">
          <p className="text-center text-[11px] font-black tracking-[0.3em] text-white/70">{setup.key ? "MATCH OVER · CAPTURED AT THE FINAL WHISTLE" : "SAMPLE GAME OVER · CAPTURED AT THE FINAL WHISTLE"}</p>
          <p className={cn("text-center font-display text-5xl font-black", title === "VICTORY" ? "text-[#ffd43b]" : "text-white")}>{title}</p>
          <p className="text-center text-3xl font-black tabular-nums">
            <span style={{ color: SIDES[0].css }}>{result.scores[0]}</span> <span className="text-white/40">–</span> <span style={{ color: SIDES[1].css }}>{result.scores[1]}</span>
          </p>
          {setup.key && playing && (
            <p className="rounded-2xl bg-black/50 p-3 text-center text-sm">
              {waiting ? (
                <span className="flex items-center justify-center gap-2">
                  <LoaderCircle className="size-4 animate-spin" /> Settling the pool ({cash(setup.pool)})…
                </span>
              ) : myPrize > 0 ? (
                <>
                  {w >= 0 ? "Your share of the pool:" : "Your part of the pool back:"} <b className="text-[#ffe066]">{cash(myPrize)}</b>
                </>
              ) : server?.jackpot ? (
                "The bots won: the pool goes into the next game's jackpot."
              ) : (
                "No prize this time. Next game in 8 hours!"
              )}
            </p>
          )}
          <div className="rounded-3xl border border-white/10 bg-black/55 p-3 backdrop-blur">
            <p className="mb-2 text-[11px] font-black tracking-[0.2em] text-white/55">LEADERBOARD</p>
            <ol className="space-y-1">
              {sorted.map((r, k) => {
                const prize = server?.rows.find((x) => x.i === r.id)?.p ?? 0;
                return (
                  <li key={r.id} className={cn("flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm", r.me ? "bg-white/15" : "bg-white/5")}>
                    <span className="w-5 text-center font-black text-white/50">{k === 0 ? <Crown className="mx-auto size-4 text-[#ffd43b]" /> : k + 1}</span>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: SIDES[r.team].css }} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                    <span className="text-xs tabular-nums text-white/75">{r.kills} KO</span>
                    <span className="text-xs tabular-nums text-white/45">{r.downs} down</span>
                    {r.loot > 0 && <span className="text-xs tabular-nums text-[#ffe066]">{r.loot} ₦</span>}
                    <span className="w-12 text-right text-xs font-bold tabular-nums">{prize > 0 ? <span className="text-[#8ce99a]">{cash(prize)}</span> : r.act}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void save()} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#1c4fd6] py-3 font-bold">
              <Download className="size-4" /> Save the picture
            </button>
            <button onClick={onBack} className="flex-1 rounded-2xl bg-white/10 py-3 font-bold">
              Back
            </button>
          </div>
        </div>
      </div>
    </FullScreen>
  );
}
