"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, LoaderCircle, RefreshCw, Send, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { HEAT_NAMES, type Heat } from "@/lib/party/truth-dare-cards";
import { TD_ANSWER_MAX, TD_CHICKEN, tdHeatNow, tdPoints, tdRounds, truthDare, type TDKind, type TDTurn } from "@/lib/party/truth-dare";
import type { ChallengeView } from "../fight/challenge-actions";
import { useChallengeChannel } from "../fight/channel";
import { playSfx } from "../sound";
import { Bubble, PartyShell, Seat, ovalSpot, usePartyGame, useSeats, useSettle, type Me, type Theme } from "./party-table";

// Truth or Dare at a full-screen table (docs/PARTY_GAMES.md): a nightclub stage, the players round
// an oval, the bottle in the middle. Spin it, it stops on someone; Truth or Dare; the card flips
// over; they answer or do it on the voice call; the others judge; a stamp says how it went.

const TRUTH = { from: "#22d3ee", to: "#1d4ed8", glow: "rgba(34, 211, 238, 0.7)" };
const DARE = { from: "#ff2d95", to: "#7c3aed", glow: "rgba(255, 45, 149, 0.7)" };
const look = (k: TDKind | null) => (k === "dare" ? DARE : TRUTH);
const SPIN_MS = 2800;

const theme: Theme = {
  background:
    "radial-gradient(ellipse 70% 45% at 50% 105%, rgba(255,45,149,0.45), transparent 70%), radial-gradient(ellipse 60% 40% at 50% -5%, rgba(124,58,237,0.55), transparent 70%), radial-gradient(ellipse at 50% 50%, #1f0a33 0%, #12051f 60%, #08020f 100%)",
  accent: "#ff2d95",
  onAccent: "#ffffff",
  panel: "linear-gradient(180deg, rgba(49,16,77,0.97), rgba(18,5,31,0.97))",
  logo: (
    <span className="party-neon font-display text-lg font-black uppercase tracking-wide" style={{ textShadow: "0 0 10px rgba(255,45,149,0.8)" }}>
      <span style={{ color: TRUTH.from, textShadow: `0 0 10px ${TRUTH.glow}` }}>Truth</span> <span className="text-sm text-white/70">or</span> <span style={{ color: DARE.from }}>Dare</span>
    </span>
  ),
  quick: ["😂😂😂", "Liar! 🤥", "Do it! 🔥", "Chicken! 🐔", "Respect 🫡", "Ehn?! 😳"],
};

