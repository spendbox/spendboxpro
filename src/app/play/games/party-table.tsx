"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Crown, Eye, LoaderCircle, MessageCircle, Mic, MicOff, PhoneOff, Play, RotateCcw, Send, Users, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { OVER, SYSTEM, type PartyRules } from "@/lib/party/engine";
import { WINNER_SHARE } from "@/lib/world/challenges";
import { cash } from "@/lib/world/value";
import { Confetti } from "../activities/ui";
import { useGroupCall } from "../call/group-call";
import { leaveChallenge, reportWinner, startChallengeNow, type ChallengePlayer, type ChallengeView } from "../fight/challenge-actions";
import { useChallengeChannel } from "../fight/channel";
import { playSfx } from "../sound";

// The table the party games are played at (docs/PARTY_GAMES.md): Truth or Dare and Impostor. Like
// Whot! (whot-table.tsx), every phone plays the same game and only the moves travel, in order; a
// player gone for 40 seconds is played by the computer; anyone arriving late catches up from the
// others' list of moves. The money is the server's: the pool is paid once the players agree who won.
// This file is what the games share: the game itself (usePartyGame), the lobby, the top bar with
// voice and chat, leaving, and the result.

export type Me = { id: string; name: string; avatar: unknown };
export type Kind = "me" | "remote" | "bot";
type Channel = ReturnType<typeof useChallengeChannel>;

export type Theme = {
  /** The page behind everything. */
  background: string;
  /** Buttons and highlights. */
  accent: string;
  /** The text on an accent button. */
  onAccent: string;
  /** The panels (chat, result). */
  panel: string;
  /** The game's name as a logo. */
  logo: ReactNode;
  /** Lines for the chat's quick buttons. */
  quick: string[];
};

