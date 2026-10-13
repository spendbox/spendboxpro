"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crown, LoaderCircle, MessageCircle, Send, Swords, Trophy, Users, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { cash } from "@/lib/world/value";
import { CHALLENGE_GAMES, CHALLENGE_COOLDOWN_SECS, JOIN_SECS, STAKES_NAIRA, WINNER_SHARE, challengeGame } from "@/lib/world/challenges";
import { MINIGAMES } from "../minigames/registry";
import { TurnTable, type Seat } from "../minigames/turn-table";
import { Confetti } from "../activities/ui";
import { playSfx } from "../sound";
import { Sheet } from "../sheet";
import { challengeQuote, challengeView, joinChallenge, nearbyChallenges, openChallenge, reportWinner, type ChallengeView } from "./challenge-actions";
import { useChallengeChannel } from "./channel";
import { CallBar } from "../call/call-bar";

// Challenges on the map (docs/CHALLENGES.md). Fight: pick a game and a stake, and everyone nearby
// is told; your light shines on the map. They have a minute to join, then the game floats over
// the map, the players' faces round it, with a chat (and a voice call). The winner takes the pool.

export type ChallengeLight = { id: number; x: number; z: number; colour: string; playing: boolean };
type Me = { id: string; name: string; avatar: unknown };

