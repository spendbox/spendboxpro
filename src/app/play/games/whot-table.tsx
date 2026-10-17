"use client";

import { OnTop } from "../on-top";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Crown, Eye, LoaderCircle, MessageCircle, Mic, MicOff, PhoneOff, Play, RotateCcw, Send, Users, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { WINNER_SHARE } from "@/lib/world/challenges";
import { cash } from "@/lib/world/value";
import { Confetti } from "../activities/ui";
import { useGroupCall } from "../call/group-call";
import { leaveChallenge, reportWinner, startChallengeNow, type ChallengeView } from "../fight/challenge-actions";
import { useChallengeChannel } from "../fight/channel";
import { SHAPES, WHOT, playable, rules, shapeOf, valueOf, type M, type S } from "../minigames/turns/whot";
import { playSfx } from "../sound";
import { CardBack, CardFace, ShapeIcon } from "./whot-cards";

// Whot! at a full-screen table (docs/GAME_TABLES.md): you at the bottom with your hand fanned out,
// the others round the table with their cards face down, the market and the pile in the middle,
// big call-outs for the special cards, a timer on every turn, chat bubbles and a voice call.
// Anyone can watch (everyone's cards face down). Every phone plays the same game from the same
// shuffle; only the moves travel, and anyone arriving late (or watching) catches up from the
// players' list of moves. The money is the server's: it pays the pool once the players agree.

type Me = { id: string; name: string; avatar: unknown };
type Kind = "me" | "remote" | "bot";