export const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.floor(s) % 60)).padStart(2, "0")}`;

/** Who's playing, who's gone (the computer plays for them after 40 seconds away), and where I sit. */
export function useSeats(view: ChallengeView, me: Me, ch: Channel) {
  const players = view.players;
  const mySeat = players.findIndex((p) => p.id === me.id);
  const playing = view.status === "playing";
  const lastHere = useRef(new Map<string, number>());
  const hereNow = useRef<string[]>([]);
  useEffect(() => {
    hereNow.current = ch.here;
  });
  const [gone, setGone] = useState<string[]>([]);
  const ids = players.map((p) => p.id).join(",");
  useEffect(() => {
    if (!playing) return;
    const list = ids.split(",");
    const t0 = Date.now();
    for (const id of list) if (!lastHere.current.has(id)) lastHere.current.set(id, t0);
    const check = setInterval(() => {
      const t = Date.now();
      for (const id of hereNow.current) lastHere.current.set(id, t);
      const away = list.filter((id) => id !== me.id && t - (lastHere.current.get(id) ?? t) > 40_000);
      // Once gone, the computer keeps playing for them (as in Whot!), so the phones don't disagree.
      if (away.length) setGone((g) => (away.every((id) => g.includes(id)) ? g : [...new Set([...g, ...away])]));
    }, 5000);
    return () => clearInterval(check);
  }, [playing, ids, me.id]);
  const kinds: Kind[] = useMemo(() => players.map((p) => (p.id === me.id ? "me" : gone.includes(p.id) ? "bot" : "remote")), [players, me.id, gone]);
  return { players, mySeat, watching: mySeat < 0, playing, kinds };
}

/**
 * The game itself, the same on every phone: my moves out, theirs in (in order), the computer for
 * anyone gone, the server for SYSTEM moves (system()), and a timer on every move (time up on my move:
 * rules.auto plays it).
 */
export function usePartyGame<S, M>(
  rules: PartyRules<S, M>,
  { seed, kinds, watching, ch, live, now, system, botMs = () => 1100 }: { seed: number; kinds: Kind[]; watching: boolean; ch: Channel; live: boolean; now: number; system?: (s: S) => Promise<M | null>; botMs?: (s: S) => number },
) {
  const n = kinds.length;
  const start = useMemo(() => rules.init(seed, Math.max(2, n)), [rules, seed, n]);
  const [state, setState] = useState<S>(start);
  const stateRef = useRef<S>(start);
  const hist = useRef<M[]>([]);
  const [count, setCount] = useState(0);
  const kindsRef = useRef(kinds);
  useEffect(() => {
    kindsRef.current = kinds;
  });

  function apply(m: M) {
    const s = stateRef.current;
    if (rules.turn(s) === OVER || !rules.valid(s, m)) return false;
    const next = rules.play(s, m);
    stateRef.current = next;
    hist.current = [...hist.current, m];
    setState(next);
    setCount(hist.current.length);
    return true;
  }
  /** Catch up: every move so far from the start (someone arriving late, or a move missed). */
  function replay(moves: M[]) {
    let s = start;
    for (const m of moves) {
      if (rules.turn(s) === OVER || !rules.valid(s, m)) return;
      s = rules.play(s, m);
    }
    stateRef.current = s;
    hist.current = moves;
    setState(s);
    setCount(moves.length);
  }

  const lastAsk = useRef(0);
  const ask = () => {
    if (Date.now() - lastAsk.current < 2500) return;
    lastAsk.current = Date.now();
    ch.post({ t: "wsync_req" });
  };
  useEffect(() => {
    return ch.online.listen((raw) => {
      const msg = raw as unknown as Record<string, unknown>;
      if (msg.t === "mg_move") {
        const k = Number(msg.k);
        // A move from further on: one was missed. Ask the table for the whole list.
        if (k > hist.current.length) return ask();
        const t = rules.turn(stateRef.current);
        if (t < 0 || kindsRef.current[t] !== "remote" || k !== hist.current.length) return;
        apply(msg.m as M);
      } else if (msg.t === "wsync_req") {
        if (!watching && hist.current.length) ch.post({ t: "wsync", moves: hist.current });
      } else if (msg.t === "wsync" && Array.isArray(msg.moves) && msg.moves.length > hist.current.length) {
        replay(msg.moves as M[]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch.online, watching]);
  // Catch up as the game opens, then now and then in case a move went missing.
  useEffect(() => {
    if (!live) return;
    const ts = [800, 3000, 7000].map((ms) => setTimeout(() => ch.post({ t: "wsync_req" }), ms));
    const every = setInterval(() => ch.post({ t: "wsync_req" }), 15_000);
    return () => {
      ts.forEach(clearTimeout);
      clearInterval(every);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const turn = rules.turn(state);
  // The computer plays for anyone who's gone (on every phone, the same way).
  useEffect(() => {
    if (!live || turn < 0 || kinds[turn] !== "bot") return;
    const t = setTimeout(() => apply(rules.auto(stateRef.current)), botMs(stateRef.current));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, turn, count, kinds[turn]]);
  // The server's moves (every phone asks, and gets the same answer).
  useEffect(() => {
    if (!live || turn !== SYSTEM || !system) return;
    let on = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const go = async () => {
      const at = hist.current.length;
      const m = await system(stateRef.current).catch(() => null);
      if (!on) return;
      if (m && hist.current.length === at) apply(m);
      else if (!m) timer = setTimeout(() => void go(), 2000);
    };
    void go();
    return () => {
      on = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, turn, count]);

  // The timer on each move (from when this phone saw it start).
  const key = `${count}:${turn}`;
  const [tk, setTk] = useState({ key, at: now });
  if (tk.key !== key) setTk({ key, at: now });
  const secs = rules.secs(state);
  const left = Math.max(0, secs - (now - tk.at) / 1000);
  const myTurn = live && turn >= 0 && kinds[turn] === "me";
  const timeUp = myTurn && tk.key === key && secs > 0 && left <= 0;
  useEffect(() => {
    if (timeUp) move(rules.auto(stateRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  function move(m: M) {
    const k = hist.current.length;
    const t = rules.turn(stateRef.current);
    if (t < 0 || kindsRef.current[t] !== "me") return false;
    if (!apply(m)) return false;
    ch.online.send({ k, m });
    return true;
  }
  return { state, count, turn, myTurn, move, left, secs, since: now - tk.at };
}

/** Tells the server how it ended until it's settled (players only): a winner, or a draw. */
export function useSettle(view: ChallengeView, watching: boolean, winners: number[] | null, onMessage: (text: string, good: boolean) => void) {
  const claim = useMemo(() => {
    if (!winners || watching || view.status !== "playing") return null;
    const w = winners.length === 1 ? (view.players[winners[0]]?.id ?? null) : null;
    return w ? { winner: w, draw: false } : { winner: null, draw: true };
  }, [winners, watching, view.status, view.players]);
  const claimKey = claim ? `${claim.winner}:${claim.draw}` : "";
  useEffect(() => {
    if (!claim || view.status !== "playing") return;
    let live = true;
    const send = () => void reportWinner(view.id, claim.winner, claim.draw).then((r) => live && !r.ok && onMessage(r.error, false));
    send();
    const t = setInterval(send, 6000);
    return () => {
      live = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimKey, view.status, view.id]);
}

/** A face with a ring that runs down with the time left. */
export function Seat({ p, size, active, left, total, talking, bot, winner, accent = "#ffd43b", className }: { p: { name: string; avatar: unknown }; size: number; active?: boolean; left?: number; total?: number; talking?: boolean; bot?: boolean; winner?: boolean; accent?: string; className?: string }) {
  const box = size + 14;
  const r = size / 2 + 5;
  const c = 2 * Math.PI * r;
  const frac = active && total ? Math.max(0, Math.min(1, (left ?? 0) / total)) : 0;
  return (
    <span className={cn("relative inline-grid place-items-center", className)} style={{ width: box, height: box }}>
      <svg className="absolute inset-0 -rotate-90" viewBox={`0 0 ${box} ${box}`} aria-hidden>
        <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="4" />
        {active && total ? <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke={(left ?? 0) < 6 ? "#ff6b6b" : accent} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: "stroke-dashoffset 0.5s linear" }} /> : null}
      </svg>
      <AvatarFace avatar={cleanAvatar(p.avatar, p.name)} size={size} className={cn("rounded-full", bot && "opacity-60 grayscale")} />
      {talking && (
        <span className="absolute bottom-0 right-0 grid size-4 place-items-center rounded-full bg-[#12b886] ring-2 ring-black/40">
          <Mic className="size-2.5" />
        </span>
      )}
      {winner && <Crown className="absolute -top-2 left-1/2 size-5 -translate-x-1/2 fill-[#ffd43b] text-[#ffd43b]" />}
    </span>
  );
}

/** A chat bubble by someone's face, for a few seconds. */
export function Bubble({ text, below }: { text?: string; below?: boolean }) {
  if (!text) return null;
  return <span className={cn("whot-bubble absolute left-1/2 z-30 max-w-[11rem] -translate-x-1/2 truncate rounded-2xl bg-white px-3 py-1 text-xs font-semibold text-ink shadow-lg", below ? "top-full mt-1" : "bottom-full mb-1")}>{text}</span>;
}

/**
 * Everything round the game: the top bar (back, the logo, the pool, watchers, voice, chat), the
 * lobby before it starts, the chat, leaving, and the result. The game goes in children.
 */
export function PartyShell({
  view,
  me,
  now,
  ch,
  theme,
  title,
  minPlayers = 2,
  needMore,
  over,
  standings,
  overTitle,
  onClose,
  onMessage,
  onJoin,
  onRematch,
  children,
}: {
  view: ChallengeView;
  me: Me;
  now: number;
  ch: Channel;
  theme: Theme;
  title: string;
  /** Players needed to start (the host's Start now waits for them). */
  minPlayers?: number;
  /** Said in the lobby while there aren't enough players yet. */
  needMore?: string;
  /** The game has ended on this phone (it may not be settled yet). */
  over: boolean;
  /** Everyone's points at the end, best first. */
  standings: { p: ChallengePlayer; points: number }[];
  /** What the result says while it's being settled ("Ada wins!"). */
  overTitle: string;
  onClose: () => void;
  onMessage: (text: string, good: boolean) => void;
  onJoin?: () => void;
  onRematch?: () => void;
  children: (call: { inCall: Set<string>; bubbles: Map<string, string> }) => ReactNode;
}) {
  const players = view.players;
  const watching = !players.some((p) => p.id === me.id);
  const isHost = view.host === me.id;
  const playing = view.status === "playing";

  // Chat.
  const [chatOpen, setChatOpenNow] = useState(false);
  const [draft, setDraft] = useState("");
  const [seenChat, setSeenChat] = useState(0);
  const setChatOpen = (open: boolean) => {
    setChatOpenNow(open);
    setSeenChat(ch.chat.length);
  };
  useEffect(() => {
    if (!chatOpen && ch.chat.length) playSfx("tick");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch.chat.length]);
  const unread = chatOpen ? 0 : Math.max(0, ch.chat.length - seenChat);
  const bubbles = new Map<string, string>();
  for (const l of ch.chat) if (now - l.at < 4500) bubbles.set(l.from, l.text);

  // Voice: these games are better out loud.
  const call = useGroupCall(view.status === "open" || playing ? `challenge-${view.id}` : null, { id: me.id, name: me.name, avatar: me.avatar }, { max: 6 });
  const inCall = new Set(call.people.map((p) => p.id));

  const watchers = ch.here.filter((id) => !players.some((p) => p.id === id)).length;
  const [leaving, setLeaving] = useState(false);
  const leave = async () => {
    const r = await leaveChallenge(view.id).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    if (!r.ok) return onMessage(r.error, false);
    onMessage(view.status === "open" ? (isHost ? "Game called off. Stakes are back." : "You left. Your stake is back.") : "You left the game.", true);
    onClose();
  };
  const [starting, setStarting] = useState(false);
  const startNow = async () => {
    setStarting(true);
    const r = await startChallengeNow(view.id).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setStarting(false);
    if (!r.ok) onMessage(r.error, false);
  };

  const done = view.status === "done" || view.status === "cancelled";
  const prize = view.pool * WINNER_SHARE;

  return (
    <div className="fixed inset-0 z-[80] flex h-[100dvh] select-none flex-col overflow-hidden text-white" style={{ background: theme.background }} role="dialog" aria-label={title}>
      {/* Top bar. */}
      <header className="relative z-20 flex items-center gap-2 px-3 pb-1 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <button onClick={() => (over || done || watching ? onClose() : setLeaving(true))} className="grid size-10 shrink-0 place-items-center rounded-full bg-black/35 ring-1 ring-white/15 backdrop-blur" aria-label={watching ? "Stop watching" : "Leave"}>
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="leading-none">{theme.logo}</div>
          <p className="mt-0.5 truncate text-[11px] text-white/70">
            Pool <b style={{ color: theme.accent }}>{cash(view.pool)}</b> · winner takes {cash(prize)}
          </p>
        </div>
        {watchers > 0 && (
          <span className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-black/35 px-2.5 text-xs font-semibold ring-1 ring-white/15" title="Watching">
            <Eye className="size-3.5" /> {watchers}
          </span>
        )}
        {call.joined ? (
          <span className="flex shrink-0 items-center gap-1">
            <button onClick={() => call.setMuted(!call.muted)} className={cn("grid size-10 place-items-center rounded-full ring-1 ring-white/15", call.muted ? "bg-hit" : "bg-[#12b886]")} aria-label={call.muted ? "Unmute" : "Mute"}>
              {call.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </button>
            <button onClick={() => call.leave()} className="grid size-8 place-items-center rounded-full bg-black/35 ring-1 ring-white/15" aria-label="Leave the voice call">
              <PhoneOff className="size-4" />
            </button>
          </span>
        ) : (
          <button onClick={() => void call.join()} disabled={call.joining || call.full} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-black/35 px-3 text-xs font-semibold ring-1 ring-white/15 disabled:opacity-50" aria-label="Join the voice call">
            {call.joining ? <LoaderCircle className="size-4 animate-spin" /> : <Mic className="size-4" />}
            <span className="hidden sm:inline">Voice</span>
            {call.people.length > 0 && <span className="rounded-full bg-[#12b886] px-1.5 text-[10px]">{call.people.length}</span>}
          </button>
        )}
        <button onClick={() => setChatOpen(!chatOpen)} className="relative grid size-10 shrink-0 place-items-center rounded-full bg-black/35 ring-1 ring-white/15" aria-label="Chat">
          <MessageCircle className="size-5" />
          {unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#ff6b6b] px-1 text-[10px] font-bold">{unread}</span>}
        </button>
      </header>
      {call.error && <p className="relative z-20 mx-3 rounded-xl bg-black/50 px-3 py-1 text-xs text-[#ffa8a8]">{call.error}</p>}

      {view.status === "open" ? (
        <Lobby view={view} me={me} now={now} theme={theme} isHost={isHost} watching={watching} starting={starting} minPlayers={minPlayers} needMore={needMore} onStart={() => void startNow()} onLeave={() => setLeaving(true)} onJoin={onJoin} />
      ) : (
        children({ inCall, bubbles })
      )}

      {/* Chat. */}
      {chatOpen && (
        <div className="absolute inset-x-0 bottom-0 z-40 flex h-[55%] flex-col rounded-t-3xl shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-16 sm:h-auto sm:w-80 sm:rounded-3xl" style={{ background: theme.panel }}>
          <div className="flex items-center justify-between px-4 pt-3">
            <p className="font-display font-bold">Table talk</p>
            <button onClick={() => setChatOpen(false)} className="grid size-8 place-items-center rounded-full bg-white/10" aria-label="Close chat">
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-2">
            {ch.chat.length === 0 && <p className="pt-6 text-center text-sm text-white/50">Say something to the table. 😄</p>}
            {ch.chat.map((l) => (
              <p key={`${l.at}-${l.from}`} className={cn("max-w-[85%] rounded-2xl px-3 py-1.5 text-sm", l.from === me.id ? "ml-auto bg-white/25" : "bg-white/10")}>
                {l.from !== me.id && (
                  <b className="block text-[11px]" style={{ color: theme.accent }}>
                    {l.name}
                  </b>
                )}
                {l.text}
              </p>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-1">
            {theme.quick.map((q) => (
              <button key={q} onClick={() => ch.say(q)} className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs">
                {q}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ch.say(draft);
              setDraft("");
            }}
            className="flex gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 200))} placeholder="Talk to the table…" className="h-11 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-sm outline-none placeholder:text-white/40" />
            <button type="submit" disabled={!draft.trim()} className="grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40" style={{ background: theme.accent, color: theme.onAccent }} aria-label="Send">
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}

      {(done || (over && playing)) && <Result view={view} me={me} theme={theme} watching={watching} settling={playing} overTitle={overTitle} standings={standings} onClose={onClose} onRematch={onRematch} />}

      {leaving && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/70 p-5">
          <div className="w-full max-w-xs rounded-3xl bg-panel p-5 text-center text-ink">
            <p className="font-display text-xl font-extrabold">{view.status === "open" ? (isHost ? "Call off the game?" : "Leave?") : "Leave the game?"}</p>
            <p className="mt-1 text-sm text-muted">{view.status === "open" ? (isHost ? "Everyone gets their stake back." : "Your stake comes back.") : players.length === 2 ? "The other player wins the pool." : "You lose your stake, and the computer plays for you."}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setLeaving(false)} className="h-11 rounded-full bg-ink/5 text-sm font-semibold">
                Stay
              </button>
              <button onClick={() => void leave()} className="h-11 rounded-full bg-hit text-sm font-semibold text-white">
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Lobby({ view, me, now, theme, isHost, watching, starting, minPlayers, needMore, onStart, onLeave, onJoin }: { view: ChallengeView; me: Me; now: number; theme: Theme; isHost: boolean; watching: boolean; starting: boolean; minPlayers: number; needMore?: string; onStart: () => void; onLeave: () => void; onJoin?: () => void }) {
  const left = (Date.parse(view.startsAt) - now) / 1000;
  const pending = view.invited && !view.players.some((p) => p.id === view.invited!.id) ? view.invited : null;
  const empty = Math.max(0, view.seats - view.players.length - (pending ? 1 : 0));
  const enough = view.players.length >= minPlayers;
  return (
    <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-4 py-4 text-center">
      <div className="party-float scale-[1.6] sm:scale-[2]">{theme.logo}</div>
      <div className="mt-2 flex flex-wrap items-end justify-center gap-3">
        {view.players.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3">
            {i > 0 && (
              <span className="font-display text-xl font-black" style={{ color: theme.accent }}>
                VS
              </span>
            )}
            <div className="party-pop flex flex-col items-center gap-1">
              <AvatarFace avatar={cleanAvatar(p.avatar, p.name)} size={60} className="rounded-full ring-4 ring-white/80" />
              <span className="max-w-24 truncate text-sm font-bold">{p.id === me.id ? "You" : p.name}</span>
              <span className="rounded-full bg-[#12b886] px-2 text-[10px] font-bold">Ready</span>
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex items-center gap-3">
            <span className="font-display text-xl font-black" style={{ color: theme.accent }}>
              VS
            </span>
            <div className="flex flex-col items-center gap-1 opacity-80">
              <span className="relative">
                <AvatarFace avatar={cleanAvatar(pending.avatar, pending.name)} size={60} className="rounded-full ring-4 ring-white/40" />
                <LoaderCircle className="absolute -right-1 -top-1 size-5 animate-spin" style={{ color: theme.accent }} />
              </span>
              <span className="max-w-24 truncate text-sm font-bold">{pending.name}</span>
              <span className="rounded-full bg-white/15 px-2 text-[10px] font-bold">Invited</span>
            </div>
          </div>
        )}
        {Array.from({ length: empty }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-1 opacity-50">
            <span className="grid size-[60px] place-items-center rounded-full border-2 border-dashed border-white/50">
              <Users className="size-6" />
            </span>
            <span className="text-[11px]">Open seat</span>
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-black/35 px-4 py-2 ring-1 ring-white/10 backdrop-blur">
        <p className="text-sm">
          Stake <b style={{ color: theme.accent }}>{cash(view.stake)}</b> each · pool <b>{cash(view.pool)}</b> · winner takes{" "}
          <b style={{ color: theme.accent }}>{cash(view.pool * WINNER_SHARE)}</b>
        </p>
        <p className="mt-0.5 text-xs text-white/70">
          {!enough && needMore
            ? `${needMore} · ${mmss(left)}`
            : pending
              ? `Waiting for ${pending.name} to accept · ${mmss(left)}`
              : enough
                ? `Starting in ${Math.max(0, Math.ceil(left))}s. Anyone nearby can still join.`
                : `Waiting for players · ${mmss(left)}`}
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        {isHost && (
          <button onClick={onStart} disabled={starting || !enough} className="flex h-12 items-center justify-center gap-2 rounded-full font-black shadow-[0_4px_0_rgba(0,0,0,0.35)] disabled:opacity-40" style={{ background: theme.accent, color: theme.onAccent }}>
            {starting ? <LoaderCircle className="size-5 animate-spin" /> : <Play className="size-5 fill-current" />} Start now
          </button>
        )}
        {watching && onJoin && view.players.length < view.seats && (
          <button onClick={onJoin} className="h-12 rounded-full font-black shadow-[0_4px_0_rgba(0,0,0,0.35)]" style={{ background: theme.accent, color: theme.onAccent }}>
            Join for {cash(view.stake)}
          </button>
        )}
        {!watching && (
          <button onClick={onLeave} className="h-10 text-sm font-semibold text-white/70 underline">
            {isHost ? "Call it off (stakes back)" : "Leave (stake back)"}
          </button>
        )}
      </div>
    </main>
  );
}

function Result({ view, me, theme, watching, settling, overTitle, standings, onClose, onRematch }: { view: ChallengeView; me: Me; theme: Theme; watching: boolean; settling: boolean; overTitle: string; standings: { p: ChallengePlayer; points: number }[]; onClose: () => void; onRematch?: () => void }) {
  const won = view.status === "done" && view.winner === me.id;
  const winner = view.players.find((p) => p.id === view.winner);
  const cancelled = view.status === "cancelled";
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/65 p-5 backdrop-blur-[3px]">
      {won && <Confetti />}
      <div className="start-pop w-full max-w-sm rounded-[2rem] p-6 text-center shadow-2xl ring-2" style={{ background: theme.panel, ["--tw-ring-color" as string]: theme.accent }}>
        {settling ? (
          <>
            <p className="font-display text-3xl font-black">{overTitle}</p>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-white/70">
              <LoaderCircle className="size-4 animate-spin" /> Settling the pool…
            </p>
          </>
        ) : cancelled ? (
          <>
            <p className="font-display text-2xl font-black">{view.started ? "It's a draw" : "The game didn't start"}</p>
            <p className="mt-1 text-sm text-white/70">Everyone&apos;s stake is back.</p>
          </>
        ) : (
          <>
            {winner && (
              <span className="relative mx-auto mt-4 block w-fit">
                <Crown className="absolute -top-7 left-1/2 size-8 -translate-x-1/2 drop-shadow" style={{ color: theme.accent, fill: theme.accent }} />
                <AvatarFace avatar={cleanAvatar(winner.avatar, winner.name)} size={84} className="rounded-full ring-4" />
              </span>
            )}
            <p className="mt-3 font-display text-3xl font-black">{won ? "You won!" : `${winner?.name ?? "Someone"} won`}</p>
            <p className="mt-1 text-lg font-bold" style={{ color: theme.accent }}>
              {won ? `+${cash(view.prize ?? 0)}` : watching ? `They take ${cash(view.prize ?? 0)}` : "Better luck next time."}
            </p>
          </>
        )}
        {standings.length > 0 && (
          <ol className="mt-4 space-y-1 text-left">
            {standings.map(({ p, points }, i) => (
              <li key={p.id} className={cn("flex items-center gap-2 rounded-xl px-2 py-1", i === 0 ? "bg-white/15" : "bg-white/5")}>
                <span className="w-5 text-center text-xs font-black text-white/60">{i + 1}</span>
                <AvatarFace avatar={cleanAvatar(p.avatar, p.name)} size={26} className="rounded-full" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.id === me.id ? "You" : p.name}</span>
                <span className="text-sm font-black tabular-nums" style={{ color: theme.accent }}>
                  {points} pt{points === 1 || points === -1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-5 flex flex-col gap-2">
          {!watching && !settling && onRematch && view.players.length >= 2 && (
            <button onClick={onRematch} className="flex h-12 items-center justify-center gap-2 rounded-full font-black shadow-[0_4px_0_rgba(0,0,0,0.35)]" style={{ background: theme.accent, color: theme.onAccent }}>
              <RotateCcw className="size-5" /> Rematch for {cash(view.stake)}
            </button>
          )}
          <button onClick={onClose} className="h-12 rounded-full bg-white/15 font-bold">
            Back to the map
          </button>
        </div>
      </div>
    </div>
  );
}

/** Seats round an oval, me at the bottom: where seat `seat` sits, in % of the box, and its angle (degrees, 90 = straight down). */
export function ovalSpot(seat: number, base: number, n: number, rx = 40, ry = 34, cy = 46) {
  const i = (seat - base + n) % n;
  const deg = 90 + (i * 360) / n;
  const a = (deg * Math.PI) / 180;
  return { left: 50 + rx * Math.cos(a), top: cy + ry * Math.sin(a), deg };
}