const INTRO_KEY = "nt-fight-intro";
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.floor(s) % 60)).padStart(2, "0")}`;

/**
 * Everything about challenges: the Fight picker (open), alerts for challenges nearby, and the one
 * you're in (the lobby, the game, the result). onLights: the challenges to light up on the map.
 */
export function Fight({
  region,
  me,
  open,
  onClose,
  where,
  onLights,
  onMessage,
  onFly,
}: {
  region: string;
  me: Me | null;
  open: boolean;
  onClose: () => void;
  /** Where you are on the map now (where the challenge is set). */
  where: () => { x: number; z: number } | null;
  onLights: (lights: ChallengeLight[]) => void;
  onMessage: (text: string, good: boolean) => void;
  /** Look at a spot on the map (a challenge's light). */
  onFly?: (x: number, z: number) => void;
}) {
  const [list, setList] = useState<ChallengeView[]>([]);
  const [mine, setMine] = useState<number | null>(null);
  const [view, setView] = useState<ChallengeView | null>(null);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lightsRef = useRef(onLights);
  useEffect(() => {
    lightsRef.current = onLights;
  });

  // Challenges nearby (and the one you're in), every few seconds.
  const look = useCallback(async () => {
    const at = where();
    if (!at || !me) return;
    const r = await nearbyChallenges(region, at.x, at.z).catch(() => null);
    if (!r) return;
    setList(r.list);
    setMine((m) => (r.mine ?? (m && r.list.some((c) => c.id === m) ? m : null)));
    lightsRef.current(r.list.map((c) => ({ id: c.id, x: c.x, z: c.z, colour: challengeGame(c.game)?.colour ?? "#f08c00", playing: c.status === "playing" })));
  }, [region, me, where]);
  useEffect(() => {
    if (!me) return;
    const first = setTimeout(() => void look(), 1500);
    const t = setInterval(() => !document.hidden && void look(), 8000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [me, look]);

  // The one you're in, closely (starting it once its minute is up).
  useEffect(() => {
    if (mine === null) return setView(null);
    let live = true;
    const get = async () => {
      const v = await challengeView(mine).catch(() => null);
      if (!live) return;
      setView(v);
      if (v && (v.status === "cancelled" || v.status === "done")) void look();
    };
    void get();
    const t = setInterval(get, 2500);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [mine, look]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const join = async (c: ChallengeView) => {
    setBusy(true);
    const r = await joinChallenge(c.id).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusy(false);
    if (!r.ok) return onMessage(r.error, false);
    playSfx("start");
    setMine(c.id);
    onFly?.(c.x, c.z);
  };

  // Alerts: open challenges near you, not yours, still taking players.
  const alerts = list.filter((c) => c.status === "open" && c.id !== mine && !dismissed.includes(c.id) && Date.parse(c.startsAt) > now && !c.players.some((p) => p.id === me?.id)).slice(0, 2);

  return (
    <>
      {open && me && (
        <FightSheet
          region={region}
          onClose={onClose}
          onGo={async (game, stake) => {
            const at = where();
            if (!at) return onMessage("Find a home or walk somewhere on the map first.", false);
            const r = await openChallenge(game, stake, at.x, at.z, region).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
            if (!r.ok) return onMessage(r.error, false);
            playSfx("start");
            onClose();
            setMine(r.id);
            onMessage(r.fee > 0 ? `Challenge on! ${cash(r.fee)} fee paid. Everyone nearby has a minute to join.` : "Challenge on! Everyone nearby has a minute to join.", true);
            void look();
          }}
        />
      )}
      {!view && alerts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-28 z-40 flex flex-col items-center gap-2 px-3">
          {alerts.map((c) => {
            const g = challengeGame(c.game);
            const host = c.players[0];
            const left = (Date.parse(c.startsAt) - now) / 1000;
            return (
              <div key={c.id} className="toast-in pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-3xl bg-ink p-2.5 pr-2 text-white shadow-2xl ring-2" style={{ boxShadow: `0 0 0 2px ${g?.colour}, 0 10px 30px rgba(0,0,0,.35)` }}>
                <button onClick={() => onFly?.(c.x, c.z)} className="relative shrink-0" aria-label="See it on the map">
                  {host && <AvatarFace avatar={cleanAvatar(host.avatar, host.name)} size={40} className="rounded-full ring-2 ring-white" />}
                  <span className="absolute -bottom-1 -right-1 text-lg">{g?.icon}</span>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {host?.name ?? "Someone"} challenged everyone to {g?.title}!
                  </p>
                  <p className="text-xs text-white/70">
                    Pool {cash(c.pool)} · {c.players.length}/{c.seats} · <b className="tabular-nums text-gold">{mmss(left)}</b>
                  </p>
                </div>
                <button disabled={busy} onClick={() => void join(c)} className="shrink-0 rounded-full bg-gold px-3 py-2 text-xs font-bold text-ink disabled:opacity-50">
                  Join {cash(c.stake)}
                </button>
                <button onClick={() => setDismissed((d) => [...d, c.id])} className="grid size-7 shrink-0 place-items-center rounded-full text-white/60" aria-label="Not this one">
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {view && me && <Arena view={view} me={me} now={now} onClose={() => setMine(null)} onMessage={onMessage} />}
    </>
  );
}

/** Fight: what it is (the first time), the games, the stake, and go. */
function FightSheet({ region, onClose, onGo }: { region: string; onClose: () => void; onGo: (game: string, stakeNaira: number) => Promise<void> }) {
  const [intro, setIntro] = useState(() => {
    try {
      return !localStorage.getItem(INTRO_KEY);
    } catch {
      return true;
    }
  });
  const [game, setGame] = useState("whot");
  const [stake, setStake] = useState(STAKES_NAIRA[0]);
  const [quote, setQuote] = useState<{ free: boolean; feeMint: number; secsLeft: number; first: boolean } | null>(null);
  const [going, setGoing] = useState(false);
  useEffect(() => {
    void challengeQuote(region).then(setQuote).catch(() => setQuote(null));
  }, [region]);
  const [, tick] = useState(0);
  const opened = useRef(Date.now());
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const left = quote ? Math.max(0, quote.secsLeft - (Date.now() - opened.current) / 1000) : 0;
  const free = !quote || quote.free || left <= 0;

  if (intro)
    return (
      <Sheet onClose={onClose} title="Fight: challenge people nearby">
        <div className="space-y-2.5 text-sm">
          <Point icon="⚔️" text="Pick a game and a stake. Everyone nearby gets told, and your light shines on the map." />
          <Point icon="⏱️" text="They have one minute to join. Everyone puts the stake into the pool." />
          <Point icon="🏆" text={`The winner takes the pool (${Math.round(WINNER_SHARE * 100)}% of it). Challenging and winning raise your reputation.`} />
          <Point icon="🎟️" text={`Your first challenge is free. Another one within ${CHALLENGE_COOLDOWN_SECS / 60} minutes costs ₦50,000, so in between, join other people's challenges.`} />
        </div>
        <button
          onClick={() => {
            try {
              localStorage.setItem(INTRO_KEY, "1");
            } catch {}
            setIntro(false);
          }}
          className="mt-4 h-11 w-full rounded-full bg-ink font-semibold text-white"
        >
          Got it, let&apos;s fight
        </button>
      </Sheet>
    );

  const g = challengeGame(game);
  return (
    <Sheet onClose={onClose} title="Fight">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pick a game</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {CHALLENGE_GAMES.map((c) => {
          const soon = !c.engine;
          const on = c.id === game;
          return (
            <button
              key={c.id}
              disabled={soon}
              onClick={() => setGame(c.id)}
              className={cn("relative overflow-hidden rounded-2xl p-3 text-left text-white transition", on ? "scale-[1.02] ring-4 ring-gold" : "ring-1 ring-black/10", soon && "opacity-60")}
              style={{ background: `linear-gradient(135deg, ${c.colour}, #111)` }}
            >
              <span className="text-3xl">{c.icon}</span>
              <b className="mt-1 block text-sm">{c.title}</b>
              <span className="block text-[11px] text-white/70">{soon ? "Coming soon" : `2 to ${c.seats} players`}</span>
              {soon && <span className="absolute right-2 top-2 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">Soon</span>}
            </button>
          );
        })}
      </div>
      {g && <p className="mt-2 text-xs text-muted">{g.blurb}</p>}
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Stake (each player)</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {STAKES_NAIRA.map((s) => (
          <button key={s} onClick={() => setStake(s)} className={cn("h-10 rounded-full px-4 text-sm font-bold", s === stake ? "bg-ink text-white" : "bg-ink/5")}>
            ₦{s.toLocaleString("en-GB")}
          </button>
        ))}
      </div>
      <p className="mt-3 rounded-2xl bg-gold/15 px-3 py-2 text-xs">
        {free ? (
          <>
            <b>This challenge is free.</b> Only your stake goes into the pool.
          </>
        ) : (
          <>
            <b>₦50,000 fee</b> for challenging again so soon. Free again in <b className="tabular-nums">{mmss(left)}</b>: join someone else&apos;s meanwhile.
          </>
        )}
      </p>
      <button
        disabled={going || !g?.engine}
        onClick={async () => {
          setGoing(true);
          await onGo(game, stake);
          setGoing(false);
        }}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#e03131] font-bold text-white shadow-lg disabled:opacity-50"
      >
        {going ? <LoaderCircle className="size-5 animate-spin" /> : <Swords className="size-5" />}
        Challenge everyone nearby
      </button>
    </Sheet>
  );
}