/** Seconds for a turn: then you go to market by yourself. */
const TURN_SECS = 30;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.floor(s) % 60)).padStart(2, "0")}`;
const CALLOUT: Record<string, string> = {
  "Hold on!": "✋ HOLD ON!",
  "Pick two!": "✌️ PICK TWO!",
  "Pick three!": "🤟 PICK THREE!",
  "Suspension!": "⛔ SUSPENSION!",
  "General market!": "🛒 GENERAL MARKET!",
  "Last card! Check up!": "🏁 CHECK UP!",
};

/** The size of the cards for this screen. */
function useCardWidth() {
  const [cw, setCw] = useState(64);
  useEffect(() => {
    const fit = () => setCw(Math.round(Math.max(44, Math.min(104, Math.min(window.innerWidth * 0.155, window.innerHeight * 0.112)))));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return cw;
}

/** The game itself: the same on every phone, moves in from the others, moves out from me, bots for anyone gone. */
function useWhot({ seed, kinds, watching, ch, live }: { seed: number; kinds: Kind[]; watching: boolean; ch: ReturnType<typeof useChallengeChannel>; live: boolean }) {
  const n = kinds.length;
  const start = useMemo(() => rules.init(seed, Math.max(2, n), {}), [seed, n]);
  const [state, setState] = useState<S>(start);
  const stateRef = useRef<S>(start);
  const hist = useRef<M[]>([]);
  const [pile, setPile] = useState<number[]>([start.top]);
  const [count, setCount] = useState(0);
  const kindsRef = useRef(kinds);
  useEffect(() => {
    kindsRef.current = kinds;
  });

  function apply(m: M, quiet = false) {
    const s = stateRef.current;
    if (rules.turn(s) < 0 || !rules.moves(s).some((x) => same(x, m))) return false;
    const next = rules.play(s, m);
    stateRef.current = next;
    hist.current = [...hist.current, m];
    if ("play" in m) setPile((p) => [...p.slice(-5), m.play]);
    setState(next);
    setCount(hist.current.length);
    if (!quiet) playSfx("play" in m ? (CALLOUT[next.log] ? "chime" : "tick") : "pop");
    return true;
  }
  /** Catch up: play every move so far from the start (someone arriving late, or watching). */
  function replay(moves: M[]) {
    let s = start;
    const p: number[] = [start.top];
    for (const m of moves) {
      if (rules.turn(s) < 0 || !rules.moves(s).some((x) => same(x, m))) return;
      s = rules.play(s, m);
      if ("play" in m) p.push(m.play);
    }
    stateRef.current = s;
    hist.current = moves;
    setPile(p.slice(-6));
    setState(s);
    setCount(moves.length);
  }

  useEffect(() => {
    return ch.online.listen((raw) => {
      const msg = raw as unknown as Record<string, unknown>;
      if (msg.t === "mg_move") {
        const t = rules.turn(stateRef.current);
        if (t < 0 || kindsRef.current[t] !== "remote" || msg.k !== hist.current.length) return;
        apply(msg.m as M);
      } else if (msg.t === "wsync_req") {
        // Someone's behind: the players tell them every move so far.
        if (!watching && hist.current.length) ch.post({ t: "wsync", moves: hist.current });
      } else if (msg.t === "wsync" && Array.isArray(msg.moves) && msg.moves.length > hist.current.length) {
        replay(msg.moves as M[]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch.online, watching]);
  // Ask to catch up a few times as the game opens (nothing comes back if there's nothing to catch).
  useEffect(() => {
    if (!live) return;
    const ts = [800, 3000, 7000].map((ms) => setTimeout(() => ch.post({ t: "wsync_req" }), ms));
    return () => ts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // The computer plays for anyone who's gone (on every phone, the same way).
  const turn = rules.turn(state);
  useEffect(() => {
    if (!live || turn < 0 || kinds[turn] !== "bot") return;
    const t = setTimeout(() => apply(rules.bot(stateRef.current)), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, turn, count, kinds[turn]]);

  const move = (m: M) => {
    const k = hist.current.length;
    const t = rules.turn(stateRef.current);
    if (kindsRef.current[t] !== "me") return;
    if (apply(m)) ch.online.send({ k, m });
  };
  return { state, pile, count, turn, move };
}

export function WhotTable({
  view,
  me,
  now,
  onClose,
  onMessage,
  onJoin,
  onRematch,
}: {
  view: ChallengeView;
  me: Me;
  now: number;
  onClose: () => void;
  onMessage: (text: string, good: boolean) => void;
  /** Join this game (watching it before it starts). */
  onJoin?: () => void;
  /** Play the same people again, for the same stake. */
  onRematch?: () => void;
}) {
  const ch = useChallengeChannel(view.id, me);
  const players = view.players;
  const mySeat = players.findIndex((p) => p.id === me.id);
  const watching = mySeat < 0;
  const playing = view.status === "playing";
  const isHost = view.host === me.id;
  const cw = useCardWidth();

  // Who's gone: away from the game for 40 seconds, the computer plays for them.
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
      if (away.length) setGone((g) => (away.every((id) => g.includes(id)) ? g : [...new Set([...g, ...away])]));
    }, 5000);
    return () => clearInterval(check);
  }, [playing, ids, me.id]);
  const kinds: Kind[] = useMemo(() => players.map((p) => (p.id === me.id ? "me" : gone.includes(p.id) ? "bot" : "remote")), [players, me.id, gone]);

  const game = useWhot({ seed: view.seed, kinds, watching, ch, live: playing });
  const { state, pile, turn } = game;
  const over = turn < 0;
  const myTurn = !over && turn === mySeat && playing;

  // The timer on each turn (from when this phone saw it start); on your own turn, time up means
  // you go to market.
  const key = `${game.count}:${turn}`;
  const [tk, setTk] = useState({ key, at: now });
  if (tk.key !== key) setTk({ key, at: now });
  const turnLeft = Math.max(0, TURN_SECS - (now - tk.at) / 1000);
  const timeUp = myTurn && tk.key === key && turnLeft <= 0;
  useEffect(() => {
    if (timeUp) game.move({ draw: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  // The call-out for special cards, for a moment after the move.
  const calloutText = CALLOUT[state.log] ?? (state.log.startsWith("Whot!") ? `⭐ ${state.log.toUpperCase()}` : null);
  const banner = calloutText && game.count > 0 && now - tk.at < 1500 ? { text: calloutText, at: game.count } : null;

  // How it ended, told to the server until it's settled (players only).
  const claim = useMemo(() => {
    if (!over || watching || !playing) return null;
    const w = rules.winners(state) ?? [];
    const winner = w.length === 1 ? (players[w[0]]?.id ?? null) : null;
    return winner ? { winner, draw: false } : { winner: null, draw: true };
  }, [over, watching, playing, state, players]);
  const claimKey = claim ? `${claim.winner}:${claim.draw}` : "";
  useEffect(() => {
    if (claimKey) playSfx(claimKey.startsWith(`${me.id}:`) ? "found" : "miss");
  }, [claimKey, me.id]);
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

  // Chat.
  const [chatOpen, setChatOpenNow] = useState(false);
  const [draft, setDraft] = useState("");
  const [seenChat, setSeenChat] = useState(0);
  const setChatOpen = (fn: (o: boolean) => boolean) => {
    setChatOpenNow(fn);
    setSeenChat(ch.chat.length);
  };
  useEffect(() => {
    if (!chatOpen && ch.chat.length) playSfx("tick");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch.chat.length]);
  const unread = chatOpen ? 0 : Math.max(0, ch.chat.length - seenChat);
  const bubbles = new Map<string, string>();
  for (const l of ch.chat) if (now - l.at < 4500) bubbles.set(l.from, l.text);

  // Voice.
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

  // The seats round the table, from where you sit (you at the bottom; watching: the first player).
  const base = watching ? 0 : mySeat;
  const order = players.map((_, i) => (base + i) % players.length);
  const others = order.slice(1);
  const spots = others.length === 1 ? ["top"] : others.length === 2 ? ["left", "right"] : ["left", "top", "right"];

  const prize = view.pool * WINNER_SHARE;
  const stage: React.CSSProperties = {
    ["--cw" as string]: `${cw}px`,
    background: "radial-gradient(ellipse at 50% 42%, #23915a 0%, #136b3f 45%, #0a4127 75%, #062716 100%)",
  };

  return (
    <OnTop className="fixed inset-0 flex h-[100dvh] select-none flex-col overflow-hidden text-white" style={stage} role="dialog" aria-label="Whot!">
      {/* Felt texture and a soft ring round the middle of the table. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 0.6px, transparent 0.6px)", backgroundSize: "6px 6px" }} />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[44%] h-[46%] w-[88%] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-[3px] border-white/10 shadow-[inset_0_0_60px_rgba(0,0,0,0.35)]" />

      {/* Top bar. */}
      <header className="relative z-20 flex items-center gap-2 px-3 pb-1 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <button onClick={() => (over || view.status === "done" || view.status === "cancelled" || watching ? onClose() : setLeaving(true))} className="grid size-10 shrink-0 place-items-center rounded-full bg-black/30 ring-1 ring-white/15" aria-label={watching ? "Stop watching" : "Leave"}>
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-black leading-none tracking-wide">
            WHOT<span className="text-[#ffd43b]">!</span>
          </p>
          <p className="truncate text-[11px] text-white/70">
            Pool <b className="text-[#ffd43b]">{cash(view.pool)}</b> · winner takes {cash(prize)}
          </p>
        </div>
        {watchers > 0 && (
          <span className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-black/30 px-2.5 text-xs font-semibold ring-1 ring-white/15" title="Watching">
            <Eye className="size-3.5" /> {watchers}
          </span>
        )}
        {/* Voice: join, mute, hang up. */}
        {call.joined ? (
          <span className="flex shrink-0 items-center gap-1">
            <button onClick={() => call.setMuted(!call.muted)} className={cn("grid size-10 place-items-center rounded-full ring-1 ring-white/15", call.muted ? "bg-hit" : "bg-[#12b886]")} aria-label={call.muted ? "Unmute" : "Mute"}>
              {call.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </button>
            <button onClick={() => call.leave()} className="grid size-8 place-items-center rounded-full bg-black/30 ring-1 ring-white/15" aria-label="Leave the voice call">
              <PhoneOff className="size-4" />
            </button>
          </span>
        ) : (
          <button onClick={() => void call.join()} disabled={call.joining || call.full} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-black/30 px-3 text-xs font-semibold ring-1 ring-white/15 disabled:opacity-50" aria-label="Join the voice call">
            {call.joining ? <LoaderCircle className="size-4 animate-spin" /> : <Mic className="size-4" />}
            <span className="hidden sm:inline">Voice</span>
            {call.people.length > 0 && <span className="rounded-full bg-[#12b886] px-1.5 text-[10px]">{call.people.length}</span>}
          </button>
        )}
        <button onClick={() => setChatOpen((o) => !o)} className="relative grid size-10 shrink-0 place-items-center rounded-full bg-black/30 ring-1 ring-white/15" aria-label="Chat">
          <MessageCircle className="size-5" />
          {unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#ff6b6b] px-1 text-[10px] font-bold">{unread}</span>}
        </button>
      </header>
      {call.error && <p className="relative z-20 mx-3 rounded-xl bg-black/50 px-3 py-1 text-xs text-[#ffa8a8]">{call.error}</p>}

      {view.status === "open" ? (
        <Lobby view={view} me={me} now={now} isHost={isHost} watching={watching} starting={starting} onStart={() => void startNow()} onLeave={() => setLeaving(true)} onJoin={onJoin} />
      ) : (
        <>
          {/* The table. */}
          <main className="relative z-10 min-h-0 flex-1">
            {others.map((seat, i) => (
              <Opponent
                key={seat}
                spot={spots[i]}
                p={players[seat]}
                cards={state.hands[seat]?.length ?? 0}
                cw={cw}
                active={turn === seat && !over}
                left={turnLeft}
                bot={kinds[seat] === "bot"}
                talking={inCall.has(players[seat]?.id ?? "")}
                bubble={bubbles.get(players[seat]?.id ?? "")}
                winner={view.winner === players[seat]?.id}
              />
            ))}
            {/* The market and the pile. */}
            <div className="absolute left-1/2 top-[50%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-[calc(var(--cw)*0.55)]">
              <button
                onClick={() => myTurn && game.move({ draw: true })}
                disabled={!myTurn}
                className={cn("relative transition-transform", myTurn && "hover:-translate-y-1 active:scale-95")}
                style={{ ["--cw" as string]: `${Math.round(cw * 1.2)}px` }}
                aria-label="Go to market"
              >
                {[3, 2, 1].map((d) => (
                  <CardBack key={d} className="absolute" style={{ top: -d * 2, left: -d * 2, opacity: state.market.length > d * 6 ? 1 : 0 }} />
                ))}
                <CardBack className={cn("relative", myTurn && "whot-playable")} />
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-bold">Market · {state.market.length}</span>
              </button>
              <div className="relative" style={{ ["--cw" as string]: `${Math.round(cw * 1.2)}px` }}>
                {pile.map((c, i) => {
                  const last = i === pile.length - 1;
                  const rot = ((c * 37 + i * 53) % 21) - 10;
                  return (
                    <CardFace
                      key={`${i}-${c}-${game.count}`}
                      c={c}
                      className={cn(i === 0 ? "relative" : "absolute left-0 top-0", last && game.count > 0 && "whot-drop")}
                      style={{ transform: `rotate(${rot}deg)`, ["--rot" as string]: `${rot}deg`, opacity: last ? 1 : 0.95 - (pile.length - 1 - i) * 0.08 }}
                    />
                  );
                })}
                {state.top === WHOT && state.ask !== null && (
                  <span className="absolute -bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-[#ffd43b] px-2.5 py-0.5 text-[11px] font-black text-[#5c0f0b] shadow">
                    Needs <ShapeIcon shape={state.ask} className="size-3.5" /> {SHAPES[state.ask]}
                  </span>
                )}
              </div>
            </div>
            {banner && (
              <div key={banner.at} className="whot-banner pointer-events-none absolute inset-x-0 top-[38%] z-30 text-center font-display text-4xl font-black text-[#ffd43b] drop-shadow-[0_4px_0_rgba(0,0,0,0.35)] sm:text-6xl">
                {banner.text}
              </div>
            )}
          </main>

          {/* You (or, watching, the first player, cards face down). */}
          <MyArea
            p={players[base]}
            hand={state.hands[base] ?? []}
            state={state}
            myTurn={myTurn}
            watching={watching}
            active={turn === base && !over}
            left={turnLeft}
            talking={inCall.has(players[base]?.id ?? "")}
            bubble={bubbles.get(players[base]?.id ?? "")}
            status={
              over || view.status === "done"
                ? "Game over"
                : myTurn
                  ? "Your turn: play a card, or go to market"
                  : turn >= 0
                    ? kinds[turn] === "bot"
                      ? `${players[turn]?.name} has left: the computer plays for them`
                      : `${players[turn]?.name ?? "Someone"}'s turn`
                    : ""
            }
            onMove={game.move}
          />
        </>
      )}

      {/* Chat. */}
      {chatOpen && (
        <div className="absolute inset-x-0 bottom-0 z-40 flex h-[55%] flex-col rounded-t-3xl bg-[#0b2418]/95 shadow-2xl backdrop-blur sm:inset-x-auto sm:right-3 sm:top-16 sm:bottom-3 sm:h-auto sm:w-80 sm:rounded-3xl">
          <div className="flex items-center justify-between px-4 pt-3">
            <p className="font-display font-bold">Table talk</p>
            <button onClick={() => setChatOpen(() => false)} className="grid size-8 place-items-center rounded-full bg-white/10" aria-label="Close chat">
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-2">
            {ch.chat.length === 0 && <p className="pt-6 text-center text-sm text-white/50">Say something to the table. Trash talk welcome. 😄</p>}
            {ch.chat.map((l) => (
              <p key={`${l.at}-${l.from}`} className={cn("max-w-[85%] rounded-2xl px-3 py-1.5 text-sm", l.from === me.id ? "ml-auto bg-[#12b886]" : "bg-white/10")}>
                {l.from !== me.id && <b className="block text-[11px] text-[#ffd43b]">{l.name}</b>}
                {l.text}
              </p>
            ))}
          </div>
          <div className="flex gap-1.5 px-3 pb-1">
            {["Last card! 🃏", "Check up! 🏁", "Hold on! ✋", "😂", "🔥"].map((q) => (
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
            <button type="submit" disabled={!draft.trim()} className="grid size-11 shrink-0 place-items-center rounded-full bg-[#ffd43b] text-[#1b1b1b] disabled:opacity-40" aria-label="Send">
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}

      {/* Over. */}
      {(view.status === "done" || view.status === "cancelled" || (over && playing)) && (
        <Result view={view} me={me} watching={watching} settling={view.status === "playing"} draw={over && (rules.winners(state)?.length ?? 0) !== 1} localWinner={over ? players[(rules.winners(state) ?? [])[0]]?.name : undefined} onClose={onClose} onRematch={onRematch} />
      )}

      {leaving && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/70 p-5">
          <div className="w-full max-w-xs rounded-3xl bg-panel p-5 text-center text-ink">
            <p className="font-display text-xl font-extrabold">{view.status === "open" ? (isHost ? "Call off the game?" : "Leave?") : "Leave the game?"}</p>
            <p className="mt-1 text-sm text-muted">
              {view.status === "open" ? (isHost ? "Everyone gets their stake back." : "Your stake comes back.") : players.length === 2 ? "The other player wins the pool." : "You lose your stake, and the computer plays your cards."}
            </p>
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
    </OnTop>
  );
}

/** A face with a ring that runs down with the turn's time. */
function Seat({ p, size, active, left, talking, bot, winner }: { p: { name: string; avatar: unknown }; size: number; active: boolean; left: number; talking?: boolean; bot?: boolean; winner?: boolean }) {
  const r = size / 2 + 5;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size + 14, height: size + 14 }}>
      <svg className="absolute inset-0 -rotate-90" viewBox={`0 0 ${size + 14} ${size + 14}`} aria-hidden>
        <circle cx={(size + 14) / 2} cy={(size + 14) / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
        {active && <circle cx={(size + 14) / 2} cy={(size + 14) / 2} r={r} fill="none" stroke={left < 8 ? "#ff6b6b" : "#ffd43b"} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - left / TURN_SECS)} style={{ transition: "stroke-dashoffset 0.5s linear" }} />}
      </svg>
      <AvatarFace avatar={cleanAvatar(p.avatar, p.name)} size={size} className={cn("rounded-full", bot && "opacity-60 grayscale")} />
      {talking && <span className="absolute bottom-0 right-0 grid size-4 place-items-center rounded-full bg-[#12b886] ring-2 ring-[#0a4127]"><Mic className="size-2.5" /></span>}
      {winner && <Crown className="absolute -top-2 left-1/2 size-5 -translate-x-1/2 text-[#ffd43b]" />}
    </span>
  );
}

