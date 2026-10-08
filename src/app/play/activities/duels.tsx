"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Dice5, Hand, HandMetal, Scissors, Swords, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";
import { Sheet } from "../sheet";
import { playSfx } from "../sound";
import { randomId, useActivityRoom, type ActivityMsg, type ActivityPlayer, type DuelGame } from "./hub";
import { BigButton, Confetti, Face, GameHeader, PlayerList, RewardHint, RewardNote, useGameReward, type GameProps, rand } from "./ui";

// Duels between two people in the same place: Rock-Paper-Scissors (best of 3) and dice
// (higher total wins). Fair on both phones: each picks in secret and sends only a sealed
// fingerprint of the pick first; picks are opened once both are sealed, so nobody can wait
// and see. Dice come from both players' secret numbers together, so neither can load them.

// ---------------------------------------------------------------- the duel on screen right now

export type Duel = {
  cid: string;
  game: DuelGame;
  me: ActivityPlayer;
  them: ActivityPlayer;
  roundId: number | null;
  roomId: string;
  role: "challenger" | "challenged";
};

let current: Duel | null = null;
const duelListeners = new Set<() => void>();
const setDuel = (d: Duel | null) => {
  current = d;
  for (const l of duelListeners) l();
};
export const startDuel = (d: Duel) => setDuel(d);
export const endDuel = () => setDuel(null);
export function useCurrentDuel() {
  return useSyncExternalStore(
    (l) => {
      duelListeners.add(l);
      return () => duelListeners.delete(l);
    },
    () => current,
    () => null,
  );
}

const DUEL_NAME: Record<DuelGame, string> = { rps: "Rock-Paper-Scissors", dice: "a dice duel" };
const PICKS = [
  { id: "rock", label: "Rock", icon: HandMetal },
  { id: "paper", label: "Paper", icon: Hand },
  { id: "scissors", label: "Scissors", icon: Scissors },
] as const;
const BEATS: Record<string, string> = { rock: "scissors", paper: "rock", scissors: "paper" };

async function sha(text: string) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Older browsers without secure crypto: a simple (weaker) fingerprint.
  let h1 = 0x811c9dc5;
  let h2 = 0x1234567;
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ text.charCodeAt(i), 2246822507);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(h1).repeat(4) + hex(h2).repeat(4);
}

/** Two dice from both players' secrets (the same result on both phones). */
async function diceFor(cid: string, round: number, saltA: string, saltB: string, playerId: string): Promise<[number, number]> {
  const [lo, hi] = [saltA, saltB].sort();
  const h = await sha(`${cid}|${round}|${lo}|${hi}|${playerId}`);
  return [1 + (parseInt(h.slice(0, 8), 16) % 6), 1 + (parseInt(h.slice(8, 16), 16) % 6)];
}

const DIE_DOTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

