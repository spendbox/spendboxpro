"use client";

import { useEffect, useMemo, useState } from "react";
import { Crosshair, Eye, EyeOff, LoaderCircle, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { BOARDS } from "@/lib/party/impostor-words";
import { IMP_CLUE_MAX, IMP_MIN_PLAYERS, IMP_POINTS, impostor, type IMove, type IState } from "@/lib/party/impostor";
import type { ChallengeView } from "../fight/challenge-actions";
import { useChallengeChannel } from "../fight/channel";
import { impostorDeal, impostorReveal } from "../fight/party-actions";
import { playSfx } from "../sound";
import { Bubble, PartyShell, Seat, usePartyGame, useSeats, useSettle, type Me, type Theme } from "./party-table";

// Impostor at a full-screen table (docs/PARTY_GAMES.md): a spy thriller. The board of twelve words,
// your secret (the word, or that you're the impostor) under a flap you tap to peek at, a clue each
// round the table, then everyone points at who they think it is, a drumroll, and the reveal.

const RED = "#ef4444";
const theme: Theme = {
  background: "radial-gradient(ellipse 80% 50% at 50% 0%, #1e2a44 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(239,68,68,0.18), transparent 70%), linear-gradient(180deg, #0b1220 0%, #050810 100%)",
  accent: RED,
  onAccent: "#ffffff",
  panel: "linear-gradient(180deg, rgba(23,32,52,0.97), rgba(8,12,22,0.97))",
  logo: (
    <span className="party-glitch font-display text-lg font-black uppercase tracking-[0.2em] text-white">
      Imp<span style={{ color: RED }}>o</span>stor
    </span>
  ),
  quick: ["Sus 👀", "It's not me! 🙅", "Trust me 🤝", "That clue tho 🤨", "Gotcha! 🎯", "😂"],
};

export function ImpostorTable({ view, me, now, onClose, onMessage, onJoin, onRematch }: { view: ChallengeView; me: Me; now: number; onClose: () => void; onMessage: (text: string, good: boolean) => void; onJoin?: () => void; onRematch?: () => void }) {
  const ch = useChallengeChannel(view.id, me);
  const { players, mySeat, watching, playing, kinds } = useSeats(view, me, ch);
  const tooFew = players.length < IMP_MIN_PLAYERS;
  const game = usePartyGame(impostor, {
    seed: view.seed,
    kinds,
    watching,
    ch,
    live: playing && !tooFew,
    now,
    system: async (s) => {
      const r = await impostorReveal(view.id, s.round);
      return r.ok ? { reveal: r.imp, word: r.word } : null;
    },
    botMs: (s) => (s.phase === "recap" ? 7000 : 1300),
  });
  const s = game.state;
  const over = s.phase === "over";
  // Too few to play (the time ran out with two): a draw, stakes back.
  const winners = tooFew ? players.map((_, i) => i) : impostor.winners(s);
  useSettle(view, watching, playing ? winners : null, onMessage);

  // My secret for each round, from the server.
  const [words, setWords] = useState<(number | null)[] | null>(null);
  useEffect(() => {
    if (!playing || watching || tooFew || words) return;
    let on = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const get = async () => {
      const r = await impostorDeal(view.id).catch(() => null);
      if (!on) return;
      if (r?.ok) setWords(r.words);
      else t = setTimeout(() => void get(), 2500);
    };
    void get();
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [playing, watching, tooFew, words, view.id]);
  const mine = words ? words[s.round] : undefined;
  const iAmImp = mine === null;

  const name = (seat: number) => (seat === mySeat ? "You" : (players[seat]?.name ?? "Someone"));
  const board = BOARDS[s.board];
  const last = s.past[s.past.length - 1];
  const revealed = s.phase === "guess" || s.phase === "recap" ? { imp: s.imp ?? -1, word: s.word ?? -1 } : null;
  // The reveal plays for a few seconds after the server's answer.
  const showReveal = (s.phase === "reveal" && !tooFew) || (!!revealed && game.since < 4200 && (s.phase === "guess" || (s.phase === "recap" && last?.guess === null)));
  useEffect(() => {
    if (s.phase === "reveal") playSfx("tick");
    if (s.phase === "guess" || s.phase === "recap") playSfx(s.accused !== null && s.accused === s.imp ? "caught" : "thunder");
    if (s.phase === "clue" && s.clues.length === 0) playSfx("start");
  }, [s.phase, s.round, s.accused, s.imp, s.clues.length]);

  const [peek, setPeek] = useState(false);
  const standings = useMemo(() => players.map((p, i) => ({ p, points: s.scores[i] ?? 0 })).sort((a, b) => b.points - a.points), [players, s.scores]);
  const overTitle = tooFew ? "Not enough players" : !winners ? "" : winners.length === 1 ? `${name(winners[0])} ${winners[0] === mySeat ? "win" : "wins"}!` : "It's a draw!";

  return (
    <PartyShell
      view={view}
      me={me}
      now={now}
      ch={ch}
      theme={theme}
      title="Impostor"
      minPlayers={IMP_MIN_PLAYERS}
      needMore={`Impostor needs ${IMP_MIN_PLAYERS} players: anyone nearby can join. Fewer when the time's up, and the stakes come back`}
      over={over || (tooFew && playing)}
      standings={tooFew ? [] : standings}
      overTitle={overTitle}
      onClose={onClose}
      onMessage={onMessage}
      onJoin={onJoin}
      onRematch={onRematch}
    >
      {({ inCall, bubbles }) => (
        <>
          <div aria-hidden className="party-scan pointer-events-none absolute inset-0" />
          {/* Round and category. */}
          <div className="relative z-10 mx-auto mt-1 flex w-fit items-center gap-2 rounded-full bg-black/45 px-3 py-1 text-[11px] font-bold uppercase tracking-wider ring-1 ring-white/10">
            <span>
              Round {Math.min(s.rounds, s.round + 1)}/{s.rounds}
            </span>
            <span className="text-white/40">·</span>
            <span>
              {board.icon} {board.category}
            </span>
          </div>

          {/* The suspects. */}
          <div className="relative z-10 mt-2 flex justify-center gap-1.5 px-2 sm:gap-3">
            {players.map((p, seat) => {
              const active = game.turn === seat && !over;
              const voting = s.phase === "vote" && game.myTurn && seat !== mySeat;
              const clues = s.clues.filter((c) => c.seat === seat);
              const isImp = revealed && revealed.imp === seat && !showReveal;
              return (
                <button
                  key={p.id}
                  onClick={() => voting && (playSfx("pop"), game.move({ vote: seat }))}
                  disabled={!voting}
                  className={cn("relative flex w-[4.4rem] flex-col items-center rounded-2xl px-1 pb-1.5 pt-1 transition sm:w-24", voting && "bg-white/5 ring-1 ring-[#ef4444]/60 hover:bg-[#ef4444]/15 active:scale-95", isImp && "bg-[#ef4444]/20 ring-2 ring-[#ef4444]")}
                  aria-label={voting ? `Vote for ${p.name}` : p.name}
                >
                  <span className="relative">
                    <Bubble text={bubbles.get(p.id)} below />
                    <Seat p={p} size={40} active={active} left={game.left} total={impostor.secs(s)} talking={inCall.has(p.id)} bot={kinds[seat] === "bot"} winner={view.winner === p.id} accent={RED} />
                    {voting && <Crosshair className="absolute -right-1 -top-1 size-5 text-[#ef4444]" />}
                    {s.phase === "vote" && s.votes[seat] >= 0 && <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-[#12b886] text-[10px] font-black ring-2 ring-[#0b1220]">✓</span>}
                  </span>
                  <span className={cn("mt-0.5 w-full truncate rounded-full px-1 text-center text-[11px] font-bold", active ? "bg-white text-[#0b1220]" : "bg-black/40")}>{seat === mySeat ? "You" : p.name}</span>
                  <span className="mt-0.5 text-[10px] font-black tabular-nums text-[#fca5a5]">{s.scores[seat]} pts</span>
                  {isImp && <span className="mt-0.5 rounded bg-[#ef4444] px-1 text-[9px] font-black uppercase tracking-wider">Impostor</span>}
                  <span className="mt-1 flex w-full flex-col items-center gap-0.5">
                    {clues.map((c, i) => (
                      <span key={i} className="party-pop w-full truncate rounded-md bg-[#fef3c7] px-1 py-0.5 text-center text-[10px] font-bold text-[#1c1917] shadow">
                        {c.text}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden px-3 py-2">
            {/* Your secret. */}
            {!tooFew &&
              (watching ? (
                <p className="rounded-2xl bg-black/40 px-4 py-2 text-center text-sm text-white/75 ring-1 ring-white/10">👀 Watching: you don&apos;t know the word either. Who&apos;s faking it?</p>
              ) : (
                <button onClick={() => (playSfx("rustle"), setPeek((v) => !v))} className={cn("relative w-full max-w-sm overflow-hidden rounded-2xl px-4 py-2.5 text-left shadow-xl ring-1 transition active:scale-[0.98]", peek && iAmImp ? "bg-gradient-to-r from-[#7f1d1d] to-[#450a0a] ring-[#ef4444]" : "bg-gradient-to-r from-[#d6c7a1] to-[#b8a67a] text-[#1c1917] ring-black/20")}>
                  <span className="absolute right-3 top-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-70">{peek ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {peek ? "Hide" : "Tap to peek"}</span>
                  <span className="block text-[10px] font-black uppercase tracking-[0.25em] opacity-70">Top secret · round {s.round + 1}</span>
                  {!peek ? (
                    <span className="mt-0.5 block font-display text-xl font-black tracking-wide">█████████</span>
                  ) : words === null ? (
                    <span className="mt-1 flex items-center gap-2 text-sm font-semibold">
                      <LoaderCircle className="size-4 animate-spin" /> Opening the envelope…
                    </span>
                  ) : iAmImp ? (
                    <span className="block">
                      <span className="block font-display text-xl font-black uppercase tracking-wide text-white">🕵️ You&apos;re the impostor</span>
                      <span className="block text-xs text-white/75">Blend in. Work out the word from their clues.</span>
                    </span>
                  ) : (
                    <span className="block">
                      <span className="block text-xs font-semibold opacity-75">The word is</span>
                      <span className="block font-display text-2xl font-black uppercase tracking-wide">{board.words[mine ?? 0]}</span>
                    </span>
                  )}
                </button>
              ))}

            {/* The board. */}
            {!tooFew && (
              <div className="grid w-full max-w-sm grid-cols-4 gap-1.5">
                {board.words.map((w, i) => {
                  const secret = (peek && !watching && mine === i) || (revealed && !showReveal && s.phase === "recap" && revealed.word === i);
                  const guessed = s.guess === i && s.phase === "recap";
                  const canGuess = s.phase === "guess" && game.myTurn && !showReveal;
                  return (
                    <button
                      key={w}
                      onClick={() => canGuess && game.move({ guess: i })}
                      disabled={!canGuess}
                      className={cn(
                        "flex h-11 items-center justify-center rounded-xl px-1 text-center text-[11px] font-bold leading-tight shadow ring-1 transition sm:h-12 sm:text-xs",
                        secret ? "bg-[#facc15] text-[#1c1917] ring-[#facc15] shadow-[0_0_16px_rgba(250,204,21,0.6)]" : "bg-[#172034] text-white/90 ring-white/10",
                        guessed && (s.guess === s.word ? "!bg-[#12b886] !text-white" : "!bg-[#ef4444] !text-white"),
                        canGuess && "ring-2 ring-[#ef4444] hover:bg-[#ef4444]/30 active:scale-95",
                      )}
                    >
                      {w}
                    </button>
                  );
                })}
              </div>
            )}
            {tooFew && playing && <p className="rounded-2xl bg-black/40 px-4 py-3 text-center text-sm ring-1 ring-white/10">Impostor needs at least {IMP_MIN_PLAYERS} players. Everyone&apos;s stake comes back.</p>}
          </main>

          {!tooFew && <Controls s={s} me={mySeat} myTurn={game.myTurn} left={game.left} name={name} iAmImp={iAmImp} onMove={game.move} watching={watching} />}

          {showReveal && <Reveal s={s} name={name} />}
        </>
      )}
    </PartyShell>
  );
}

const was = (who: string) => (who === "You" ? "were" : "was");

function Reveal({ s, name }: { s: IState; name: (seat: number) => string }) {
  const counting = s.phase === "reveal";
  const caught = s.accused !== null && s.accused === s.imp;
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/75 p-6 text-center backdrop-blur-sm">
      <div className={cn("max-w-sm", counting && "party-shake")}>
        <p className="text-xs font-black uppercase tracking-[0.3em] text-white/60">The votes are in</p>
        <p className="mt-2 font-display text-2xl font-black">{s.accused === null ? "It's a tie! Nobody is voted out." : `The table points at ${name(s.accused) === "You" ? "you" : name(s.accused)}…`}</p>
        {counting ? (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-white/70">
            <LoaderCircle className="size-4 animate-spin" /> 🥁 And the impostor was…
          </p>
        ) : (
          <div className="party-pop mt-5">
            <p className="font-display text-4xl font-black uppercase" style={{ color: caught ? "#12b886" : RED, textShadow: `0 0 24px ${caught ? "#12b886" : RED}` }}>
              {caught ? "Caught!" : "Got away!"}
            </p>
            <p className="mt-1 text-lg font-bold">
              {s.imp !== null && (caught ? `${name(s.imp)} ${was(name(s.imp))} the impostor` : s.accused === null ? `The impostor was ${name(s.imp)}!` : `${name(s.accused)} ${was(name(s.accused))} innocent. It was ${name(s.imp)}!`)}
            </p>
            {caught && <p className="mt-1 text-sm text-white/70">One last chance: they guess the word to steal {IMP_POINTS.stole} points.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Controls({ s, me, myTurn, left, name, iAmImp, onMove, watching }: { s: IState; me: number; myTurn: boolean; left: number; name: (seat: number) => string; iAmImp: boolean; onMove: (m: IMove) => boolean; watching: boolean }) {
  const [text, setText] = useState("");
  const key = `${s.round}:${s.phase}:${s.clues.length}`;
  const [forKey, setForKey] = useState(key);
  if (forKey !== key) {
    setForKey(key);
    setText("");
  }
  const turn = impostor.turn(s);
  const timer = <span className={cn("tabular-nums", left < 6 && "text-[#ff6b6b]")}>{Math.ceil(left)}s</span>;
  const wrap = (children: React.ReactNode) => <section className="relative z-20 mx-auto w-full max-w-lg shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">{children}</section>;
  const note = (t: React.ReactNode) => wrap(<p className="mx-auto w-fit rounded-full bg-black/50 px-4 py-2 text-center text-sm font-semibold ring-1 ring-white/10">{t}</p>);

  if (s.phase === "over" || s.phase === "reveal") return wrap(null);
  if (s.phase === "clue") {
    if (myTurn) {
      const ok = text.trim().length > 0;
      return wrap(
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) onMove({ clue: text });
          }}
          className="space-y-1.5"
        >
          <p className="text-center text-xs font-semibold text-white/70">{iAmImp ? "Fake it: a clue that could fit any of the words." : "One word: close enough to show you know it, vague enough to fool the impostor."}</p>
          <div className="flex gap-2">
            <input autoFocus value={text} onChange={(e) => setText(e.target.value.slice(0, IMP_CLUE_MAX))} placeholder="Your clue" className="h-12 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-sm font-semibold outline-none ring-1 ring-white/20 placeholder:text-white/40 focus:ring-[#ef4444]" />
            <button type="submit" disabled={!ok} className="flex h-12 shrink-0 items-center gap-1.5 rounded-full bg-[#ef4444] px-5 text-sm font-black shadow-[0_4px_0_#7f1d1d] disabled:opacity-40">
              <Send className="size-4" /> Give clue
            </button>
          </div>
          <p className="text-center text-[11px] text-white/50">{timer} left</p>
        </form>,
      );
    }
    return note(
      <>
        {name(turn)} {turn === me ? "are" : "is"} thinking of a clue… {timer}
      </>,
    );
  }
  if (s.phase === "vote") {
    if (myTurn) return note(<>🎯 Tap the player you think is the impostor · {timer}</>);
    const voted = s.votes.filter((v) => v >= 0).length;
    return note(
      <>
        {watching ? "" : s.votes[me] >= 0 ? "Vote in. " : ""}
        {name(turn)} {turn === me ? "are" : "is"} voting ({voted}/{s.n}) {timer}
      </>,
    );
  }
  if (s.phase === "guess") {
    if (myTurn) return note(<>Caught! Tap the word you think it is to steal {IMP_POINTS.stole} points · {timer}</>);
    return note(
      <>
        {name(turn)} is guessing the word… {timer}
      </>,
    );
  }
  // The round's result.
  const r = s.past[s.past.length - 1];
  if (!r) return wrap(null);
  const board = BOARDS[r.board];
  const lines: string[] = [];
  if (r.accused !== r.imp) lines.push(`${name(r.imp)} got away: +${IMP_POINTS.escaped}`);
  else if (r.guess === r.word) lines.push(`${name(r.imp)} guessed the word: +${IMP_POINTS.stole}`);
  else lines.push(`${name(r.imp)} guessed ${r.guess === null ? "nothing" : board.words[r.guess]}: wrong`);
  const right = r.votes.map((v, i) => (i !== r.imp && v === r.imp ? i : -1)).filter((i) => i >= 0);
  if (right.length) lines.push(`${right.map(name).join(", ")} voted right: +${IMP_POINTS.caughtVote} each`);
  const lastRound = s.round + 1 >= s.rounds;
  return wrap(
    <div className="party-pop rounded-3xl bg-black/50 p-3 text-center ring-1 ring-white/10">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-white/60">The word was</p>
      <p className="font-display text-2xl font-black uppercase text-[#facc15]">{board.words[r.word]}</p>
      <ul className="mt-1 space-y-0.5 text-sm">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-white/55">Votes: {r.votes.map((v, i) => `${name(i)} → ${name(v)}`).join(" · ")}</p>
      {myTurn ? (
        <button onClick={() => onMove({ next: true })} className="mt-2 h-11 w-full rounded-full bg-[#ef4444] font-black shadow-[0_4px_0_#7f1d1d]">
          {lastRound ? "See who won" : "Next round"} · {timer}
        </button>
      ) : (
        <p className="mt-2 text-xs text-white/60">
          {lastRound ? "The winner in" : "Next round in"} {timer}
        </p>
      )}
    </div>,
  );
}