function Bubble({ text, below }: { text?: string; below?: boolean }) {
  if (!text) return null;
  return (
    <span className={cn("whot-bubble absolute left-1/2 z-30 max-w-[11rem] -translate-x-1/2 truncate rounded-2xl bg-white px-3 py-1 text-xs font-semibold text-ink shadow-lg", below ? "top-full mt-1" : "bottom-full mb-1")}>
      {text}
    </span>
  );
}

function Opponent({ spot, p, cards, cw, active, left, bot, talking, bubble, winner }: { spot: string; p: { id: string; name: string; avatar: unknown } | undefined; cards: number; cw: number; active: boolean; left: number; bot: boolean; talking: boolean; bubble?: string; winner: boolean }) {
  if (!p) return null;
  const pos = spot === "top" ? "left-1/2 top-[2%] -translate-x-1/2 flex-col" : spot === "left" ? "left-[2%] top-[18%] flex-col lg:left-[8%]" : "right-[5%] top-[18%] flex-col lg:right-[8%]";
  const shown = Math.min(cards, 7);
  const small = { ["--cw" as string]: `${Math.round(cw * 0.48)}px` } as React.CSSProperties;
  return (
    <div className={cn("absolute flex items-center gap-1", pos)}>
      <div className="relative flex flex-col items-center">
        <Bubble text={bubble} below />
        <Seat p={p} size={44} active={active} left={left} talking={talking} bot={bot} winner={winner} />
        <span className={cn("mt-0.5 max-w-24 truncate rounded-full px-2 py-0.5 text-[11px] font-bold", active ? "bg-[#ffd43b] text-ink" : "bg-black/35")}>{p.name}</span>
      </div>
      <div className="relative mt-1 flex h-[calc(var(--cw)*0.75)] items-center" style={small}>
        {Array.from({ length: shown }, (_, i) => (
          <CardBack key={i} className="shrink-0" style={{ marginLeft: i ? "calc(var(--cw) * -0.62)" : 0, transform: `rotate(${(i - (shown - 1) / 2) * 5}deg)` }} />
        ))}
        <span className="absolute -right-3 -top-2 grid size-6 place-items-center rounded-full bg-white text-[11px] font-black text-ink shadow">{cards}</span>
      </div>
      {cards === 1 && <span className="mt-1 rounded-full bg-[#ff6b6b] px-2 py-0.5 text-[10px] font-black">LAST CARD!</span>}
    </div>
  );
}