export function Die({ n, rolling, size = 56 }: { n: number; rolling?: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn("drop-shadow", rolling && "act-shake")}
      style={rolling ? { animation: "act-spin .5s linear infinite" } : undefined}
      aria-label={rolling ? "Rolling" : `Rolled ${n}`}
    >
      <rect x="4" y="4" width="92" height="92" rx="18" fill="#fff" stroke="#dde3ea" strokeWidth="4" />
      {(DIE_DOTS[n] ?? DIE_DOTS[1]).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="9" fill={n === 1 ? "#e5484d" : "#18202b"} />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- picking someone to duel

/** The duel tab of the activity sheet: challenge someone here, or practise. */
export function DuelLobby({ game, ...props }: GameProps & { game: DuelGame }) {
  const room = useActivityRoom(props.roundId, props.roomId, props.me);
  const reward = useGameReward(game, !!props.me);
  const [practice, setPractice] = useState<{ mine: string | [number, number]; theirs: string | [number, number]; result: string } | null>(null);
  const others = props.members.filter((m) => m.id !== props.me?.id).map((m) => ({ id: m.id, name: m.name, avatar: m.avatar }));
  const Icon = game === "rps" ? Swords : Dice5;

  function challenge(p: ActivityPlayer) {
    if (!props.me) return;
    const cid = randomId(12);
    startDuel({ cid, game, me: props.me, them: p, roundId: props.roundId, roomId: props.roomId, role: "challenger" });
    room.send({ t: "challenge", cid, game, from: props.me, to: p.id });
    props.onClose();
  }

  function practise(pick?: string) {
    if (game === "rps" && pick) {
      const house = PICKS[Math.floor(rand() * 3)].id;
      const result = pick === house ? "A draw!" : BEATS[pick] === house ? "You win!" : "The house wins!";
      setPractice({ mine: pick, theirs: house, result });
      playSfx(result === "You win!" ? "found" : "pop");
    } else {
      const roll = (): [number, number] => [1 + Math.floor(rand() * 6), 1 + Math.floor(rand() * 6)];
      const a = roll();
      const b = roll();
      const result = a[0] + a[1] === b[0] + b[1] ? "A draw!" : a[0] + a[1] > b[0] + b[1] ? "You win!" : "The house wins!";
      setPractice({ mine: a, theirs: b, result });
      playSfx("toy");
    }
    // Practice counts as playing (for quests), never for coins.
    void reward.finish(0, false);
  }

  return (
    <div className="space-y-3">
      <GameHeader
        icon={Icon}
        title={game === "rps" ? "Rock-Paper-Scissors" : "Dice duel"}
        sub={game === "rps" ? "Best of 3 against someone here" : "Higher total wins"}
        onClose={props.onClose}
        color={game === "rps" ? "#e64980" : "#f5a524"}
      />
      <div>
        <p className="mb-2 text-sm font-semibold">Challenge someone in this place</p>
        {props.me ? (
          <PlayerList players={others} onPick={challenge} action="Challenge" empty="Nobody else is here right now. Practise against the house below!" />
        ) : (
          <p className="rounded-2xl bg-panel-2 p-3 text-sm text-muted">Sign in to challenge people.</p>
        )}
      </div>
      <div className="rounded-2xl border border-line p-3">
        <p className="mb-2 text-sm font-semibold">Practise against the house</p>
        {game === "rps" ? (
          <div className="grid grid-cols-3 gap-2">
            {PICKS.map((p) => (
              <button key={p.id} onClick={() => practise(p.id)} className="flex flex-col items-center gap-1 rounded-2xl bg-panel-2 py-3 font-semibold hover:bg-gold/20">
                <p.icon className="size-7" /> {p.label}
              </button>
            ))}
          </div>
        ) : (
          <BigButton tone="gold" onClick={() => practise()}>
            <Dice5 className="size-5" /> Roll
          </BigButton>
        )}
        {practice && (
          <div className="act-rise mt-3 flex items-center justify-around text-center text-sm">
            <div>
              <p className="text-muted">You</p>
              {typeof practice.mine === "string" ? <PickIcon pick={practice.mine} /> : <DicePair d={practice.mine} />}
            </div>
            <p className="font-display text-lg font-bold">{practice.result}</p>
            <div>
              <p className="text-muted">House</p>
              {typeof practice.theirs === "string" ? <PickIcon pick={practice.theirs} /> : <DicePair d={practice.theirs} />}
            </div>
          </div>
        )}
      </div>
      <RewardHint game={game} />
    </div>
  );
}

function PickIcon({ pick, big }: { pick: string; big?: boolean }) {
  const p = PICKS.find((x) => x.id === pick);
  if (!p) return null;
  return (
    <span className="inline-flex flex-col items-center">
      <p.icon className={big ? "size-12" : "size-8"} />
      <span className="text-xs font-semibold">{p.label}</span>
    </span>
  );
}

function DicePair({ d, rolling, size = 40 }: { d: [number, number]; rolling?: boolean; size?: number }) {
  return (
    <span className="inline-flex gap-1">
      <Die n={d[0]} rolling={rolling} size={size} />
      <Die n={d[1]} rolling={rolling} size={size} />
    </span>
  );
}

// ---------------------------------------------------------------- the duel itself

type Round = { mine?: string; salt?: string; myHash?: string; theirHash?: string; theirs?: string; theirSalt?: string; revealed?: boolean; done?: boolean };
type Played = { mine: string; theirs: string; result: "win" | "lose" | "tie"; myDice?: [number, number]; theirDice?: [number, number] };
type Phase = "asking" | "pick" | "wait" | "over" | "declined" | "gone" | "noanswer";

/** The duel pop-up (shown by the room layer for both players). */
export function DuelSheet({ duel }: { duel: Duel }) {
  const { cid, game, me, them } = duel;
  const [phase, setPhase] = useState<Phase>(duel.role === "challenger" ? "asking" : "pick");
  const [round, setRound] = useState(1);
  const [score, setScore] = useState({ me: 0, them: 0 });
  const [played, setPlayed] = useState<Played[]>([]);
  const [rolling, setRolling] = useState(false);
  const [cheat, setCheat] = useState(false);
  const rounds = useRef<Record<number, Round>>({});
  const phaseRef = useRef(phase);
  const scoreRef = useRef(score);
  const reward = useGameReward(game, true);
  useEffect(() => {
    phaseRef.current = phase;
    scoreRef.current = score;
  });

  const room = useActivityRoom(duel.roundId, duel.roomId, me, { onMessage: (m) => void onMessage(m) });
  const sendRef = useRef(room.send);
  useEffect(() => {
    sendRef.current = room.send;
  });
  const r = (n: number) => (rounds.current[n] ??= {});

  // The one challenged says yes as soon as this opens.
  useEffect(() => {
    if (duel.role !== "challenged") return;
    const id = window.setTimeout(() => sendRef.current({ t: "answer", cid, from: me.id, ok: true }), 50);
    return () => window.clearTimeout(id);
  }, [duel.role, cid, me.id]);

  // Nobody waits forever.
  useEffect(() => {
    if (phase !== "asking" && phase !== "wait") return;
    const id = window.setTimeout(() => setPhase(phase === "asking" ? "noanswer" : "gone"), phase === "asking" ? 30_000 : 45_000);
    return () => window.clearTimeout(id);
  }, [phase, round]);

  async function onMessage(m: ActivityMsg) {
    if (!("cid" in m) || m.cid !== cid || !("from" in m) || m.from !== them.id) return;
    if (m.t === "answer") {
      if (phaseRef.current === "asking") setPhase(m.ok ? "pick" : "declined");
    } else if (m.t === "commit" && Number.isInteger(m.round) && typeof m.hash === "string") {
      r(m.round).theirHash = m.hash;
      reveal(m.round);
    } else if (m.t === "reveal" && Number.isInteger(m.round) && typeof m.salt === "string" && typeof m.pick === "string") {
      const rd = r(m.round);
      if (!rd.theirHash || rd.theirs) return;
      const check = await sha(`${cid}|${m.round}|${them.id}|${m.pick}|${m.salt}`);
      if (check !== rd.theirHash) {
        setCheat(true);
        finish(true);
        return;
      }
      rd.theirs = m.pick;
      rd.theirSalt = m.salt;
      void resolve(m.round);
    } else if (m.t === "leave") {
      if (phaseRef.current !== "over") setPhase("gone");
    }
  }

  function reveal(n: number) {
    const rd = r(n);
    if (rd.myHash && rd.theirHash && !rd.revealed && rd.mine && rd.salt) {
      rd.revealed = true;
      sendRef.current({ t: "reveal", cid, from: me.id, round: n, salt: rd.salt, pick: rd.mine });
      void resolve(n);
    }
  }

  async function pick(choice: string) {
    if (phase !== "pick") return;
    const n = round;
    const rd = r(n);
    if (rd.mine) return;
    rd.mine = choice;
    rd.salt = randomId(16);
    rd.myHash = await sha(`${cid}|${n}|${me.id}|${choice}|${rd.salt}`);
    setPhase("wait");
    if (game === "dice") setRolling(true);
    sendRef.current({ t: "commit", cid, from: me.id, round: n, hash: rd.myHash });
    reveal(n);
  }

  async function resolve(n: number) {
    const rd = r(n);
    if (!rd.revealed || !rd.theirs || !rd.mine || rd.done) return;
    rd.done = true;
    let result: Played["result"];
    let entry: Played;
    if (game === "rps") {
      result = rd.mine === rd.theirs ? "tie" : BEATS[rd.mine] === rd.theirs ? "win" : "lose";
      entry = { mine: rd.mine, theirs: rd.theirs, result };
    } else {
      const myDice = await diceFor(cid, n, rd.salt!, rd.theirSalt!, me.id);
      const theirDice = await diceFor(cid, n, rd.salt!, rd.theirSalt!, them.id);
      const a = myDice[0] + myDice[1];
      const b = theirDice[0] + theirDice[1];
      result = a === b ? "tie" : a > b ? "win" : "lose";
      entry = { mine: "roll", theirs: "roll", result, myDice, theirDice };
      setRolling(false);
    }
    setPlayed((p) => [...p, entry]);
    const next = { me: scoreRef.current.me + (result === "win" ? 1 : 0), them: scoreRef.current.them + (result === "lose" ? 1 : 0) };
    scoreRef.current = next;
    setScore(next);
    playSfx(result === "win" ? "found" : result === "lose" ? "miss" : "tick");
    const target = game === "rps" ? 2 : 1;
    if (next.me >= target || next.them >= target) {
      window.setTimeout(() => finish(next.me >= target), 600);
    } else {
      window.setTimeout(() => {
        setRound(n + 1);
        setPhase("pick");
      }, 1400);
    }
  }

  const ended = useRef(false);
  function finish(won: boolean) {
    if (ended.current) return;
    ended.current = true;
    setPhase("over");
    void reward.finish(won ? 1 : 0, won);
    if (won) {
      const s = scoreRef.current;
      sendRef.current({
        t: "toast",
        icon: game === "rps" ? "trophy" : "dice",
        from: me.id,
        text: `${me.name} beat ${them.name} at ${game === "rps" ? `Rock-Paper-Scissors (${s.me}–${s.them})` : "dice"}!`,
      });
    }
  }

  function close() {
    if (phaseRef.current !== "over") sendRef.current({ t: "leave", cid, from: me.id });
    endDuel();
  }

  const won = phase === "over" && score.me > score.them;
  const last = played.at(-1);

  return (
    <Sheet onClose={close}>
      <div className="relative space-y-4">
        <GameHeader
          icon={game === "rps" ? Swords : Dice5}
          title={game === "rps" ? "Rock-Paper-Scissors" : "Dice duel"}
          sub={game === "rps" ? "First to 2 wins" : "Higher total wins"}
          onClose={close}
          color={game === "rps" ? "#e64980" : "#f5a524"}
        />
        <div className="flex items-center justify-around">
          <div className="flex flex-col items-center gap-1">
            <Face p={me} size={52} />
            <span className="text-sm font-semibold">You</span>
          </div>
          <span className="font-display text-3xl font-bold tabular-nums">
            {score.me}–{score.them}
          </span>
          <div className="flex flex-col items-center gap-1">
            <Face p={them} size={52} />
            <span className="max-w-24 truncate text-sm font-semibold">{them.name}</span>
          </div>
        </div>

        {last && (
          <div key={played.length} className="act-pop flex items-center justify-around rounded-2xl bg-panel-2 py-3">
            {game === "rps" ? <PickIcon pick={last.mine} big /> : <DicePair d={last.myDice!} size={44} />}
            <span
              className={cn(
                "rounded-full px-3 py-1 text-sm font-bold",
                last.result === "win" ? "bg-me text-white" : last.result === "lose" ? "bg-hit text-white" : "bg-white text-ink",
              )}
            >
              {last.result === "win" ? "You take it" : last.result === "lose" ? `${them.name} takes it` : "Draw, again!"}
            </span>
            {game === "rps" ? <PickIcon pick={last.theirs} big /> : <DicePair d={last.theirDice!} size={44} />}
          </div>
        )}

        {phase === "asking" && <p className="act-pulse text-center font-semibold">Waiting for {them.name} to accept…</p>}
        {phase === "noanswer" && <p className="text-center text-muted">{them.name} didn&apos;t answer. Maybe next time!</p>}
        {phase === "declined" && <p className="text-center text-muted">{them.name} said no thanks.</p>}
        {phase === "gone" && <p className="text-center text-muted">{them.name} walked away from the duel.</p>}
        {phase === "pick" &&
          (game === "rps" ? (
            <div>
              <p className="mb-2 text-center text-sm font-semibold">Round {round}: pick in secret</p>
              <div className="grid grid-cols-3 gap-2">
                {PICKS.map((p) => (
                  <button key={p.id} onClick={() => void pick(p.id)} className="flex flex-col items-center gap-1 rounded-2xl bg-panel-2 py-4 font-semibold hover:bg-gold/20 active:scale-95">
                    <p.icon className="size-9" /> {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <BigButton tone="gold" onClick={() => void pick("roll")}>
              <Dice5 className="size-5" /> Roll the dice
            </BigButton>
          ))}
        {phase === "wait" && (
          <div className="flex flex-col items-center gap-2">
            {game === "dice" && rolling && <DicePair d={[6, 6]} rolling size={48} />}
            <p className="act-pulse text-center font-semibold">Waiting for {them.name}…</p>
          </div>
        )}
        {phase === "over" && (
          <div className="act-rise space-y-2 text-center">
            {won && <Confetti />}
            <p className="flex items-center justify-center gap-2 font-display text-2xl font-bold">
              {won && <Trophy className="size-6 text-gold-dark" />}
              {cheat ? `${them.name}'s pick didn't add up. You win!` : won ? "You win!" : `${them.name} wins!`}
            </p>
            <RewardNote claim={reward.claim} />
            <BigButton onClick={close}>Done</BigButton>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** "Ada challenged you to Rock-Paper-Scissors": shown by the room layer. */
export function DuelInvite({
  from,
  game,
  onAccept,
  onDecline,
}: {
  from: ActivityPlayer;
  game: DuelGame;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="act-pop pointer-events-auto flex items-center gap-3 rounded-2xl bg-panel p-3 shadow-xl ring-2 ring-gold">
      <Face p={from} size={40} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">
          {from.name} challenged you to {DUEL_NAME[game]}!
        </p>
        <div className="mt-2 flex gap-2">
          <button onClick={onAccept} className="rounded-full bg-me px-4 py-1.5 font-semibold text-white">
            Accept
          </button>
          <button onClick={onDecline} className="rounded-full bg-panel-2 px-4 py-1.5 font-semibold">
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