export function TruthDareTable({ view, me, now, onClose, onMessage, onJoin, onRematch }: { view: ChallengeView; me: Me; now: number; onClose: () => void; onMessage: (text: string, good: boolean) => void; onJoin?: () => void; onRematch?: () => void }) {
  const ch = useChallengeChannel(view.id, me);
  const { players, mySeat, watching, playing, kinds } = useSeats(view, me, ch);
  const game = usePartyGame(truthDare, { seed: view.seed, kinds, watching, ch, live: playing, now });
  const s = game.state;
  const over = s.phase === "over";
  const winners = truthDare.winners(s);
  useSettle(view, watching, winners, onMessage);

  const base = watching ? 0 : mySeat;
  const name = (seat: number) => (seat === mySeat ? "You" : (players[seat]?.name ?? "Someone"));
  const heat = tdHeatNow(s);
  const rounds = tdRounds(s.n);
  const roundNo = Math.min(rounds, Math.floor(s.turnNo / s.n) + 1);

  // The bottle: a few turns and then it points at whoever it stopped on.
  const [deg, setDeg] = useState(0);
  const spunFor = useRef("");
  useEffect(() => {
    if (s.hot < 0 || s.phase === "spin") return;
    const key = `${s.turnNo}`;
    if (spunFor.current === key) return;
    spunFor.current = key;
    const target = ovalSpot(s.hot, base, s.n).deg + 90;
    setDeg((d) => {
      const at = ((d % 360) + 360) % 360;
      return d + 360 * 4 + ((target - at + 360) % 360);
    });
    playSfx("whoosh");
    const t = setTimeout(() => playSfx("pop"), SPIN_MS);
    return () => clearTimeout(t);
  }, [s.turnNo, s.hot, s.phase, base, s.n]);
  const landed = s.phase !== "choose" || game.since > SPIN_MS + 100;

  // How the last turn went, stamped across the table for a moment.
  const last: TDTurn | undefined = s.past[s.past.length - 1];
  const stamp = last && (s.phase === "spin" || over) && game.since < 2400 ? last : null;
  const stampKey = s.past.length;
  useEffect(() => {
    if (!stampKey) return;
    const r = s.past[stampKey - 1]?.result;
    playSfx(r === "accepted" ? "chime" : r === "vetoed" ? "denied" : "honk");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stampKey]);
  useEffect(() => {
    if (s.kind) playSfx("start");
  }, [s.kind]);

  const standings = useMemo(() => players.map((p, i) => ({ p, points: s.scores[i] ?? 0 })).sort((a, b) => b.points - a.points), [players, s.scores]);
  const overTitle = !winners ? "" : winners.length === 1 ? `${name(winners[0])} ${winners[0] === mySeat ? "win" : "wins"}!` : "It's a draw!";
  const total = truthDare.secs(s);

  return (
    <PartyShell view={view} me={me} now={now} ch={ch} theme={theme} title="Truth or Dare" over={over} standings={standings} overTitle={overTitle} onClose={onClose} onMessage={onMessage} onJoin={onJoin} onRematch={onRematch}>
      {({ inCall, bubbles }) => (
        <>
          {/* Spotlights. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="party-beam absolute -top-10 left-[18%] h-[120%] w-40 bg-gradient-to-b from-[#ff2d95]/25 to-transparent blur-2xl" />
            <div className="party-beam absolute -top-10 right-[18%] h-[120%] w-40 bg-gradient-to-b from-[#22d3ee]/20 to-transparent blur-2xl" style={{ animationDelay: "-3.5s" }} />
            <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 0.7px, transparent 0.7px)", backgroundSize: "7px 7px" }} />
          </div>

          {/* Round and heat. */}
          <div className="relative z-10 mx-auto mt-1 flex w-fit items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-[11px] font-bold uppercase tracking-wider ring-1 ring-white/10 backdrop-blur">
            <span>
              Round {roundNo}/{rounds}
            </span>
            <span className="text-white/40">·</span>
            <HeatTag heat={heat} />
            <span className="text-white/40">·</span>
            <span className="tabular-nums text-white/70">
              Turn {Math.min(s.total, s.turnNo + 1)}/{s.total}
            </span>
          </div>

          {/* The stage: the players round the oval, the bottle in the middle. */}
          <main className="relative z-10 min-h-0 flex-1">
            <div aria-hidden className="absolute left-1/2 top-[46%] h-[62%] w-[86%] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-white/10 bg-[radial-gradient(ellipse_at_center,rgba(255,45,149,0.18),transparent_65%)] shadow-[inset_0_0_80px_rgba(0,0,0,0.6),0_0_60px_rgba(124,58,237,0.25)]" />
            {players.map((p, seat) => {
              const at = ovalSpot(seat, base, s.n, 41, 36, 46);
              const hot = seat === s.hot && s.phase !== "spin";
              const active = game.turn === seat && !over;
              return (
                <div key={p.id} className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${at.left}%`, top: `${at.top}%` }}>
                  {hot && landed && <span aria-hidden className="party-spot absolute left-1/2 top-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: `radial-gradient(circle, ${look(s.kind).glow}, transparent 70%)` }} />}
                  <span className="relative">
                    <Bubble text={bubbles.get(p.id)} />
                    <Seat p={p} size={hot && landed ? 52 : 42} active={active} left={game.left} total={total} talking={inCall.has(p.id)} bot={kinds[seat] === "bot"} winner={view.winner === p.id} accent={look(s.kind).from} />
                  </span>
                  <span className={cn("mt-0.5 max-w-[5.5rem] truncate rounded-full px-2 py-0.5 text-[11px] font-bold", active ? "bg-white text-[#12051f]" : "bg-black/45")}>{seat === mySeat ? "You" : p.name}</span>
                  <span className="mt-0.5 flex items-center gap-1">
                    <span className="rounded-full bg-[#ff2d95] px-1.5 text-[10px] font-black tabular-nums shadow">{s.scores[seat]} pts</span>
                    <span className="flex gap-0.5" title="Vetoes left">
                      {Array.from({ length: s.vetoes[seat] }, (_, i) => (
                        <span key={i} className="text-[9px]">
                          🚫
                        </span>
                      ))}
                    </span>
                  </span>
                </div>
              );
            })}

            {/* The bottle (hidden under the card while it's being answered and judged). */}
            <div className={cn("absolute left-1/2 top-[46%] z-0 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300", (s.phase === "do" || s.phase === "judge") && "opacity-0")}>
              <Bottle deg={deg} />
            </div>

            {/* The card. */}
            {(s.phase === "do" || s.phase === "judge") && s.kind && s.card && <Card key={`${s.turnNo}:${s.card}`} kind={s.kind} heat={heat} text={s.card} answer={s.phase === "judge" ? (s.answer ?? "") : null} who={name(s.hot)} />}

            {/* Choose: Truth or Dare? */}
            {s.phase === "choose" && landed && (
              <div className="party-pop absolute left-1/2 top-[46%] z-20 -translate-x-1/2 -translate-y-1/2 text-center">
                <p className="font-display text-2xl font-black drop-shadow-[0_3px_0_rgba(0,0,0,0.5)] sm:text-4xl">{s.hot === mySeat ? "You're on the spot!" : `${name(s.hot)} is on the spot!`}</p>
                <p className="text-sm text-white/70">Truth or dare?</p>
              </div>
            )}

            {stamp && <Stamp key={stampKey} turn={stamp} who={name(stamp.hot)} />}
          </main>

          {/* What you can do now. */}
          <Controls s={s} me={mySeat} watching={watching} myTurn={game.myTurn} landed={landed} left={game.left} name={name} kinds={kinds} heat={heat} onMove={game.move} />
        </>
      )}
    </PartyShell>
  );
}

function HeatTag({ heat }: { heat: Heat }) {
  return (
    <span className={cn("flex items-center gap-0.5", heat === 3 ? "text-[#ff6b6b]" : heat === 2 ? "text-[#ffa94d]" : "text-[#ffd43b]")}>
      {Array.from({ length: heat }, (_, i) => (
        <Flame key={i} className="size-3 fill-current" />
      ))}
      {HEAT_NAMES[heat]}
    </span>
  );
}

/** A drawn bottle that spins to point at a seat. */
function Bottle({ deg }: { deg: number }) {
  return (
    <div className="relative grid size-40 place-items-center sm:size-48">
      <div aria-hidden className="absolute inset-4 rounded-full bg-[conic-gradient(from_0deg,rgba(255,45,149,0.25),rgba(34,211,238,0.25),rgba(124,58,237,0.25),rgba(255,45,149,0.25))] blur-md" />
      <svg viewBox="0 0 60 160" className="relative h-36 drop-shadow-[0_8px_12px_rgba(0,0,0,0.6)] sm:h-44" style={{ transform: `rotate(${deg}deg)`, transition: `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.7, 0.15, 1)` }} aria-hidden>
        <defs>
          <linearGradient id="td-glass" x1="0" x2="1">
            <stop offset="0" stopColor="#0b6b3a" />
            <stop offset="0.45" stopColor="#1fbf6b" />
            <stop offset="0.6" stopColor="#13894c" />
            <stop offset="1" stopColor="#063d21" />
          </linearGradient>
        </defs>
        {/* The neck points the way. */}
        <rect x="24" y="4" width="12" height="10" rx="2" fill="#ffd43b" />
        <path d="M24 14 h12 v26 c0 8 16 14 16 30 v76 c0 6 -4 10 -10 10 h-24 c-6 0 -10 -4 -10 -10 v-76 c0 -16 16 -22 16 -30 z" fill="url(#td-glass)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
        <rect x="12" y="84" width="36" height="34" rx="4" fill="#fff7e6" />
        <text x="30" y="99" textAnchor="middle" fontSize="8" fontWeight="900" fill="#7c3aed">
          T or D
        </text>
        <text x="30" y="110" textAnchor="middle" fontSize="6" fontWeight="700" fill="#ff2d95">
          ★ NEWTOWN ★
        </text>
        <path d="M18 48 c-3 10 -4 40 -4 70" stroke="rgba(255,255,255,0.45)" strokeWidth="3" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}

function Card({ kind, heat, text, answer, who }: { kind: TDKind; heat: Heat; text: string; answer: string | null; who: string }) {
  const c = look(kind);
  return (
    <div className="absolute left-1/2 top-[46%] z-20 w-[min(17rem,60%)] -translate-x-1/2 -translate-y-1/2">
      <div className="party-flip relative overflow-hidden rounded-[1.6rem] p-4 text-center shadow-[0_20px_50px_rgba(0,0,0,0.6)] ring-2 ring-white/70" style={{ background: `linear-gradient(150deg, ${c.from}, ${c.to})`, boxShadow: `0 0 40px ${c.glow}, 0 20px 50px rgba(0,0,0,0.6)` }}>
        <div aria-hidden className="absolute -right-8 -top-8 size-24 rounded-full bg-white/15" />
        <div aria-hidden className="absolute -bottom-10 -left-6 size-28 rounded-full bg-black/10" />
        <p className="relative font-display text-3xl font-black uppercase tracking-wider drop-shadow-[0_2px_0_rgba(0,0,0,0.3)]">{kind}</p>
        <p className="relative mt-0.5 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/85">
          <HeatTag heat={heat} /> <span>+{tdPoints(kind, heat)} pts</span>
        </p>
        <p className="relative mt-3 text-[15px] font-bold leading-snug sm:text-lg">{text}</p>
        <p className="relative mt-3 text-[11px] font-semibold text-white/75">for {who}</p>
      </div>
      {answer !== null && (
        <div className="party-pop relative mx-2 -mt-2 rounded-2xl bg-white px-3 py-2 text-center text-sm font-semibold text-[#12051f] shadow-xl">
          <span className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rotate-45 bg-white" />
          <span className="relative">{answer ? `“${answer}”` : "Done it! ✅"}</span>
        </div>
      )}
    </div>
  );
}

function Stamp({ turn, who }: { turn: TDTurn; who: string }) {
  const look =
    turn.result === "accepted"
      ? { text: "Accepted", sub: `${who} +${turn.points}`, colour: "#12b886", emoji: "✅" }
      : turn.result === "vetoed"
        ? { text: "Vetoed", sub: `${who} gets nothing`, colour: "#ff3b3b", emoji: "🚫" }
        : { text: "Chicken!", sub: `${who} ${TD_CHICKEN}`, colour: "#fab005", emoji: "🐔" };
  return (
    <div className="party-stamp pointer-events-none absolute left-1/2 top-[46%] z-30 rounded-2xl border-[5px] bg-black/30 px-5 py-2 text-center backdrop-blur-sm" style={{ borderColor: look.colour, color: look.colour, boxShadow: `0 0 30px ${look.colour}` }}>
      <p className="font-display text-4xl font-black uppercase tracking-wider sm:text-6xl">
        {look.emoji} {look.text}
      </p>
      <p className="text-sm font-bold text-white">{look.sub}</p>
    </div>
  );
}

function Controls({
  s,
  me,
  watching,
  myTurn,
  landed,
  left,
  name,
  kinds,
  heat,
  onMove,
}: {
  s: ReturnType<typeof truthDare.init>;
  me: number;
  watching: boolean;
  myTurn: boolean;
  landed: boolean;
  left: number;
  name: (seat: number) => string;
  kinds: string[];
  heat: Heat;
  onMove: (m: Parameters<typeof truthDare.play>[1]) => boolean;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const key = `${s.turnNo}:${s.phase}:${s.card}`;
  const [forKey, setForKey] = useState(key);
  if (forKey !== key) {
    setForKey(key);
    setText("");
    setSending(false);
  }
  const timer = <span className={cn("tabular-nums", left < 6 && "text-[#ff6b6b]")}>{Math.ceil(left)}s</span>;
  const wrap = (children: React.ReactNode) => <section className="relative z-20 mx-auto w-full max-w-lg shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">{children}</section>;
  const note = (t: React.ReactNode) => wrap(<p className="mx-auto w-fit rounded-full bg-black/45 px-4 py-2 text-center text-sm font-semibold ring-1 ring-white/10 backdrop-blur">{t}</p>);
  const turnOf = truthDare.turn(s);

  if (s.phase === "over") return wrap(null);
  if (s.phase === "spin") {
    if (myTurn)
      return wrap(
        <button onClick={() => onMove({ spin: true })} className="party-pulse flex h-16 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#ff2d95] to-[#7c3aed] font-display text-xl font-black uppercase tracking-wider">
          🍾 Spin the bottle
        </button>,
      );
    return note(
      <>
        {kinds[s.spinner] === "bot" ? `${name(s.spinner)} has left: the bottle spins itself` : `${name(s.spinner)} is spinning the bottle…`} {timer}
      </>,
    );
  }
  if (s.phase === "choose") {
    if (!landed) return note("Round and round it goes…");
    if (myTurn)
      return wrap(
        <div className="grid grid-cols-2 gap-3">
          {(["truth", "dare"] as const).map((k) => {
            const c = look(k);
            return (
              <button key={k} onClick={() => onMove({ pick: k })} className="party-pop flex h-24 flex-col items-center justify-center rounded-3xl font-display ring-2 ring-white/60 transition active:scale-95" style={{ background: `linear-gradient(150deg, ${c.from}, ${c.to})`, boxShadow: `0 0 24px ${c.glow}, 0 6px 0 rgba(0,0,0,0.35)` }}>
                <span className="text-2xl font-black uppercase tracking-wider">{k}</span>
                <span className="text-xs font-bold text-white/85">+{tdPoints(k, heat)} pts</span>
              </button>
            );
          })}
          <p className="col-span-2 text-center text-xs text-white/60">Pick in {timer}, or it&apos;s a truth.</p>
        </div>,
      );
    return note(
      <>
        {name(s.hot)} is choosing… {timer}
      </>,
    );
  }
  if (s.phase === "do") {
    if (myTurn) {
      const dare = s.kind === "dare";
      const ok = dare || text.trim().length > 0;
      const send = () => {
        if (!ok || sending) return;
        setSending(true);
        if (!onMove({ answer: text })) setSending(false);
      };
      return wrap(
        <div className="space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2"
          >
            <input autoFocus={!dare} value={text} onChange={(e) => setText(e.target.value.slice(0, TD_ANSWER_MAX))} placeholder={dare ? "Do it on voice, then say how it went (optional)" : "Your honest answer…"} className="h-12 min-w-0 flex-1 rounded-full bg-white/12 px-4 text-sm outline-none ring-1 ring-white/20 placeholder:text-white/45 focus:ring-[#ff2d95]" />
            <button type="submit" disabled={!ok || sending} className="flex h-12 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff2d95] to-[#7c3aed] px-4 text-sm font-black shadow-[0_4px_0_rgba(0,0,0,0.35)] disabled:opacity-40">
              {sending ? <LoaderCircle className="size-4 animate-spin" /> : dare ? "✅" : <Send className="size-4" />} {dare ? "Done it" : "Answer"}
            </button>
          </form>
          <div className="flex items-center justify-between gap-2 text-xs">
            <button onClick={() => onMove({ swap: true })} disabled={s.swaps[me] <= 0} className="flex h-9 items-center gap-1 rounded-full bg-white/10 px-3 font-semibold disabled:opacity-35">
              <RefreshCw className="size-3.5" /> Swap card ({s.swaps[me]})
            </button>
            <span className="text-white/60">{timer} left</span>
            <button onClick={() => onMove({ chicken: true })} className="flex h-9 items-center gap-1 rounded-full bg-[#fab005]/20 px-3 font-semibold text-[#ffd43b] ring-1 ring-[#fab005]/40">
              🐔 Chicken out ({TD_CHICKEN})
            </button>
          </div>
        </div>,
      );
    }
    return note(
      <>
        {s.kind === "dare" ? `${name(s.hot)} is doing the dare. Join voice to see it! 🎙️` : `${name(s.hot)} is typing the truth…`} {timer}
      </>,
    );
  }
  // Judging.
  const judgeRow = (
    <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5">
      {s.judges.map((j, i) => (
        <span key={j} className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", i < s.votes.length ? (s.votes[i] ? "bg-[#12b886]" : "bg-[#ff3b3b]") : j === turnOf ? "bg-white text-[#12051f]" : "bg-white/10")}>
          {i < s.votes.length ? (s.votes[i] ? "👍" : "🚫") : j === turnOf ? "⏳" : "…"} {name(j)}
        </span>
      ))}
    </div>
  );
  if (myTurn && !watching)
    return wrap(
      <>
        {judgeRow}
        <p className="mb-2 text-center text-sm font-bold">Does it count? {timer}</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onMove({ vote: true })} className="flex h-14 items-center justify-center gap-2 rounded-full bg-[#12b886] font-display text-lg font-black shadow-[0_5px_0_#087f5b] active:translate-y-0.5 active:shadow-none">
            <ThumbsUp className="size-5" /> Accept
          </button>
          <button onClick={() => onMove({ vote: false })} disabled={s.vetoes[me] <= 0} className="flex h-14 items-center justify-center gap-2 rounded-full bg-[#ff3b3b] font-display text-lg font-black shadow-[0_5px_0_#a61e1e] active:translate-y-0.5 active:shadow-none disabled:opacity-35">
            🚫 Veto ({s.vetoes[me]})
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-white/55">Most of the judges have to veto. You have {s.vetoes[me]} for the whole game.</p>
      </>,
    );
  return wrap(
    <>
      {judgeRow}
      <p className="mx-auto w-fit rounded-full bg-black/45 px-4 py-1.5 text-center text-xs font-semibold">
        {s.hot === me ? "The table is judging you…" : "The table is judging…"} {timer}
      </p>
    </>,
  );
}