function Point({ icon, text }: { icon: string; text: string }) {
  return (
    <p className="flex items-start gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-ink/5 text-base">{icon}</span>
      <span className="pt-1">{text}</span>
    </p>
  );
}

/**
 * The challenge you're in, floating over the map: waiting for players (a countdown ring, faces
 * joining round it), the game, then the result. The chat and the call go along the bottom.
 */
function Arena({ view, me, now, onClose, onMessage }: { view: ChallengeView; me: Me; now: number; onClose: () => void; onMessage: (text: string, good: boolean) => void }) {
  const g = challengeGame(view.game);
  const ch = useChallengeChannel(view.id, me);
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [reported, setReported] = useState(false);
  const left = (Date.parse(view.startsAt) - now) / 1000;
  const def = useMemo(() => MINIGAMES.find((m) => m.engine === g?.engine && m.kind === "turns") ?? null, [g?.engine]);
  const seats: Seat[] = useMemo(() => view.players.map((p) => ({ kind: p.id === me.id ? "me" : "remote", name: p.id === me.id ? "You" : p.name })), [view.players, me.id]);
  const lastSeen = useRef(0);
  useEffect(() => {
    if (ch.chat.length > lastSeen.current && !chatOpen) playSfx("tick");
    lastSeen.current = ch.chat.length;
  }, [ch.chat.length, chatOpen]);
  const iWon = view.status === "done" && view.winner === me.id;
  const winnerName = view.players.find((p) => p.id === view.winner)?.name;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex flex-col items-center justify-center p-3">
      <div className="pointer-events-auto absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/50" />
      {/* The players round the stage. */}
      <div className="pointer-events-auto relative w-full max-w-md">
        <div className="mb-2 flex items-center justify-center gap-2">
          {view.players.map((p) => {
            const away = view.status === "playing" && !ch.here.includes(p.id) && p.id !== me.id;
            return (
              <div key={p.id} className={cn("flex flex-col items-center transition", away && "opacity-40")}>
                <span className="relative">
                  <AvatarFace avatar={cleanAvatar(p.avatar, p.name)} size={44} className={cn("rounded-full ring-2", view.winner === p.id ? "ring-gold" : "ring-white")} />
                  {view.winner === p.id && <Crown className="absolute -top-3 left-1/2 size-5 -translate-x-1/2 text-gold" />}
                </span>
                <span className="mt-0.5 max-w-16 truncate rounded-full bg-black/50 px-1.5 text-[10px] font-semibold text-white">{p.id === me.id ? "You" : p.name}</span>
              </div>
            );
          })}
          {view.status === "open" && Array.from({ length: Math.max(0, view.seats - view.players.length) }, (_, i) => (
            <span key={i} className="grid size-11 place-items-center rounded-full border-2 border-dashed border-white/60 text-white/60">
              <Users className="size-4" />
            </span>
          ))}
        </div>

        {/* The stage itself, floating and tilted a little over the city. */}
        <div className="arena-float relative overflow-hidden rounded-[2rem] bg-panel p-4 shadow-[0_30px_80px_rgba(0,0,0,0.45)] ring-4" style={{ ["--tw-ring-color" as string]: g?.colour ?? "#f08c00" }}>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{g?.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-extrabold leading-tight">{g?.title}</p>
              <p className="text-xs text-muted">
                Pool <b className="text-ink">{cash(view.pool)}</b> · winner takes {cash(view.pool * WINNER_SHARE)}
              </p>
            </div>
            {(view.status === "cancelled" || view.status === "done") && (
              <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-ink/5" aria-label="Close">
                <X className="size-4" />
              </button>
            )}
          </div>

          {view.status === "open" && (
            <div className="flex flex-col items-center py-6 text-center">
              <Countdown secs={left} total={JOIN_SECS} colour={g?.colour ?? "#f08c00"} />
              <p className="mt-3 font-semibold">{view.players.length < 2 ? "Waiting for challengers…" : `${view.players.length} players in. Starting soon…`}</p>
              <p className="mt-1 text-xs text-muted">Everyone nearby can see your light on the map. If nobody joins, your stake comes back.</p>
            </div>
          )}

          {view.status === "playing" && def && (
            <div className="mt-3 max-h-[52vh] overflow-y-auto">
              <TurnTable
                def={def}
                seats={seats}
                seed={view.seed}
                online={ch.online}
                onEnd={(r) => {
                  if (reported) return;
                  setReported(true);
                  const seat = r.seats?.[0];
                  const winner = seat === undefined ? null : view.players[seat]?.id;
                  if (!winner) return;
                  void reportWinner(view.id, winner).then((res) => {
                    if (!res.ok) onMessage(res.error, false);
                  });
                }}
              />
            </div>
          )}

          {view.status === "done" && (
            <div className="relative flex flex-col items-center py-6 text-center">
              {iWon && <Confetti />}
              <Trophy className={cn("size-12", iWon ? "text-gold" : "text-muted")} />
              <p className="mt-2 font-display text-2xl font-extrabold">{iWon ? "You won!" : `${winnerName ?? "Someone"} won`}</p>
              <p className="mt-1 text-sm text-muted">{iWon ? `${cash(view.prize ?? 0)} is yours, and your reputation goes up.` : "Better luck next time. Your reputation still goes up for taking part."}</p>
            </div>
          )}
          {view.status === "playing" && reported && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted">
              <LoaderCircle className="size-3.5 animate-spin" /> Paying the winner once everyone agrees…
            </p>
          )}
          {view.status === "cancelled" && (
            <div className="py-6 text-center">
              <p className="font-semibold">Nobody joined this time.</p>
              <p className="mt-1 text-sm text-muted">Your stake is back. Try again, or join someone else&apos;s.</p>
            </div>
          )}
        </div>

        {/* Chat and call along the bottom. */}
        {(view.status === "open" || view.status === "playing") && (
          <div className="mt-2 space-y-2">
            <CallBar room={`challenge-${view.id}`} me={{ id: me.id, name: me.name, avatar: me.avatar }} title="Players' voice call" max={6} />
            <div className="glass rounded-2xl p-2">
              {(chatOpen ? ch.chat.slice(-6) : ch.chat.slice(-1)).map((l) => (
                <p key={`${l.at}-${l.from}`} className="truncate px-1 text-xs">
                  <b>{l.from === me.id ? "You" : l.name}:</b> {l.text}
                </p>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ch.say(draft);
                  setDraft("");
                }}
                className="mt-1 flex gap-1.5"
              >
                <button type="button" onClick={() => setChatOpen((o) => !o)} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/5" aria-label="Chat">
                  <MessageCircle className="size-4" />
                </button>
                <input value={draft} onFocus={() => setChatOpen(true)} onChange={(e) => setDraft(e.target.value.slice(0, 200))} placeholder="Talk your talk…" className="h-9 min-w-0 flex-1 rounded-full bg-white/70 px-3 text-sm outline-none" />
                <button type="submit" disabled={!draft.trim()} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-40" aria-label="Send">
                  <Send className="size-4" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A ring that empties as the minute runs out, the seconds in the middle. */
function Countdown({ secs, total, colour }: { secs: number; total: number; colour: string }) {
  const f = Math.max(0, Math.min(1, secs / total));
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-28">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-ink/10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={colour} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - f)} style={{ transition: "stroke-dashoffset 0.5s linear" }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display text-3xl font-extrabold tabular-nums">{Math.max(0, Math.ceil(secs))}</span>
    </div>
  );
}
