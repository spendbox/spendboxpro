"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BicepsFlexed,
  Check,
  CircleAlert,
  Clock,
  Coins,
  Eye,
  Goal,
  HandFist,
  History,
  LoaderCircle,
  Lock,
  RefreshCw,
  Ticket,
  Trophy,
  Undo2,
  Volleyball,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { liveAndNext, matchById, SPORT_INFO, SPORTS } from "@/lib/sports/schedule";
import type { FeedResponse, MatchInfo, MatchResult, Side, Sport } from "@/lib/sports/types";
import { Sheet } from "../sheet";
import { playSfx } from "../sound";
import { MatchView } from "./match-view";
import { buyTicket, myBets, placeBet, sportsBoard, type MyBet, type SportsBoard } from "./sports-actions";

// The stadium's box office and sportsbook. Pick a sport, see the match on now and the next few,
// buy a ticket to watch one live in the tactical view, or bet coins on who wins. Bets close at
// kick-off; winners share the pool (see game-db/020_sports.sql for the exact rules).
// Signed out, everything can be read, but Watch and Bet ask you to sign in first.

const ICONS: Record<Sport, LucideIcon> = { football: Goal, basketball: Volleyball, boxing: HandFist, wrestling: BicepsFlexed };
const CHIPS = [10, 50, 100, 500];
/** The colour for options that don't back a side (a draw). */
const NEUTRAL = "#8b95a1";
const ACCENT = "#2f6fd1";

type Note = { id: string; tone: "ok" | "error"; text: string };

// ---------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------

/** The time now, ticking every `every` ms. */
function useNow(every = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(id);
  }, [every]);
  return now;
}

/** "4:05", "25 min", "2 h 05 min". */
function until(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`;
  if (s >= 600) return `${Math.ceil(s / 60)} min`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const clockAt = (at: number) => new Date(at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });

/** Dark or light text, whichever reads better on this colour. */
function inkOn(colour: string) {
  let hex = colour.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const n = parseInt(hex, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#18202b" : "#ffffff";
}

/** The side an option backs (home or away), if any. */
function sideOf(match: MatchInfo, key: string): Side | null {
  return key === "home" ? match.home : key === "away" ? match.away : null;
}

const optionColour = (match: MatchInfo, key: string) => sideOf(match, key)?.colour ?? NEUTRAL;

/** 2000 → "2,000" (for limits and totals people read closely). */
const whole = (n: number) => Math.floor(n).toLocaleString("en");

const sum = (pool: Record<string, number> | undefined) => Object.values(pool ?? {}).reduce((a, b) => a + b, 0);

/**
 * What a bet would pay if it wins, from the pool as it stands (it changes until kick-off).
 * The same sums as settle_match: the house keeps a share of the pool (never more than the
 * losing stakes) and the winners split the rest by stake. Everyone on one side = a refund.
 */
function estimate(pool: Record<string, number>, option: string, amount: number, share: number) {
  if (!(amount > 0)) return null;
  const total = sum(pool) + amount;
  const win = (pool[option] ?? 0) + amount;
  if (total === win) return { payout: amount, refund: true };
  const cut = Math.min(Math.floor(total * share), total - win);
  return { payout: Math.floor(((total - cut) * amount) / win), refund: false };
}

/** "50 on Lions, 20 on Draw". */
function myBetText(m: MatchInfo, mine: Record<string, number> | undefined) {
  return Object.entries(mine ?? {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${short(v)} on ${m.options.find((o) => o.key === k)?.label ?? k}`)
    .join(", ");
}

function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("size-4 shrink-0 animate-spin", className)} aria-hidden />;
}

/** A side's colours as a little round badge. */
function Swatch({ side, size = 18 }: { side: Side; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full ring-1 ring-black/10"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${side.colour} 0 55%, ${side.colour2 ?? side.colour} 55% 100%)`,
      }}
      aria-hidden
    />
  );
}

type Score = { id: string; scoreline: string | null; done: boolean; result: MatchResult | null; pool: Record<string, number> };

/**
 * The latest scoreline, pool and (once it's over) result of a match, from the match feed
 * without the frames: every 5 s while it's being played, then it stops.
 */
