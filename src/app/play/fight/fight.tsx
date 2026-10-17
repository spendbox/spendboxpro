"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Crown, LoaderCircle, MessageCircle, Search, Send, Star, Swords, Trophy, Users, Wallet, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { cash, cashSymbol, fromShown, toShown } from "@/lib/world/value";
import {
  CHALLENGE_CATEGORIES,
  CHALLENGE_COOLDOWN_SECS,
  CHALLENGE_FEE_NAIRA,
  CHALLENGE_GAMES,
  JOIN_SECS,
  REP_MAX,
  REP_PER_HOSTED,
  REP_PER_WIN,
  STAKES_NAIRA,
  STAKE_MAX_NAIRA,
  STAKE_MIN_NAIRA,
  WINNER_SHARE,
  challengeGame,
  challengeRep,
  challengeRepGained,
  cleanStake,
  isTableGame,
  type TableGame,
  findGames,
  playersText,
  stakeBounds,
  type ChallengeCategory,
} from "@/lib/world/challenges";
import { MINIGAMES } from "../minigames/registry";
import { TurnTable, type Seat } from "../minigames/turn-table";
import { Confetti } from "../activities/ui";
import { playSfx } from "../sound";
import { Sheet } from "../sheet";
import { whileHere } from "../activity";
import { challengeQuote, declineChallenge, inviteChallenge, joinChallenge, leaveChallenge, myChallengeRep, openChallenge, reportWinner, type ChallengeQuote, type ChallengeView } from "./challenge-actions";
import { createClient } from "@/lib/supabase/client";
import dynamic from "next/dynamic";
import { GameInvite, InviteCard, type GameTarget } from "./whot-invite";

// The full-screen tables (docs/GAME_TABLES.md, docs/PARTY_GAMES.md), loaded when a game opens.
const WhotTable = dynamic(() => import("../games/whot-table").then((m) => m.WhotTable), { ssr: false });
const TruthDareTable = dynamic(() => import("../games/truth-dare-table").then((m) => m.TruthDareTable), { ssr: false });
const ImpostorTable = dynamic(() => import("../games/impostor-table").then((m) => m.ImpostorTable), { ssr: false });
const TABLES = { whot: WhotTable, truth_dare: TruthDareTable, impostor: ImpostorTable };
import { useChallengeChannel } from "./channel";
import { CallBar } from "../call/call-bar";

// Challenges on the map (docs/CHALLENGES.md). Challenge: pick a game and a stake, and everyone nearby
// is told; your light shines on the map. They have a minute to join, then the game floats over
// the map, the players' faces round it, with a chat (and a voice call). The winner takes the pool.

export type ChallengeLight = { id: number; x: number; z: number; colour: string; playing: boolean; endsAt: number | null };
type Me = { id: string; name: string; avatar: unknown };