/** Your hand, fanned to fit the screen (never scrolls), the cards you can play lifted and glowing. */
function MyArea({
  p,
  hand,
  state,
  myTurn,
  watching,
  active,
  left,
  talking,
  bubble,
  status,
  onMove,
}: {
  p: { id: string; name: string; avatar: unknown } | undefined;
  hand: number[];
  state: S;
  myTurn: boolean;
  watching: boolean;
  active: boolean;
  left: number;
  talking: boolean;
  bubble?: string;
  status: string;
  onMove: (m: M) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const [asking, setAsking] = useState(false);
  // Sorted by shape then number (the Whot cards last), so it's easy to read.
  const sorted = useMemo(() => hand.map((c, i) => ({ c, i })).sort((a, b) => (a.c === WHOT ? 1 : 0) - (b.c === WHOT ? 1 : 0) || shapeOf(a.c) - shapeOf(b.c) || valueOf(a.c) - valueOf(b.c)), [hand]);
  // Cards just picked up deal in.
  const before = useRef<number[]>(hand);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  useEffect(() => {
    const had = [...before.current];
    const added = new Set<number>();
    hand.forEach((c, i) => {
      const k = had.indexOf(c);
      if (k >= 0) had.splice(k, 1);
      else added.add(i);
    });
    before.current = hand;
    if (!added.size) return;
    setFresh(added);
    const t = setTimeout(() => setFresh(new Set()), 450);
    return () => clearTimeout(t);
  }, [hand]);
  if (!p) return null;
  const n = sorted.length;
  return (
    <section className="relative z-20 shrink-0 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
      <p className={cn("mx-auto mb-1 w-fit rounded-full px-3 py-1 text-center text-xs font-bold", myTurn ? "bg-[#ffd43b] text-ink" : "bg-black/35")} aria-live="polite">
        {watching ? `Watching · ${p.name}'s cards stay face down` : status}
      </p>
      <div ref={box} className="relative mx-auto h-[calc(var(--cw)*1.75)] w-full max-w-3xl px-2">
        <HandFan width={w} n={n}>
          {(x, rot, lift, i) => {
            const { c, i: idx } = sorted[i];
            const can = myTurn && playable(state, c);
            const style: React.CSSProperties = { left: x, transform: `translateY(${lift - (can ? 16 : 0)}px) rotate(${rot}deg)`, zIndex: i };
            return watching ? (
              <CardBack key={`${c}-${idx}`} className={cn("absolute bottom-2 transition-transform", fresh.has(idx) && "whot-deal")} style={style} />
            ) : (
              <button
                key={`${c}-${idx}`}
                onClick={() => can && (c === WHOT ? setAsking(true) : onMove({ play: c }))}
                disabled={!can}
                className={cn("absolute bottom-2 transition-transform duration-200", can && "hover:!-translate-y-6", fresh.has(idx) && "whot-deal")}
                style={style}
                aria-label={c === WHOT ? "Play Whot 20" : `Play ${SHAPES[shapeOf(c)]} ${valueOf(c)}`}
              >
                <CardFace c={c} className={cn(can && "whot-playable", myTurn && !can && "brightness-[0.82]")} />
              </button>
            );
          }}
        </HandFan>
      </div>
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3">
        <span className="relative">
          <Bubble text={bubble} />
          <Seat p={p} size={34} active={active} left={left} talking={talking} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          {watching ? p.name : "You"} · {hand.length} card{hand.length === 1 ? "" : "s"}
          {hand.length === 1 && <span className="ml-1.5 rounded-full bg-[#ff6b6b] px-2 py-0.5 text-[10px] font-black">LAST CARD!</span>}
        </span>
        {!watching && (
          <button onClick={() => myTurn && onMove({ draw: true })} disabled={!myTurn} className="h-11 shrink-0 rounded-full bg-[#ffd43b] px-5 text-sm font-black text-ink shadow-[0_3px_0_#c99a00] transition active:translate-y-0.5 active:shadow-none disabled:opacity-40">
            Go to market
          </button>
        )}
      </div>
      {asking && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setAsking(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-[#fffaf0] p-5 text-center text-ink" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-2xl font-black text-[#8b1e2d]">WHOT! I need…</p>
            <p className="text-sm text-muted">Pick the shape the next player must play.</p>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {SHAPES.map((name, a) => (
                <button
                  key={name}
                  onClick={() => {
                    setAsking(false);
                    onMove({ play: WHOT, ask: a });
                  }}
                  className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 text-[11px] font-bold shadow ring-1 ring-[#8b1e2d]/15 active:scale-95"
                >
                  <ShapeIcon shape={a} className="size-9" />
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Where each card of a hand goes: overlapping to fit the width, in a gentle arc. */
function HandFan({ width, n, children }: { width: number; n: number; children: (x: number, rot: number, lift: number, i: number) => React.ReactNode }) {
  const cw = useCardWidth();
  const W = Math.max(cw, width - 16);
  const step = n > 1 ? Math.min(cw * 0.82, (W - cw) / (n - 1)) : 0;
  const total = cw + step * (n - 1);
  const x0 = (W - total) / 2 + 8;
  const mid = (n - 1) / 2;
  const tilt = Math.min(4, 32 / Math.max(1, n));
  return <>{Array.from({ length: n }, (_, i) => children(x0 + i * step, (i - mid) * tilt, Math.abs(i - mid) ** 2 * Math.min(2.2, 14 / Math.max(1, n)), i))}</>;
}

function Lobby({ view, me, now, isHost, watching, starting, onStart, onLeave, onJoin }: { view: ChallengeView; me: Me; now: number; isHost: boolean; watching: boolean; starting: boolean; onStart: () => void; onLeave: () => void; onJoin?: () => void }) {
  const left = (Date.parse(view.startsAt) - now) / 1000;
  const pending = view.invited && !view.players.some((p) => p.id === view.invited!.id) ? view.invited : null;
  const empty = Math.max(0, Math.min(4, view.seats) - view.players.length - (pending ? 1 : 0));
  return (
    <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="flex items-center gap-3" style={{ ["--cw" as string]: "56px" }}>
        <CardFace c={520} style={{ transform: "rotate(-10deg)" }} />
        <p className="font-display text-5xl font-black tracking-wide drop-shadow-[0_4px_0_rgba(0,0,0,0.3)] sm:text-6xl">
          WHOT<span className="text-[#ffd43b]">!</span>
        </p>
        <CardFace c={414} style={{ transform: "rotate(10deg)" }} />
      </div>
      <div className="flex flex-wrap items-end justify-center gap-4">
        {view.players.map((p, i) => (
          <div key={p.id} className="flex items-center gap-4">
            {i > 0 && <span className="font-display text-2xl font-black text-[#ffd43b]">VS</span>}
            <div className="flex flex-col items-center gap-1">
              <AvatarFace avatar={cleanAvatar(p.avatar, p.name)} size={64} className="rounded-full ring-4 ring-white/80" />
              <span className="max-w-24 truncate text-sm font-bold">{p.id === me.id ? "You" : p.name}</span>
              <span className="rounded-full bg-[#12b886] px-2 text-[10px] font-bold">Ready</span>
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex items-center gap-4">
            <span className="font-display text-2xl font-black text-[#ffd43b]">VS</span>
            <div className="flex flex-col items-center gap-1 opacity-80">
              <span className="relative">
                <AvatarFace avatar={cleanAvatar(pending.avatar, pending.name)} size={64} className="rounded-full ring-4 ring-dashed ring-white/40" />
                <LoaderCircle className="absolute -right-1 -top-1 size-5 animate-spin text-[#ffd43b]" />
              </span>
              <span className="max-w-24 truncate text-sm font-bold">{pending.name}</span>
              <span className="rounded-full bg-white/15 px-2 text-[10px] font-bold">Invited</span>
            </div>
          </div>
        )}
        {Array.from({ length: empty }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-1 opacity-60">
            <span className="grid size-16 place-items-center rounded-full border-2 border-dashed border-white/50">
              <Users className="size-6" />
            </span>
            <span className="text-[11px]">Open seat</span>
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-black/30 px-4 py-2 ring-1 ring-white/10">
        <p className="text-sm">
          Stake <b className="text-[#ffd43b]">{cash(view.stake)}</b> each · pool <b>{cash(view.pool)}</b> · winner takes <b className="text-[#ffd43b]">{cash(view.pool * WINNER_SHARE)}</b>
        </p>
        <p className="mt-0.5 text-xs text-white/70">
          {pending
            ? `Waiting for ${pending.name} to accept · ${mmss(left)}`
            : view.players.length >= 2
              ? `Starting in ${Math.max(0, Math.ceil(left))}s. Anyone nearby can still join.`
              : `Waiting for players · ${mmss(left)}`}
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        {isHost && (
          <button onClick={onStart} disabled={starting || view.players.length < 2} className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#ffd43b] font-black text-ink shadow-[0_4px_0_#c99a00] disabled:opacity-40">
            {starting ? <LoaderCircle className="size-5 animate-spin" /> : <Play className="size-5 fill-current" />} Start now
          </button>
        )}
        {watching && onJoin && view.players.length < view.seats && (
          <button onClick={onJoin} className="h-12 rounded-full bg-[#ffd43b] font-black text-ink shadow-[0_4px_0_#c99a00]">
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

function Result({ view, me, watching, settling, draw, localWinner, onClose, onRematch }: { view: ChallengeView; me: Me; watching: boolean; settling: boolean; draw: boolean; localWinner?: string; onClose: () => void; onRematch?: () => void }) {
  const won = view.status === "done" && view.winner === me.id;
  const winner = view.players.find((p) => p.id === view.winner);
  const cancelled = view.status === "cancelled";
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/60 p-5 backdrop-blur-[2px]">
      {won && <Confetti />}
      <div className="start-pop w-full max-w-sm rounded-[2rem] bg-gradient-to-b from-[#1d6b45] to-[#0b3d24] p-6 text-center shadow-2xl ring-2 ring-[#ffd43b]/60">
        {settling ? (
          <>
            <p className="font-display text-3xl font-black">{draw ? "It's a draw!" : `${localWinner ?? "Someone"} checks up!`}</p>
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
                <Crown className="absolute -top-7 left-1/2 size-8 -translate-x-1/2 fill-[#ffd43b] text-[#ffd43b] drop-shadow" />
                <AvatarFace avatar={cleanAvatar(winner.avatar, winner.name)} size={84} className="rounded-full ring-4 ring-[#ffd43b]" />
              </span>
            )}
            <p className="mt-3 font-display text-3xl font-black">{won ? "You won!" : `${winner?.name ?? "Someone"} won`}</p>
            <p className="mt-1 text-lg font-bold text-[#ffd43b]">{won ? `+${cash(view.prize ?? 0)}` : watching ? `They take ${cash(view.prize ?? 0)}` : "Better luck next time."}</p>
          </>
        )}
        <div className="mt-5 flex flex-col gap-2">
          {!watching && !settling && onRematch && view.players.length >= 2 && (
            <button onClick={onRematch} className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#ffd43b] font-black text-ink shadow-[0_4px_0_#c99a00]">
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