function useScore(matchId: string | null) {
  const [state, setState] = useState<Score | null>(null);
  useEffect(() => {
    if (!matchId) return;
    let alive = true;
    let timer = 0;
    const poll = async () => {
      let done = false;
      if (typeof document === "undefined" || !document.hidden) {
        try {
          const res = await fetch(`/api/sports/feed?match=${encodeURIComponent(matchId)}&lite=1`, { cache: "no-store" });
          const body = (await res.json()) as FeedResponse;
          if (alive && body.ok) {
            setState({ id: matchId, scoreline: body.scoreline, done: body.done, result: body.result, pool: body.pool });
            done = body.done && body.result !== null;
          }
        } catch {
          // A missed update is fine: the next one comes in a few seconds.
        }
      }
      if (alive && !done) timer = window.setTimeout(() => void poll(), 5000);
    };
    void poll();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [matchId]);
  return state && state.id === matchId ? state : null;
}

// ---------------------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------------------

export function SportsSheet({
  sport,
  onClose,
  signedIn,
  onSignIn,
}: {
  sport?: Sport;
  onClose: () => void;
  signedIn: boolean;
  onSignIn: () => void;
}) {
  const [tab, setTab] = useState<Sport>(sport ?? "football");
  const [view, setView] = useState<"matches" | "bets">("matches");
  const [watching, setWatching] = useState<string | null>(null);
  const [board, setBoard] = useState<SportsBoard | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [slip, setSlip] = useState<{ id: string; option: string | null; amount: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [viewKey, setViewKey] = useState(0);
  const now = useNow(1000);

  const { live, next, last } = useMemo(() => liveAndNext(tab, now), [tab, now]);
  const matches = useMemo(() => [...(live ? [live] : []), ...next.slice(0, 3)], [live, next]);
  // The one that just finished is shown (with its result) while nothing is being played.
  const finished = !live ? last : null;
  const ids = [...matches, ...(finished ? [finished] : [])].map((m) => m.id).join(",");
  const liveScore = useScore(view === "matches" && live ? live.id : null);
  const lastScore = useScore(view === "matches" && finished ? finished.id : null);

  // Pools, tickets, coins and limits for the matches on show: now, after every bet, and every 15 s.
  useEffect(() => {
    let alive = true;
    let timer = 0;
    const load = () => {
      void sportsBoard(ids ? ids.split(",") : []).then((res) => {
        if (!alive) return;
        if (res.ok) {
          setBoard(res);
          setBoardError(null);
        } else setBoardError(res.error);
        timer = window.setTimeout(load, 15_000);
      });
    };
    load();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [ids, signedIn, reload]);

  const limits = board?.limits ?? { min: 10, max: 500, dailyMax: 2000, burnShare: 0.1 };
  const price = (s: Sport) => board?.prices[s] ?? SPORT_INFO[s].ticket;
  // Bets close at kick-off, so the board's pools are as fresh as the feed's (the feed fills in while it loads).
  const poolFor = (id: string) =>
    board?.pools[id] ?? (liveScore?.id === id ? liveScore.pool : lastScore?.id === id ? lastScore.pool : undefined) ?? {};

  async function watch(m: MatchInfo) {
    if (!signedIn) return onSignIn();
    if (busy) return;
    if (board?.tickets.includes(m.id)) {
      setWatching(m.id);
      return;
    }
    setBusy(`ticket:${m.id}`);
    setNote(null);
    const res = await buyTicket(m.id);
    setBusy(null);
    if (!res.ok) {
      playSfx("denied");
      setNote({ id: m.id, tone: "error", text: res.error });
      return;
    }
    playSfx("pop");
    setBoard((b) => b && { ...b, tickets: b.tickets.includes(m.id) ? b.tickets : [...b.tickets, m.id], coins: res.balance });
    setWatching(m.id);
  }

  function toggleSlip(m: MatchInfo) {
    if (!signedIn) return onSignIn();
    setNote(null);
    setSlip((s) => (s?.id === m.id ? null : { id: m.id, option: null, amount: String(limits.min * 5) }));
  }

  async function bet(m: MatchInfo, option: string, amount: number) {
    if (!signedIn) return onSignIn();
    if (busy) return;
    setBusy(`bet:${m.id}`);
    setNote(null);
    const res = await placeBet(m.id, option, amount);
    setBusy(null);
    if (!res.ok) {
      playSfx("denied");
      setNote({ id: m.id, tone: "error", text: res.error });
      return;
    }
    playSfx("pop");
    const label = m.options.find((o) => o.key === option)?.label ?? option;
    setBoard(
      (b) =>
        b && {
          ...b,
          pools: { ...b.pools, [m.id]: res.pool },
          mine: { ...b.mine, [m.id]: { ...b.mine[m.id], [option]: (b.mine[m.id]?.[option] ?? 0) + res.amount } },
          coins: res.balance,
          today: b.today + res.amount,
        },
    );
    setSlip(null);
    setNote({ id: m.id, tone: "ok", text: `Bet placed on ${label}. Good luck!` });
  }

  // Watching a match: the tactical view (a ticket unlocks it).
  if (watching) {
    const m = matchById(watching);
    const buyHere = () => {
      if (!signedIn) return onSignIn();
      if (busy) return;
      setBusy(`ticket:${watching}`);
      setNote(null);
      void buyTicket(watching).then((res) => {
        setBusy(null);
        if (!res.ok) {
          playSfx("denied");
          setNote({ id: watching, tone: "error", text: res.error });
          return;
        }
        playSfx("pop");
        setBoard((b) => b && { ...b, tickets: b.tickets.includes(watching) ? b.tickets : [...b.tickets, watching], coins: res.balance });
        setViewKey((k) => k + 1); // start the view again, so the feed asks with the new ticket straight away
      });
    };
    const bettingOpen = m ? now >= m.opensAt && now < m.kickoffAt : false;
    return (
      <Sheet onClose={onClose} wide>
        <MatchView
          key={`${watching}:${viewKey}`}
          matchId={watching}
          onClose={() => {
            setWatching(null);
            setSlip(null);
          }}
          locked={
            <LockedPanel
              price={price(m?.sport ?? tab)}
              over={m ? now >= m.endsAt : true}
              signedIn={signedIn}
              busy={busy === `ticket:${watching}`}
              error={note?.id === watching && note.tone === "error" ? note.text : null}
              onBuy={buyHere}
            />
          }
        >
          {m && (
            <div className="space-y-3 rounded-3xl border border-line bg-panel p-3.5">
              <PoolBar match={m} pool={poolFor(m.id)} />
              {sum(board?.mine[m.id]) > 0 && (
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Coins className="size-3.5 text-gold-dark" /> Your bet: {myBetText(m, board?.mine[m.id])}
                </p>
              )}
              {note?.id === m.id && note.tone === "ok" && (
                <p role="status" className="flex items-start gap-2 rounded-2xl bg-me/10 px-3 py-2 text-sm font-semibold text-me">
                  <Check className="mt-0.5 size-4 shrink-0" /> {note.text}
                </p>
              )}
              {bettingOpen &&
                (slip?.id === m.id ? (
                  <BetSlip
                    match={m}
                    now={now}
                    pool={poolFor(m.id)}
                    mine={sum(board?.mine[m.id])}
                    limits={limits}
                    coins={board?.coins ?? null}
                    today={board?.today ?? 0}
                    option={slip.option}
                    amount={slip.amount}
                    busy={busy === `bet:${m.id}`}
                    onOption={(o) => setSlip((x) => x && { ...x, option: o })}
                    onAmount={(a) => setSlip((x) => x && { ...x, amount: a })}
                    onPlace={(o, a) => void bet(m, o, a)}
                    onCancel={() => setSlip(null)}
                  />
                ) : (
                  <button
                    onClick={() => toggleSlip(m)}
                    className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-gold px-3 text-sm font-bold text-ink"
                  >
                    <Coins className="size-4" /> Bet on this {SPORT_INFO[m.sport].noun} · closes in {until(m.kickoffAt - now)}
                  </button>
                ))}
              {note?.id === m.id && note.tone === "error" && slip?.id === m.id && (
                <p role="alert" className="flex items-start gap-2 rounded-2xl bg-hit/10 px-3 py-2 text-sm font-semibold text-hit">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" /> {note.text}
                </p>
              )}
              <p className="text-center text-[11px] text-muted">Mint only, just for fun. Mint has no cash value.</p>
            </div>
          )}
        </MatchView>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose} wide>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-white shadow-sm" style={{ background: ACCENT }}>
            <Trophy className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-xl font-bold leading-tight">{SPORT_INFO[tab].place}</h2>
            <p className="truncate text-sm text-muted">
              {signedIn && board?.coins !== null && board?.coins !== undefined
                ? `You have ₥${whole(board.coins)}`
                : "Watch live matches and bet mint"}
            </p>
          </div>
          <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        {/* Sports */}
        <div role="tablist" aria-label="Sport" className="grid grid-cols-4 gap-1.5">
          {SPORTS.map((s) => {
            const Icon = ICONS[s];
            const on = s === tab;
            return (
              <button
                key={s}
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setTab(s);
                  setSlip(null);
                  setNote(null);
                }}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 text-[11px] font-bold leading-tight",
                  on ? "bg-ink text-white" : "bg-panel-2 text-muted hover:text-ink",
                )}
              >
                <Icon className="size-5" />
                <span className="max-w-full truncate">{SPORT_INFO[s].label}</span>
              </button>
            );
          })}
        </div>

        {/* Matches or my bets */}
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-panel-2 p-1 text-sm font-semibold">
          {(
            [
              ["matches", "Matches", Clock],
              ["bets", "My bets", History],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => (key === "bets" && !signedIn ? onSignIn() : setView(key))}
              className={cn(
                "flex min-h-10 items-center justify-center gap-1.5 rounded-xl",
                view === key ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        {view === "matches" ? (
          <div className="space-y-3">
            {!board && !boardError && (
              <p className="flex items-center justify-center gap-2 py-2 text-sm text-muted">
                <Spinner /> Loading the pools…
              </p>
            )}
            {boardError && (
              <p className="flex items-center gap-2 rounded-2xl bg-hit/10 px-3 py-2 text-sm font-semibold text-hit">
                <CircleAlert className="size-4 shrink-0" /> {boardError}
                <button onClick={() => setReload((n) => n + 1)} className="ml-auto rounded-full px-2 py-1 underline">
                  Retry
                </button>
              </p>
            )}
            {finished && (
              <ResultCard
                match={finished}
                score={lastScore?.id === finished.id ? lastScore : null}
                pool={poolFor(finished.id)}
                mine={board?.mine[finished.id]}
              />
            )}
            {matches.length === 0 && <p className="py-6 text-center text-sm text-muted">No matches scheduled right now. Check back soon!</p>}
            {matches.map((m) => {
              const isLive = now >= m.kickoffAt && now < m.endsAt;
              return (
                <MatchCard
                  key={m.id}
                  match={m}
                  now={now}
                  isLive={isLive}
                  scoreline={isLive && liveScore?.id === m.id ? liveScore.scoreline : null}
                  pool={poolFor(m.id)}
                  mine={board?.mine[m.id]}
                  ticket={Boolean(board?.tickets.includes(m.id))}
                  price={price(m.sport)}
                  signedIn={signedIn}
                  busyTicket={busy === `ticket:${m.id}`}
                  disabled={busy !== null}
                  note={note?.id === m.id ? note : null}
                  slipOpen={slip?.id === m.id}
                  onWatch={() => void watch(m)}
                  onBet={() => toggleSlip(m)}
                >
                  {slip?.id === m.id && (
                    <BetSlip
                      match={m}
                      now={now}
                      pool={poolFor(m.id)}
                      mine={sum(board?.mine[m.id])}
                      limits={limits}
                      coins={board?.coins ?? null}
                      today={board?.today ?? 0}
                      option={slip.option}
                      amount={slip.amount}
                      busy={busy === `bet:${m.id}`}
                      onOption={(o) => setSlip((s) => s && { ...s, option: o })}
                      onAmount={(a) => setSlip((s) => s && { ...s, amount: a })}
                      onPlace={(o, a) => void bet(m, o, a)}
                      onCancel={() => setSlip(null)}
                    />
                  )}
                </MatchCard>
              );
            })}
          </div>
        ) : (
          <MyBetsList now={now} refreshKey={reload} />
        )}

        {/* The small print */}
        <div className="space-y-1 rounded-2xl bg-panel-2 px-3 py-2.5 text-xs text-muted">
          <p className="font-semibold text-ink">Mint only, just for fun. Mint has no cash value.</p>
          <p>
            Bets: ₥{whole(limits.min)}–{whole(limits.max)} a match, up to {whole(limits.dailyMax)} a day, until kick-off. Winners share
            the pool by stake (the house keeps {Math.round(limits.burnShare * 100)}%, never from winners&apos; own mint). If nobody picks
            the winner, everyone gets their mint back.
          </p>
          <p>
            Every {SPORT_INFO[tab].noun} is played out live once and never repeats. A ticket lets you watch one {SPORT_INFO[tab].noun}.
          </p>
        </div>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------
// A match on the list
// ---------------------------------------------------------------------------------------

function MatchCard({
  match: m,
  now,
  isLive,
  scoreline,
  pool,
  mine,
  ticket,
  price,
  signedIn,
  busyTicket,
  disabled,
  note,
  slipOpen,
  onWatch,
  onBet,
  children,
}: {
  match: MatchInfo;
  now: number;
  isLive: boolean;
  scoreline: string | null;
  pool: Record<string, number>;
  mine: Record<string, number> | undefined;
  ticket: boolean;
  price: number;
  signedIn: boolean;
  busyTicket: boolean;
  disabled: boolean;
  note: Note | null;
  slipOpen: boolean;
  onWatch: () => void;
  onBet: () => void;
  children?: React.ReactNode;
}) {
  const closed = now >= m.kickoffAt;
  const notOpen = now < m.opensAt;
  const myTotal = sum(mine);
  return (
    <article className={cn("space-y-3 rounded-3xl border bg-panel p-3.5", isLive ? "border-hit/40 shadow-sm" : "border-line")}>
      {/* When */}
      <div className="flex items-center gap-2 text-xs">
        {isLive ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-hit px-2 py-0.5 font-bold uppercase tracking-wide text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" /> Live
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-panel-2 px-2 py-0.5 font-semibold text-ink">
            <Clock className="size-3.5" /> Starts in {until(m.kickoffAt - now)}
          </span>
        )}
        <span className="min-w-0 truncate text-muted">{m.league ?? `${SPORT_INFO[m.sport].label} · ${clockAt(m.kickoffAt)}`}</span>
      </div>

      {/* Who */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Swatch side={m.home} />
          <span className="line-clamp-2 min-w-0 break-words font-display text-[15px] font-bold leading-tight">{m.home.name}</span>
        </div>
        <span className="px-1 text-center text-sm font-bold text-muted">vs</span>
        <div className="flex min-w-0 items-center justify-end gap-2 text-right">
          <span className="line-clamp-2 min-w-0 break-words font-display text-[15px] font-bold leading-tight">{m.away.name}</span>
          <Swatch side={m.away} />
        </div>
      </div>
      {isLive && (
        <p className="flex min-h-9 items-center justify-center gap-2 rounded-2xl bg-ink px-3 py-1.5 text-center font-display text-sm font-bold tabular-nums text-white">
          {scoreline ?? (
            <>
              <Spinner /> Getting the score…
            </>
          )}
        </p>
      )}

      <PoolBar match={m} pool={pool} />

      {myTotal > 0 && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Coins className="size-3.5 text-gold-dark" /> Your bet: {myBetText(m, mine)}
        </p>
      )}

      {/* Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onWatch}
          disabled={disabled && !busyTicket}
          aria-busy={busyTicket}
          className={cn(
            "flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl px-2 text-sm font-bold disabled:opacity-50",
            isLive || ticket ? "bg-ink text-white" : "bg-panel-2 text-ink",
          )}
        >
          {busyTicket ? (
            <>
              <Spinner /> Buying…
            </>
          ) : ticket ? (
            <>
              <Eye className="size-4" /> Watch
            </>
          ) : (
            <>
              <Ticket className="hidden size-4 shrink-0 min-[400px]:block" /> Watch · ₥{short(price)}
            </>
          )}
        </button>
        <button
          onClick={onBet}
          disabled={(closed || notOpen) && signedIn}
          className={cn(
            "flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl px-2 text-sm font-bold disabled:opacity-50",
            slipOpen ? "bg-gold-dark text-white" : "bg-gold text-ink",
          )}
        >
          {closed ? (
            <>
              <Lock className="size-4" /> Bets closed
            </>
          ) : notOpen ? (
            <>
              <Clock className="size-4" /> Bets in {until(m.opensAt - now)}
            </>
          ) : (
            <>
              <Coins className="size-4" /> {slipOpen ? "Hide bet slip" : "Bet"}
            </>
          )}
        </button>
      </div>
      {!signedIn && <p className="text-center text-xs text-muted">Sign in to watch or bet.</p>}

      {note && !slipOpen && <NoteLine note={note} />}
      {children}
      {note && slipOpen && <NoteLine note={note} />}
    </article>
  );
}

/** A short message on a match card: "Bet placed…" or what went wrong. */
function NoteLine({ note }: { note: Note }) {
  return (
    <p
      role={note.tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-2xl px-3 py-2 text-sm font-semibold",
        note.tone === "error" ? "bg-hit/10 text-hit" : "bg-me/10 text-me",
      )}
    >
      {note.tone === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <Check className="mt-0.5 size-4 shrink-0" />}
      {note.text}
    </p>
  );
}

/** Coins bet on each option, as one coloured bar with the numbers underneath. */
function PoolBar({ match: m, pool }: { match: MatchInfo; pool: Record<string, number> }) {
  const total = sum(pool);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-muted">Betting pool</span>
        <span className="font-bold tabular-nums">{total > 0 ? `₥${whole(total)}` : "No bets yet"}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-panel-2" aria-hidden>
        {total > 0 &&
          m.options.map((o) => (
            <span
              key={o.key}
              style={{ width: `${((pool[o.key] ?? 0) / total) * 100}%`, background: optionColour(m, o.key) }}
              className="h-full transition-[width] duration-500"
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {m.options.map((o) => (
          <span key={o.key} className="inline-flex min-w-0 items-center gap-1 text-muted">
            <span className="size-2 shrink-0 rounded-full" style={{ background: optionColour(m, o.key) }} />
            <span className="max-w-32 truncate">{o.label}</span>
            <b className="tabular-nums text-ink">{short(pool[o.key] ?? 0)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** The match that just finished: the final score, who won and the pool. */
function ResultCard({
  match: m,
  score,
  pool,
  mine,
}: {
  match: MatchInfo;
  score: Score | null;
  pool: Record<string, number>;
  mine: Record<string, number> | undefined;
}) {
  const winner = score?.result ? m.options.find((o) => o.key === score.result?.winner) ?? null : null;
  const myTotal = sum(mine);
  const backedWinner = winner ? (mine?.[winner.key] ?? 0) > 0 : false;
  return (
    <article className="space-y-3 rounded-3xl border border-line bg-panel-2/60 p-3.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-2 py-0.5 font-bold uppercase tracking-wide text-white">
          <Check className="size-3.5" /> Full time
        </span>
        <span className="min-w-0 truncate text-muted">{m.league ?? SPORT_INFO[m.sport].label}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Swatch side={m.home} />
          <span className="line-clamp-2 min-w-0 break-words font-display text-[15px] font-bold leading-tight">{m.home.name}</span>
        </div>
        <span className="px-1 text-center text-sm font-bold text-muted">vs</span>
        <div className="flex min-w-0 items-center justify-end gap-2 text-right">
          <span className="line-clamp-2 min-w-0 break-words font-display text-[15px] font-bold leading-tight">{m.away.name}</span>
          <Swatch side={m.away} />
        </div>
      </div>
      <p className="flex min-h-9 items-center justify-center gap-2 rounded-2xl bg-panel px-3 py-1.5 text-center font-display text-sm font-bold tabular-nums">
        {score ? (
          (score.scoreline ?? score.result?.score ?? "Full time")
        ) : (
          <>
            <Spinner /> Getting the result…
          </>
        )}
      </p>
      {winner && (
        <div className="flex items-start gap-1.5 text-sm">
          <Trophy className="mt-0.5 size-4 shrink-0 text-gold-dark" />
          <div className="min-w-0">
            <p className="font-bold">{winner.key === "draw" ? "It's a draw" : `${winner.label} won`}</p>
            {score?.result?.summary && <p className="line-clamp-2 text-xs text-muted">{score.result.summary}</p>}
          </div>
        </div>
      )}
      <PoolBar match={m} pool={pool} />
      {myTotal > 0 && winner && (
        <p className={cn("text-xs font-semibold", backedWinner ? "text-me" : "text-muted")}>
          {backedWinner ? "You backed the winner! See My bets for your payout." : "Your bet didn't come in this time. See My bets."}
        </p>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------------------
// The bet slip
// ---------------------------------------------------------------------------------------

function BetSlip({
  match: m,
  now,
  pool,
  mine,
  limits,
  coins,
  today,
  option,
  amount,
  busy,
  onOption,
  onAmount,
  onPlace,
  onCancel,
}: {
  match: MatchInfo;
  now: number;
  pool: Record<string, number>;
  mine: number;
  limits: SportsBoard["limits"];
  coins: number | null;
  today: number;
  option: string | null;
  amount: string;
  busy: boolean;
  onOption: (key: string) => void;
  onAmount: (amount: string) => void;
  onPlace: (option: string, amount: number) => void;
  onCancel: () => void;
}) {
  const closed = now >= m.kickoffAt;
  const n = Number(amount);
  const leftMatch = Math.max(0, limits.max - mine);
  const leftToday = Math.max(0, limits.dailyMax - today);
  const chosen = m.options.find((o) => o.key === option) ?? null;

  let problem: string | null = null;
  if (closed) problem = "Bets are closed: it's kicked off";
  else if (!chosen) problem = "Pick who you think will win.";
  else if (!Number.isInteger(n) || n <= 0) problem = "How much mint?";
  else if (n < limits.min) problem = `Bets start at ₥${short(limits.min)}.`;
  else if (n > leftMatch)
    problem =
      leftMatch < limits.min
        ? `You've bet the most allowed on this match (₥${short(limits.max)}).`
        : `You can bet ${short(leftMatch)} more mint on this match.`;
  else if (n > leftToday)
    problem = leftToday < limits.min ? "That's today's betting limit. Come back tomorrow!" : `You can bet ${short(leftToday)} more mint today.`;
  else if (coins !== null && n > coins) problem = `You only have ₥${short(Math.floor(coins))}.`;

  const est = chosen && !problem ? estimate(pool, chosen.key, n, limits.burnShare) : null;
  const side = chosen ? sideOf(m, chosen.key) : null;

  return (
    <div className="space-y-3 rounded-2xl border border-gold/60 bg-gold/10 p-3">
      <div className="flex items-center gap-2">
        <Coins className="size-4 text-gold-dark" />
        <p className="flex-1 text-sm font-bold">Bet slip</p>
        {!closed && <span className="text-xs font-semibold text-muted">Closes in {until(m.kickoffAt - now)}</span>}
      </div>

      {/* Who wins? */}
      <div className={cn("grid gap-2", m.options.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
        {m.options.map((o) => {
          const colour = optionColour(m, o.key);
          const on = o.key === option;
          return (
            <button
              key={o.key}
              onClick={() => onOption(o.key)}
              disabled={closed || busy}
              aria-pressed={on}
              className={cn(
                "flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-1.5 py-2 text-[13px] font-bold disabled:opacity-50",
                on ? "shadow-md" : "bg-panel",
              )}
              style={on ? { background: colour, borderColor: colour, color: inkOn(colour) } : { borderColor: colour }}
            >
              <span className="max-w-full truncate leading-tight" title={o.label}>
                {sideOf(m, o.key)?.short ?? o.label}
              </span>
              <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums", on ? "opacity-90" : "text-muted")}>
                {on && <Check className="size-3 shrink-0" aria-hidden />}
                {short(pool[o.key] ?? 0)} in
              </span>
            </button>
          );
        })}
      </div>

      {/* How much? */}
      <div className="grid grid-cols-5 gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c}
            onClick={() => onAmount(String(c))}
            disabled={closed || busy}
            className={cn("min-h-10 rounded-xl text-sm font-bold disabled:opacity-50", n === c ? "bg-ink text-white" : "bg-panel text-muted")}
          >
            {short(c)}
          </button>
        ))}
        <input
          inputMode="numeric"
          value={CHIPS.includes(n) ? "" : amount}
          onChange={(e) => onAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
          disabled={closed || busy}
          placeholder="Other"
          aria-label="Mint to bet"
          className="min-h-10 w-full min-w-0 rounded-xl border border-line bg-panel px-0.5 text-center text-sm font-bold outline-none placeholder:text-[13px] placeholder:font-semibold focus:border-ink"
        />
      </div>

      {/* What it could pay */}
      {est && chosen ? (
        <p className="rounded-xl bg-panel px-3 py-2 text-sm">
          {est.refund ? (
            <>
              Nobody has backed anyone else yet, so for now you&apos;d just get your <b>₥{short(n)}</b> back.
            </>
          ) : (
            <>
              About <b className="text-me">₥{short(est.payout)}</b> {side ? "if they win" : "if it's a draw"}.
              <span className="block text-xs text-muted">The pool can still change until kick-off.</span>
            </>
          )}
        </p>
      ) : (
        problem && <p className="text-sm font-semibold text-muted">{problem}</p>
      )}

      <div className="flex gap-2">
        <button onClick={onCancel} className="min-h-12 rounded-2xl bg-panel px-4 text-sm font-semibold text-muted" disabled={busy}>
          Cancel
        </button>
        <button
          onClick={() => chosen && !problem && onPlace(chosen.key, n)}
          disabled={Boolean(problem) || busy}
          aria-busy={busy}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-me px-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? (
            <>
              <Spinner /> Placing bet…
            </>
          ) : (
            <>
              {chosen && !problem ? `Bet ₥${whole(n)} on ${side?.short ?? chosen.label}` : "Place bet"}
            </>
          )}
        </button>
      </div>
      <p className="text-center text-[11px] text-muted">
        Today: ₥{whole(today)} of {whole(limits.dailyMax)} bet · This match: {whole(mine)} of {whole(limits.max)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// My bets
// ---------------------------------------------------------------------------------------

function MyBetsList({ now, refreshKey }: { now: number; refreshKey: number }) {
  const [bets, setBets] = useState<MyBet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [again, setAgain] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const load = () => {
      void myBets().then((res) => {
        if (!alive) return;
        setLoading(false);
        if (res.ok) {
          setBets(res.bets);
          setError(null);
        } else setError(res.error);
        timer = window.setTimeout(load, 20_000);
      });
    };
    load();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [refreshKey, again]);

  const open = (bets ?? []).filter((b) => !b.settled);
  const won = (bets ?? []).filter((b) => b.settled && !b.refunded && (b.payout ?? 0) > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-panel-2 px-2 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Mint in play</p>
            <p className="font-display text-lg font-bold tabular-nums">{short(open.reduce((a, b) => a + b.amount, 0))}</p>
          </div>
          <div className="rounded-2xl bg-panel-2 px-2 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Won lately</p>
            <p className="font-display text-lg font-bold tabular-nums text-me">{short(won.reduce((a, b) => a + (b.payout ?? 0), 0))}</p>
          </div>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            setAgain((n) => n + 1);
          }}
          disabled={loading}
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-panel-2 text-muted disabled:opacity-60"
          aria-label="Refresh my bets"
        >
          {loading ? <Spinner className="size-5" /> : <RefreshCw className="size-5" />}
        </button>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-2xl bg-hit/10 px-3 py-2 text-sm font-semibold text-hit">
          <CircleAlert className="size-4 shrink-0" /> {error}
        </p>
      )}
      {bets === null && !error && (
        <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted">
          <Spinner /> Loading your bets…
        </p>
      )}
      {bets?.length === 0 && <p className="py-6 text-center text-sm text-muted">No bets yet. Pick a match and back a side!</p>}

      <ul className="space-y-2">
        {(bets ?? []).map((b) => (
          <li key={b.id} className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2.5">
            <span className="size-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: b.color ?? NEUTRAL }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {short(b.amount)} on {b.optionLabel}
              </p>
              <p className="flex min-w-0 items-center gap-1 text-xs text-muted">
                {b.sport && <SportIcon sport={b.sport} />}
                <span className="truncate">
                  {b.title}
                  {b.settled && b.winnerLabel ? ` · ${b.winnerLabel === "Draw" ? "Draw" : `${b.winnerLabel} won`}` : ""}
                  {b.settled && b.score ? ` · ${b.score}` : ""}
                </span>
              </p>
            </div>
            <BetStatus bet={b} now={now} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SportIcon({ sport }: { sport: Sport }) {
  const Icon = ICONS[sport];
  return <Icon className="size-3.5 shrink-0" aria-label={SPORT_INFO[sport].label} />;
}

function BetStatus({ bet: b, now }: { bet: MyBet; now: number }) {
  const pill = "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-bold tabular-nums";
  if (b.settled) {
    if (b.refunded || (b.payout !== null && b.payout === b.amount && b.winner !== b.option)) {
      return (
        <span className={cn(pill, "bg-panel-2 text-muted")}>
          <Undo2 className="size-3.5" /> Refunded {short(b.payout ?? b.amount)}
        </span>
      );
    }
    if ((b.payout ?? 0) > 0) {
      return (
        <span className={cn(pill, "bg-me/15 text-me")}>
          <Trophy className="size-3.5" /> Won {short(b.payout ?? 0)}
        </span>
      );
    }
    return <span className={cn(pill, "bg-hit/10 text-hit")}>Lost</span>;
  }
  if (b.kickoffAt !== null && now < b.kickoffAt) {
    return (
      <span className={cn(pill, "bg-gold/20 text-gold-dark")}>
        <Clock className="size-3.5" /> {until(b.kickoffAt - now)}
      </span>
    );
  }
  if (b.endsAt !== null && now < b.endsAt) {
    return (
      <span className={cn(pill, "bg-hit text-white")}>
        <span className="size-1.5 animate-pulse rounded-full bg-white" /> Live
      </span>
    );
  }
  return (
    <span className={cn(pill, "bg-panel-2 text-muted")}>
      <Spinner className="size-3.5" /> Result soon
    </span>
  );
}

/** Shown over the blurred pitch when there's no ticket (MatchView adds the lock and the title). */
function LockedPanel({
  price,
  over,
  signedIn,
  busy,
  error,
  onBuy,
}: {
  price: number;
  over: boolean;
  signedIn: boolean;
  busy: boolean;
  error: string | null;
  onBuy: () => void;
}) {
  if (over) return <p className="text-sm text-muted">Tickets are sold for matches still to come. Pick another one!</p>;
  return (
    <div className="space-y-2">
      <button
        onClick={onBuy}
        disabled={busy}
        aria-busy={busy}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-4 text-sm font-bold text-white disabled:opacity-60"
      >
        {busy ? (
          <>
            <Spinner /> Buying…
          </>
        ) : signedIn ? (
          <>
            <Ticket className="size-4" /> Buy ticket · ₥{short(price)}
          </>
        ) : (
          "Sign in to watch"
        )}
      </button>
      {error && (
        <p role="alert" className="rounded-xl bg-hit/10 px-3 py-2 text-sm font-semibold text-hit">
          {error}
        </p>
      )}
    </div>
  );
}