const INTRO_KEY = "nt-fight-intro";
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.floor(s) % 60)).padStart(2, "0")}`;

/**
 * Everything about challenges: the Challenge picker (open), alerts for challenges nearby, and the one
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
  /** Invitations to you (game-db/110), a game you're watching, and who you're about to challenge. */
  const [invites, setInvites] = useState<ChallengeView[]>([]);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [inviting, setInviting] = useState<(GameTarget & { game: TableGame }) | null>(null);
  /** Challenges you closed (they don't open again by themselves). */
  const closedRef = useRef<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lightsRef = useRef(onLights);
  useEffect(() => {
    lightsRef.current = onLights;
  });

  // Challenges nearby (and the one you're in), every few seconds. (Where you are and who you
  // are come in fresh on every render: kept in refs, so the timers below aren't restarted by them.)
  const whereRef = useRef(where);
  const meRef = useRef(me);
  useEffect(() => {
    whereRef.current = where;
    meRef.current = me;
  });
  const signedIn = !!me;
  const look = useCallback(async () => {
    const at = whereRef.current();
    if (!at || !meRef.current) return;
    const r = await fetch(`/api/challenges?region=${encodeURIComponent(region)}&x=${Math.round(at.x)}&z=${Math.round(at.z)}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ list: ChallengeView[]; mine: number | null; invites?: ChallengeView[] }>) : null))
      .catch(() => null);
    if (!r) return;
    setList(r.list);
    setInvites((r as { invites?: ChallengeView[] }).invites ?? []);
    // The one you're in stays open until you close it (its result included); one you're in that
    // you haven't opened (after a reload) opens by itself, unless you closed it.
    setMine((m) => m ?? (r.mine !== null && !closedRef.current.includes(r.mine) ? r.mine : null));
  }, [region]);
  useEffect(() => {
    if (!signedIn) return;
    const first = setTimeout(() => void look(), 1200);
    // Every 6 s while the list is open, every 30 s on the map; nothing while they're away.
    const stop = whileHere(() => void look(), open ? 6000 : 30_000);
    return () => {
      clearTimeout(first);
      stop();
    };
  }, [signedIn, look, open]);
  // A knock from someone who just challenged you (a live nudge to look now; the invitation itself
  // comes from the server, so a knock can't be faked into anything).
  const meId = me?.id ?? null;
  useEffect(() => {
    if (!meId) return;
    const supabase = createClient();
    const channel = supabase.channel(`knock:${meId}`).on("broadcast", { event: "knock" }, () => {
      playSfx("chime");
      void look();
    });
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [meId, look]);
  const knock = (to: string) => {
    const supabase = createClient();
    const channel = supabase.channel(`knock:${to}`);
    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      void channel.send({ type: "broadcast", event: "knock", payload: { at: Date.now() } }).finally(() => setTimeout(() => void supabase.removeChannel(channel), 1500));
    });
  };
  // "Play Whot!" on someone's card.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<GameTarget & { game: string }>).detail;
      if (d?.id) setInviting({ id: d.id, name: d.name, avatar: d.avatar, game: isTableGame(d.game) ? d.game : "whot" });
    };
    window.addEventListener("nt-play-game", on);
    return () => window.removeEventListener("nt-play-game", on);
  }, []);
  /** Challenge one player (from their card, or a rematch): the table opens for you straight away. */
  const challengePlayer = async (target: string, game: string, stakeMint: number, at: { x: number; z: number }): Promise<string | null> => {
    const r = await inviteChallenge(target, game, stakeMint, at.x, at.z, region).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    if (!r.ok) return r.error;
    playSfx("start");
    knock(target);
    closedRef.current = closedRef.current.filter((x) => x !== r.id);
    setWatchId(null);
    setMine(r.id);
    void look();
    return null;
  };

  // The lights on the map: open ones only while their minute lasts (with the seconds left), and
  // games being played.
  const lightsKey = list.map((c) => `${c.id}:${c.status}:${c.startsAt}`).join("|");
  useEffect(() => {
    // Only sent on when which lights show changes (a new list each second would redraw the
    // whole game every second).
    let shown = "";
    const show = () => {
      const t = Date.now();
      const lights = list
        .filter((c) => c.status === "playing" || (c.status === "open" && Date.parse(c.startsAt) > t - 3000))
        .map((c) => ({ id: c.id, x: c.x, z: c.z, colour: challengeGame(c.game)?.colour ?? "#f08c00", playing: c.status === "playing", endsAt: c.status === "open" ? Date.parse(c.startsAt) : null }));
      const key = lights.map((l) => l.id).join(",");
      if (key === shown) return;
      shown = key;
      lightsRef.current(lights);
    };
    show();
    const t = setInterval(show, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightsKey]);

  // The one you're in (or watching), closely (starting it once its minute is up).
  const shownId = mine ?? watchId;
  useEffect(() => {
    if (shownId === null) return setView(null);
    let live = true;
    const get = async () => {
      const v = await fetch(`/api/challenges?id=${shownId}`, { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<{ view: ChallengeView | null }>) : null))
        .then((d) => d?.view ?? null)
        .catch(() => null);
      if (!live) return;
      setView(v);
      if (v && (v.status === "cancelled" || v.status === "done")) {
        // Over: no need to keep asking.
        clearInterval(t);
        void look();
      }
    };
    void get();
    const t = setInterval(get, 2500);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [shownId, look]);
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
    setWatchId(null);
    setMine(c.id);
    onFly?.(c.x, c.z);
  };
  const decline = async (c: ChallengeView) => {
    setBusy(true);
    const r = await declineChallenge(c.id).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusy(false);
    if (!r.ok) return onMessage(r.error, false);
    knock(c.host);
    setInvites((l) => l.filter((x) => x.id !== c.id));
  };
  // Table games being played nearby that you could watch (not yours, not dismissed).
  const watchable = list.filter((c) => c.status === "playing" && isTableGame(c.game) && c.id !== mine && !dismissed.includes(-c.id) && !c.players.some((p) => p.id === me?.id)).slice(0, 1);

  // Alerts: open challenges near you, not yours, still taking players.
  const alerts = list.filter((c) => c.status === "open" && c.id !== mine && !dismissed.includes(c.id) && Date.parse(c.startsAt) > now && !c.players.some((p) => p.id === me?.id) && c.invited?.id !== me?.id).slice(0, 2);
  // The full-screen table for the game shown, if it has one.
  const tableGame = view && isTableGame(view.game) ? view.game : null;
  const Table = tableGame ? TABLES[tableGame] : null;
  const myInvites = invites.filter((c) => c.id !== mine && !dismissed.includes(c.id) && Date.parse(c.startsAt) > now);

  return (
    <>
      {open && me && (
        <FightSheet
          region={region}
          onClose={onClose}
          onGo={async (game, stake) => {
            const at = where();
            if (!at) return { error: "Find a home or walk somewhere on the map first." };
            const r = await openChallenge(game, stake, at.x, at.z, region).catch(() => ({ ok: false as const, error: "The connection blinked. Try again.", busyId: undefined }));
            // Errors show in the Challenge card itself (not behind it).
            if (!r.ok) return { error: r.error, busyId: "busyId" in r ? r.busyId : undefined };
            playSfx("start");
            onClose();
            setMine(r.id);
            onMessage(r.fee > 0 ? `Challenge on! ${cash(r.fee)} fee paid. Everyone nearby has a minute to join.` : "Challenge on! Everyone nearby has a minute to join.", true);
            void look();
            return null;
          }}
          onOpenMine={(id) => {
            onClose();
            closedRef.current = closedRef.current.filter((x) => x !== id);
            setMine(id);
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
                    {c.invited ? `${host?.name ?? "Someone"} vs ${c.invited.name}: ${g?.title}! Hop in` : `${host?.name ?? "Someone"} challenged everyone to ${g?.title}!`}
                  </p>
                  <p className="text-xs text-white/70">
                    Pool {cash(c.pool)} · {c.players.length}/{c.seats} · <b className="tabular-nums text-gold">{mmss(left)}</b>
                  </p>
                </div>
                <button disabled={busy} onClick={() => void join(c)} className="shrink-0 rounded-full bg-gold px-3 py-2 text-xs font-bold text-ink disabled:opacity-50">
                  {c.stake > 0 ? `Join ${cash(c.stake)}` : "Join"}
                </button>
                <button onClick={() => setDismissed((d) => [...d, c.id])} className="grid size-7 shrink-0 place-items-center rounded-full text-white/60" aria-label="Not this one">
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {!view && (myInvites.length > 0 || watchable.length > 0) && (
        <div className="pointer-events-none fixed inset-x-0 top-28 z-[45] flex flex-col items-center gap-2 px-3">
          {myInvites.slice(0, 2).map((c) => (
            <InviteCard
              key={c.id}
              game={c.game}
              host={c.players[0] ?? { id: c.host, name: "Someone", avatar: null }}
              stake={c.stake}
              pool={c.pool}
              secsLeft={(Date.parse(c.startsAt) - now) / 1000}
              busy={busy}
              onAccept={() => void join(c)}
              onDecline={() => void decline(c)}
            />
          ))}
          {watchable.map((c) => (
            <div key={c.id} className="toast-in pointer-events-auto flex items-center gap-2 rounded-full bg-[#0a4127] py-1.5 pl-3 pr-1.5 text-sm text-white shadow-xl ring-1 ring-[#ffd43b]/60">
              <span className="truncate">
                {challengeGame(c.game)?.icon} {c.players.map((p) => p.name).join(" vs ")} are playing {challengeGame(c.game)?.title}
              </span>
              <button onClick={() => (setDismissed((d) => [...d, -c.id]), setWatchId(c.id))} className="shrink-0 rounded-full bg-[#ffd43b] px-3 py-1 text-xs font-bold text-ink">
                Watch
              </button>
              <button onClick={() => setDismissed((d) => [...d, -c.id])} className="grid size-7 shrink-0 place-items-center rounded-full text-white/60" aria-label="Not now">
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {inviting && me && (
        <GameInvite
          region={region}
          target={inviting}
          game={inviting.game}
          onGame={(game) => setInviting((t) => (t ? { ...t, game } : t))}
          onClose={() => setInviting(null)}
          onSend={async (stake) => {
            const at = where();
            if (!at) return "Find a home or walk somewhere on the map first.";
            const e = await challengePlayer(inviting.id, inviting.game, stake, at);
            if (!e) setInviting(null);
            return e;
          }}
        />
      )}
      {view && me && Table && (
        <Table
          key={view.id}
          view={view}
          me={me}
          now={now}
          onMessage={onMessage}
          onClose={() => {
            closedRef.current = [...closedRef.current, view.id];
            setMine(null);
            setWatchId(null);
            setView(null);
            void look();
          }}
          onJoin={() => void join(view)}
          onRematch={() => {
            const other = view.players.find((p) => p.id !== me.id);
            if (!other) return;
            void challengePlayer(other.id, view.game, view.stake, { x: view.x, z: view.z }).then((e) => e && onMessage(e, false));
          }}
        />
      )}
      {view && me && !isTableGame(view.game) && (mine !== null) && <Arena
          key={view.id}
          view={view}
          me={me}
          now={now}
          onClose={() => {
            closedRef.current = [...closedRef.current, view.id];
            setMine(null);
            setView(null);
            void look();
          }}
          onMessage={onMessage}
        />}
    </>
  );
}

/** Mint shown in the player's currency, as the number to type (whole for big amounts). */
const typedOf = (mint: number) => {
  const v = toShown(mint);
  return String(v >= 100 ? Math.round(v) : Math.round(v * 100) / 100);
};
/** What was typed (in the player's currency), in mint to the cent; null when it isn't a number. */
const asMint = (raw: string) => {
  const t = raw.replace(/[,\s]/g, "");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? Math.round(fromShown(v) * 100) / 100 : null;
};

type Shelf = ChallengeCategory | "all" | "soon";

/** Challenge: what it is (the first time), the games, the stake, and go. */
function FightSheet({
  region,
  onClose,
  onGo,
  onOpenMine,
}: {
  region: string;
  onClose: () => void;
  onGo: (game: string, stakeMint: number) => Promise<{ error: string; busyId?: number } | null>;
  /** Go back to the challenge you're still in. */
  onOpenMine: (id: number) => void;
}) {
  const [problem, setProblem] = useState<{ error: string; busyId?: number } | null>(null);
  const [leavingOld, setLeavingOld] = useState(false);
  const [intro, setIntro] = useState(() => {
    try {
      return !localStorage.getItem(INTRO_KEY);
    } catch {
      return true;
    }
  });
  const [game, setGame] = useState("whot");
  const [query, setQuery] = useState("");
  const [shelf, setShelf] = useState<Shelf>("all");
  // The stake: a quick pick (naira), or what was typed (in the player's currency).
  const [chip, setChip] = useState<number | null>(STAKES_NAIRA[0]);
  const [raw, setRaw] = useState("");
  const [quote, setQuote] = useState<ChallengeQuote | null>(null);
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
  const shown = useMemo(() => findGames(query, shelf), [query, shelf]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: CHALLENGE_GAMES.length, soon: CHALLENGE_GAMES.filter((g) => !g.engine).length };
    for (const g of CHALLENGE_GAMES) c[g.category] = (c[g.category] ?? 0) + 1;
    return c;
  }, []);

  if (intro)
    return (
      <Sheet onClose={onClose} title="Challenge people nearby">
        <div className="space-y-2.5 text-sm">
          <Point icon="🎲" text="Pick a game and a stake. Everyone nearby gets told, and your light shines on the map." />
          <Point icon="⏱️" text="They have one minute to join. Everyone puts the same stake into the pool." />
          <Point icon="🏆" text={`The winner takes the pool (${Math.round(WINNER_SHARE * 100)}% of it).`} />
          <Point icon="⭐" text={`Reputation: +${REP_PER_WIN} for every win, +${REP_PER_HOSTED} for every challenge you host that's played to a winner (up to ${REP_MAX} from challenges).`} />
          <Point icon="🎟️" text={`Your first challenge is free. Another one within ${CHALLENGE_COOLDOWN_SECS / 60} minutes costs ${cash(CHALLENGE_FEE_NAIRA / (quote?.perMint ?? 1_500))}, so in between, join other people's challenges.`} />
        </div>
        <button
          onClick={() => {
            try {
              localStorage.setItem(INTRO_KEY, "1");
            } catch {}
            setIntro(false);
          }}
          className="mt-4 h-12 w-full rounded-full bg-gradient-to-r from-[#e03131] to-[#f08c00] font-bold text-white shadow-lg"
        >
          Got it, let&apos;s play
        </button>
      </Sheet>
    );

  const g = challengeGame(game);
  const perMint = quote?.perMint ?? 1_500;
  const stake = chip !== null ? Math.round((chip / perMint) * 100) / 100 : asMint(raw);
  const fee = free ? 0 : (quote?.feeMint ?? 0);
  const need = (stake ?? 0) + fee;
  const canSpend = quote?.canSpend ?? null;
  const tooSmall = stake !== null && stake !== 0 && stake < stakeBounds(perMint).min;
  const tooBig = stake !== null && stake > stakeBounds(perMint).max;
  const stakeOk = stake !== null && cleanStake(stake, perMint) !== null;
  const short = stakeOk && canSpend !== null && need > canSpend + 0.001;
  const stakeNote =
    stake === null
      ? "Type how much each player puts in, or pick one above."
      : tooSmall
        ? `The smallest stake is ${cash(STAKE_MIN_NAIRA / perMint)}.`
        : tooBig
          ? `The biggest stake is ${cash(STAKE_MAX_NAIRA / perMint, { full: true })}.`
          : short
            ? `Not enough: you need ${cash(need)}${fee ? " with the fee" : ""}.`
            : null;
  const rep = quote?.rep ? challengeRep(quote.rep.hosted, quote.rep.won) : null;

  return (
    <Sheet onClose={onClose} title="Challenge" wide>
      {/* What's in it for you: money and reputation, up front. */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#e03131] via-[#f08c00] to-[#fab005] p-3.5 text-white shadow-lg">
        <span className="pointer-events-none absolute -right-3 -top-4 text-7xl opacity-25">🏆</span>
        <p className="font-display text-lg font-extrabold leading-tight">Throw down a challenge</p>
        <p className="mt-0.5 text-xs text-white/85">Everyone nearby has a minute to join. Winner takes {Math.round(WINNER_SHARE * 100)}% of the pool.</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-bold">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1">
            <Trophy className="size-3.5" /> +{REP_PER_WIN} reputation a win
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1">
            <Star className="size-3.5" /> +{REP_PER_HOSTED} for hosting a game that&apos;s played
          </span>
        </div>
        {rep !== null && (
          <div className="mt-2.5">
            <div className="flex justify-between text-[10px] font-semibold text-white/85">
              <span>Your reputation from challenges</span>
              <span className="tabular-nums">
                {rep} / {REP_MAX}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, (rep / REP_MAX) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* The games: search and shelves, so it works with hundreds of them. */}
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Pick a game</p>
      <label className="mt-2 flex h-11 items-center gap-2 rounded-full bg-ink/5 px-3.5 focus-within:ring-2 focus-within:ring-ink/20">
        <Search className="size-4 shrink-0 text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value.slice(0, 40))} placeholder="Search games" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" enterKeyHint="search" />
        {query && (
          <button onClick={() => setQuery("")} className="grid size-6 shrink-0 place-items-center rounded-full bg-ink/10" aria-label="Clear the search">
            <X className="size-3.5" />
          </button>
        )}
      </label>
      <div className="-mx-5 mt-2 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {([{ id: "all", label: "All", icon: "🎮" }, ...CHALLENGE_CATEGORIES, { id: "soon", label: "Coming soon", icon: "⏳" }] as { id: Shelf; label: string; icon: string }[]).map((s) => (
          <button
            key={s.id}
            onClick={() => setShelf(s.id)}
            className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition", shelf === s.id ? "bg-ink text-white shadow" : "bg-ink/5 text-ink")}
          >
            <span>{s.icon}</span>
            {s.label}
            <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", shelf === s.id ? "bg-white/20" : "bg-ink/10")}>{counts[s.id] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="-mx-1 mt-1.5 max-h-[18.5rem] overflow-y-auto px-1 py-1">
        {shown.length === 0 ? (
          <p className="rounded-2xl bg-ink/5 px-3 py-6 text-center text-sm text-muted">No game matches &ldquo;{query}&rdquo;. Try another word.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {shown.map((c) => {
              const soon = !c.engine;
              const on = c.id === game;
              return (
                <button
                  key={c.id}
                  onClick={() => setGame(c.id)}
                  aria-pressed={on}
                  className={cn("relative flex min-h-[6.5rem] flex-col items-start overflow-hidden rounded-2xl p-2 text-left text-white transition active:scale-95", on ? "ring-4 ring-gold" : "ring-1 ring-black/10", soon && !on && "opacity-70 saturate-50")}
                  style={{ background: `linear-gradient(150deg, ${c.colour} 0%, ${c.colour} 35%, #101418 120%)` }}
                >
                  <span className="pointer-events-none absolute -bottom-3 -right-2 text-5xl opacity-20">{c.icon}</span>
                  <span className="text-[1.7rem] leading-none drop-shadow">{c.icon}</span>
                  <b className="mt-auto line-clamp-2 pt-1 text-[12px] leading-tight">{c.title}</b>
                  <span className="flex items-center gap-0.5 text-[10px] text-white/75">
                    <Users className="size-3" /> {c.seats > 2 ? `2-${c.seats}` : "2"}
                  </span>
                  {soon && <span className="absolute right-1.5 top-1.5 rounded-full bg-black/35 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">Soon</span>}
                  {on && !soon && <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-gold text-[11px] font-black text-ink">✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {g && (
        <div className="mt-2 flex items-start gap-2.5 rounded-2xl bg-ink/5 p-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl text-xl" style={{ background: `${g.colour}22` }}>
            {g.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              {g.title} <span className="font-normal text-muted">· {playersText(g)}</span>
            </p>
            <p className="text-xs text-muted">{g.blurb}</p>
            {!g.engine && <p className="mt-1 text-xs font-semibold text-[#e8590c]">Coming soon. Pick one without the Soon badge to play now.</p>}
          </div>
        </div>
      )}

      {/* The stake: a quick pick or any amount. */}
      <div className="mt-4 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Stake (each player)</p>
        {canSpend !== null && (
          <p className="flex items-center gap-1 text-xs text-muted">
            <Wallet className="size-3.5" /> You have <b className="text-ink">{cash(canSpend)}</b>
          </p>
        )}
      </div>
      {/* Roomy: "No stake" across the top, the amounts two a row below. */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {STAKES_NAIRA.map((s) => {
          const mint = s / perMint;
          const cant = canSpend !== null && Math.round(mint * 100) / 100 + fee > canSpend + 0.001;
          return (
            <button
              key={s}
              onClick={() => setChip(s)}
              className={cn("h-12 min-w-0 rounded-2xl px-3 text-base font-bold tabular-nums transition", s === 0 && "col-span-2", chip === s ? "bg-ink text-white shadow" : "bg-ink/5", cant && chip !== s && "text-muted line-through decoration-1")}
            >
              {s === 0 ? "No stake" : cash(mint)}
            </button>
          );
        })}
      </div>
      <label className={cn("mt-2 flex h-12 items-center gap-2 rounded-2xl px-4 transition", chip === null ? "bg-panel ring-2 ring-ink" : "bg-ink/5")}>
        <span className="font-display text-xl font-extrabold text-muted">{cashSymbol()}</span>
        <input
          value={chip !== null ? Number(typedOf(chip / perMint)).toLocaleString("en-GB") : raw}
          onFocus={(e) => {
            if (chip !== null) {
              setRaw(typedOf(chip / perMint));
              setChip(null);
            }
            const el = e.currentTarget;
            requestAnimationFrame(() => el.select());
          }}
          onChange={(e) => {
            setChip(null);
            setRaw(e.target.value.replace(/[^\d.,\s]/g, "").slice(0, 14));
          }}
          inputMode="decimal"
          placeholder="Any amount"
          aria-label="Stake for each player"
          className="h-full min-w-0 flex-1 bg-transparent font-display text-xl font-extrabold tabular-nums outline-none"
        />
        {chip !== null && <span className="shrink-0 text-[11px] font-semibold text-muted">or type any amount</span>}
      </label>
      <p className={cn("mt-1.5 text-xs", stakeNote ? "font-semibold text-hit" : "text-muted")}>
        {stakeNote ??
          (stake === 0
            ? "Just for fun: nobody puts money in. Pick an amount to play for a pool."
            : g?.engine
            ? `Winner takes up to ${cash((stake ?? 0) * g.seats * WINNER_SHARE)} with ${g.seats} players. From ${cash(STAKE_MIN_NAIRA / perMint)} to ${cash(STAKE_MAX_NAIRA / perMint)}.`
            : `From ${cash(STAKE_MIN_NAIRA / perMint)} to ${cash(STAKE_MAX_NAIRA / perMint)} each.`)}
      </p>

      <p className="mt-3 rounded-2xl bg-gold/15 px-3 py-2 text-xs">
        {free ? (
          <>
            <b>This challenge is free.</b> Only your stake goes into the pool.
          </>
        ) : (
          <>
            <b>{cash(fee)} fee</b> for challenging again so soon. Free again in <b className="tabular-nums">{mmss(left)}</b>: join someone else&apos;s meanwhile.
          </>
        )}
      </p>

      {/* Always in reach, however long the list. */}
      <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 mt-3 bg-panel/95 px-5 pb-5 pt-2 backdrop-blur">
        <button
          disabled={going || !g?.engine || !stakeOk || short}
          onClick={async () => {
            if (stake === null) return;
            setGoing(true);
            setProblem(null);
            const p = await onGo(game, stake);
            setGoing(false);
            if (p) setProblem(p);
          }}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#e03131] to-[#f08c00] px-4 font-bold text-white shadow-lg transition active:scale-[0.98] disabled:from-ink/30 disabled:to-ink/30 disabled:shadow-none"
        >
          {going ? <LoaderCircle className="size-5 animate-spin" /> : <Swords className="size-5" />}
          <span className="truncate">{!g?.engine ? `${g?.title ?? "That game"} is coming soon` : stakeOk ? (stake === 0 ? "Challenge everyone, for fun" : `Challenge everyone · ${cash(stake!)}`) : "Challenge everyone nearby"}</span>
        </button>
        {problem && (
          <div className="mt-3 rounded-2xl bg-hit/10 p-3 text-sm">
            <p className="font-semibold text-hit">{problem.error}</p>
            {problem.busyId !== undefined && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={() => onOpenMine(problem.busyId!)} className="h-10 rounded-full bg-ink/5 text-xs font-semibold">
                  Open it
                </button>
                <button
                  disabled={leavingOld}
                  onClick={async () => {
                    setLeavingOld(true);
                    const r = await leaveChallenge(problem.busyId!).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
                    setLeavingOld(false);
                    if (!r.ok) return setProblem({ error: r.error, busyId: problem.busyId });
                    setProblem(null);
                  }}
                  className="h-10 rounded-full bg-hit text-xs font-semibold text-white disabled:opacity-50"
                >
                  {leavingOld ? "Leaving…" : "Leave it"}
                </button>
              </div>
            )}
            {problem.busyId !== undefined && <p className="mt-2 text-[11px] text-muted">Leaving before it starts gives your stake back; leaving a game being played gives it up.</p>}
          </div>
        )}
      </div>
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
  /** How the game ended as this phone saw it (who won, or a draw), sent until the server settles it. */
  const [claim, setClaim] = useState<{ winner: string | null; draw: boolean } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const left = (Date.parse(view.startsAt) - now) / 1000;
  const isHost = view.host === me.id;
  const def = useMemo(() => MINIGAMES.find((m) => m.engine === g?.engine && m.kind === "turns") ?? null, [g?.engine]);
  // Who's still here. Someone gone for 40 seconds (closed the game, lost their connection) is
  // played by the computer from then on, on every phone the same way, so the game never freezes.
  const lastHere = useRef(new Map<string, number>());
  const hereNow = useRef<string[]>([]);
  useEffect(() => {
    hereNow.current = ch.here;
  });
  const [gone, setGone] = useState<string[]>([]);
  const playing = view.status === "playing";
  const playerIds = view.players.map((p) => p.id).join(",");
  useEffect(() => {
    if (!playing) return;
    const ids = playerIds.split(",");
    const start = Date.now();
    for (const id of ids) if (!lastHere.current.has(id)) lastHere.current.set(id, start);
    const check = setInterval(() => {
      const t = Date.now();
      // Everyone still on the channel counts as seen just now.
      for (const id of hereNow.current) lastHere.current.set(id, t);
      const away = ids.filter((id) => id !== me.id && t - (lastHere.current.get(id) ?? t) > 40_000);
      if (away.length) setGone((g) => (away.every((id) => g.includes(id)) ? g : [...new Set([...g, ...away])]));
    }, 5000);
    return () => clearInterval(check);
  }, [playing, playerIds, me.id]);
  const seats: Seat[] = useMemo(
    () =>
      view.players.map((p) => ({
        kind: p.id === me.id ? "me" : gone.includes(p.id) ? "bot" : "remote",
        name: p.id === me.id ? "You" : gone.includes(p.id) ? `${p.name} (left)` : p.name,
      })),
    [view.players, me.id, gone],
  );
  // The result, sent now and again every few seconds until it's settled (the other phones may be
  // a move behind, or gone).
  useEffect(() => {
    if (!claim || view.status !== "playing") return;
    let live = true;
    const send = () =>
      void reportWinner(view.id, claim.winner, claim.draw).then((res) => {
        if (live && !res.ok) onMessage(res.error, false);
      });
    send();
    const t = setInterval(send, 6000);
    return () => {
      live = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim, view.status, view.id]);
  /** Giving up: with one other player, they win now; with more, the computer plays your seat. */
  const leaveGame = async () => {
    const r = await leaveChallenge(view.id).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    if (!r.ok) return onMessage(r.error, false);
    onMessage(view.status === "open" ? (isHost ? "Challenge called off. Stakes are back." : "You left. Your stake is back.") : "You left the game.", true);
    onClose();
  };
  const lastSeen = useRef(0);
  useEffect(() => {
    if (ch.chat.length > lastSeen.current && !chatOpen) playSfx("tick");
    lastSeen.current = ch.chat.length;
  }, [ch.chat.length, chatOpen]);
  // A beep each second while it looks for players (higher in the last five).
  const secsLeft = Math.ceil(left);
  useEffect(() => {
    if (view.status !== "open" || secsLeft < 0 || secsLeft > JOIN_SECS) return;
    playSfx(secsLeft <= 5 ? "chime" : "tick");
  }, [secsLeft, view.status]);
  // It changed: started (a big "Game on!"), or called off.
  const [gameOn, setGameOn] = useState(false);
  const was = useRef(view.status);
  useEffect(() => {
    const before = was.current;
    was.current = view.status;
    if (before === "open" && view.status === "playing") {
      playSfx("start");
      setGameOn(true);
      const t = setTimeout(() => setGameOn(false), 1800);
      return () => clearTimeout(t);
    }
    if (before === "open" && view.status === "cancelled") {
      playSfx("miss");
      onMessage("The game didn't start: not enough players joined. Your stake is back.", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.status]);
  const iWon = view.status === "done" && view.winner === me.id;
  const winnerName = view.players.find((p) => p.id === view.winner)?.name;
  // What this game added to your reputation (asked once it's settled; less near the cap).
  const nominalRep = (iWon ? REP_PER_WIN : 0) + (isHost ? REP_PER_HOSTED : 0);
  const [repNow, setRepNow] = useState<{ hosted: number; won: number } | null>(null);
  const done = view.status === "done";
  useEffect(() => {
    if (!done) return;
    let live = true;
    void myChallengeRep()
      .then((r) => live && setRepNow(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [done]);
  const repGained = repNow ? challengeRepGained(repNow.hosted, repNow.won, isHost, iWon) : nominalRep;
  const repFull = !!repNow && challengeRep(repNow.hosted, repNow.won) >= REP_MAX;

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
            {(view.status === "cancelled" || view.status === "done" || (view.status === "playing" && claim)) && (
              <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-ink/5" aria-label="Close">
                <X className="size-4" />
              </button>
            )}
          </div>

          {view.status === "open" && (
            <div className="flex flex-col items-center py-6 text-center">
              <Radar colour={g?.colour ?? "#f08c00"}>
                <Countdown secs={left} total={JOIN_SECS} colour={g?.colour ?? "#f08c00"} />
              </Radar>
              {/* Always clear: is it going to start, and when. */}
              <p className={cn("mt-3 rounded-full px-3 py-1 text-sm font-bold", left <= 0 ? "bg-gold text-ink" : view.players.length >= 2 ? "bg-[#2f9e44] text-white" : "bg-ink/5")}>
                {left <= 0
                  ? view.players.length >= 2
                    ? "Starting now…"
                    : "Checking for players…"
                  : view.players.length >= 2
                    ? `Game ON: starts in ${Math.ceil(left)}s with ${view.players.length} players`
                    : `Not started yet: needs 1 more player in ${Math.ceil(left)}s`}
              </p>
              <p className="mt-2 inline-flex flex-wrap items-center justify-center gap-1 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5">
                  <Trophy className="size-3" /> Win: +{REP_PER_WIN} reputation
                </span>
                {isHost && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5">
                    <Star className="size-3" /> +{REP_PER_HOSTED} for hosting once it&apos;s played
                  </span>
                )}
              </p>
              <p className="mt-1.5 text-xs text-muted">
                {isHost
                  ? "Everyone nearby can see your light on the map. If nobody joins, the game doesn't start and your stake comes back."
                  : `You're in! It starts when the countdown ends${view.players.length < 2 ? ", as long as someone else joins too" : ""}. If it doesn't start, your stake comes back.`}
              </p>
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
                  if (claim) return;
                  const seats = r.seats ?? [];
                  // One winner: them. Several (a tie) or none: a draw, stakes back.
                  const winner = seats.length === 1 ? (view.players[seats[0]]?.id ?? null) : null;
                  setClaim(winner ? { winner, draw: false } : { winner: null, draw: true });
                }}
              />
            </div>
          )}

          {view.status === "done" && (
            <div className="relative flex flex-col items-center py-6 text-center">
              {iWon && <Confetti />}
              <Trophy className={cn("size-12", iWon ? "text-gold" : "text-muted")} />
              <p className="mt-2 font-display text-2xl font-extrabold">{iWon ? "You won!" : `${winnerName ?? "Someone"} won`}</p>
              <p className="mt-1 text-sm text-muted">{iWon ? `${cash(view.prize ?? 0)} is yours.` : "Better luck next time."}</p>
              {repGained > 0 ? (
                <div className="start-pop mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#f08c00] to-[#fab005] px-4 py-1.5 text-sm font-extrabold text-ink shadow">
                  <Star className="size-4 fill-current" /> +{repGained} reputation
                </div>
              ) : null}
              <p className="mt-1.5 text-xs text-muted">
                {repGained > 0
                  ? [iWon && `+${REP_PER_WIN} for the win`, isHost && `+${REP_PER_HOSTED} for hosting`].filter(Boolean).join(", ") + (repGained < nominalRep ? ` (challenges give up to ${REP_MAX} in all)` : "") + "."
                  : repFull && nominalRep > 0
                    ? `Your reputation from challenges is already full (${REP_MAX}).`
                    : `Win one for +${REP_PER_WIN} reputation, or host one for +${REP_PER_HOSTED}.`}
              </p>
            </div>
          )}
          {view.status === "playing" && claim && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted">
              <LoaderCircle className="size-3.5 animate-spin" /> Game over. Settling the pool…
            </p>
          )}
          {view.status === "cancelled" && (
            <div className="py-6 text-center">
              <p className="font-semibold">{view.started ? "It's a draw (or the game wasn't finished)." : "The game didn't start: not enough players joined."}</p>
              <p className="mt-1 text-sm text-muted">Everyone&apos;s stake is back. Try again, or join someone else&apos;s.</p>
            </div>
          )}
          {/* Over: one clear way back to the map. */}
          {(view.status === "done" || view.status === "cancelled") && (
            <button onClick={onClose} className="mt-1 h-12 w-full rounded-full bg-ink font-bold text-white">
              Back to the map
            </button>
          )}
          {/* Waiting, or mid-game: leave (asks first). */}
          {(view.status === "open" || (view.status === "playing" && !claim)) && (
            <button onClick={() => setLeaving(true)} className="mt-2 w-full text-center text-xs font-semibold text-muted underline">
              {view.status === "open" ? (isHost ? "Call it off" : "Leave (stake back)") : "Leave the game"}
            </button>
          )}
          {view.status === "playing" && claim && (
            <button onClick={onClose} className="mt-2 h-11 w-full rounded-full bg-ink/5 text-sm font-semibold">
              Back to the map (the result still counts)
            </button>
          )}
          {leaving && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-panel/95 p-5 text-center">
              <div>
                <p className="font-display text-xl font-extrabold">{view.status === "open" ? (isHost ? "Call off the challenge?" : "Leave the challenge?") : "Leave the game?"}</p>
                <p className="mt-1 text-sm text-muted">
                  {view.status === "open"
                    ? isHost
                      ? "Everyone gets their stake back."
                      : "Your stake comes back."
                    : view.players.length === 2
                      ? "The other player wins the pool."
                      : "You lose your stake, and the computer plays your seat for the others."}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button onClick={() => setLeaving(false)} className="h-11 rounded-full bg-ink/5 text-sm font-semibold">
                    {view.status === "open" ? "Stay" : "Keep playing"}
                  </button>
                  <button onClick={() => void leaveGame()} className="h-11 rounded-full bg-hit text-sm font-semibold text-white">
                    Leave
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* The moment it starts: a big "Game on!" for everyone. */}
          {gameOn && (
            <div className="start-pop pointer-events-none absolute inset-0 z-10 grid place-items-center bg-ink/85 text-center text-white">
              <div>
                <p className="text-5xl">{g?.icon}</p>
                <p className="mt-2 font-display text-4xl font-black">Game on!</p>
                <p className="mt-1 text-sm text-white/70">{view.players.length} players · winner takes {cash(view.pool * WINNER_SHARE)}</p>
              </div>
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

/** Searching for players: sonar rings going out, a sweep going round. */
function Radar({ colour, children }: { colour: string; children: ReactNode }) {
  return (
    <div className="relative grid size-48 place-items-center">
      {[0, 1, 2].map((i) => (
        <span key={i} className="radar-ring absolute inset-6 rounded-full border-4" style={{ borderColor: colour, animationDelay: `${i * 0.66}s` }} />
      ))}
      <span className="radar-sweep absolute inset-4 rounded-full" style={{ background: `conic-gradient(from 0deg, transparent 0deg, ${colour}55 50deg, transparent 60deg)` }} />
      <span className="relative">{children}</span>
    </div>
  );
}
