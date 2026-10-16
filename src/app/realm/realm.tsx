"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Swords } from "lucide-react";
import { ArrowLeft, Eye, Ghost } from "@/components/icons";
import { cn } from "@/lib/cn";
import { canSettle, hourLabel, lastBattle, nextBattleAt } from "@/lib/realm/schedule";
import { cash, playerCurrency, setShownCurrency } from "@/lib/world/value";
import { realmMe, type RealmMe } from "./actions";
import { ArenaView, type ArenaData } from "./arena-view";
import { Shop } from "./shop";

// The Spirit Realm (docs/REALM.md): get your army ready for the next battle, or watch one.

type Tab = "ready" | "watch";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
};

const Shell = ({ children }: { children: ReactNode }) => (
  <main className="min-h-dvh bg-[#0b0620] text-white">
    <div className="mx-auto max-w-xl px-4 pb-6 pt-[max(12px,env(safe-area-inset-top))]">{children}</div>
  </main>
);

export function Realm() {
  // Everything here runs by the clock, so it starts on the phone (the server's page is just the frame).
  const [onPhone, setOnPhone] = useState(false);
  useEffect(() => setOnPhone(true), []);
  return onPhone ? <RealmLive /> : <Shell><p className="py-16 text-center text-sm text-violet-200">Opening the realm…</p></Shell>;
}

function RealmLive() {
  const [now, setNow] = useState(() => Date.now());
  const [me, setMe] = useState<RealmMe | null>(null);
  const [tab, setTab] = useState<Tab>(() => (lastBattle(Date.now()).phase === "fighting" ? "watch" : "ready"));
  const [waiting, setWaiting] = useState<number | null>(null);
  const [off, setOff] = useState(false);
  // The battle being watched, and its arena (null: the latest one, your arena in it).
  const [pick, setPick] = useState<{ at: number; arena: number } | null>(null);
  const [view, setView] = useState<ArenaData | null>(null);
  const [viewState, setViewState] = useState<"loading" | "none" | "ok">("loading");
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [, setCurrencyTick] = useState(0);

  // Amounts in the player's own currency (chosen in the city).
  useEffect(() => {
    try {
      setShownCurrency(playerCurrency(localStorage.getItem("newtown.currency")));
      setCurrencyTick((t) => t + 1);
    } catch {}
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const next = nextBattleAt(now);
  const last = lastBattle(now);

  const loadMe = useCallback(() => {
    realmMe().then((m) => {
      setMe(m);
      if (m.off) setOff(true);
    }, () => {});
  }, []);
  // You, again whenever a new hour begins (your army has gone into battle).
  useEffect(loadMe, [loadMe, next]);

  // How many armies are waiting for the next battle.
  useEffect(() => {
    let stop = false;
    const get = () =>
      fetch("/api/realm")
        .then((r) => r.json())
        .then((d: { waiting?: number; off?: boolean }) => {
          if (stop) return;
          if (d.off) setOff(true);
          setWaiting(d.waiting ?? 0);
        })
        .catch(() => {});
    get();
    const t = setInterval(get, 20_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [next]);

  // The battle being watched: the latest one, in your arena if you fought in it.
  const mineLast = me?.past.find((p) => p.at === last.at) ?? null;
  const watchAt = pick?.at ?? last.at;
  const watchArena = pick?.arena ?? (mineLast?.at === watchAt ? mineLast.arena : 0);
  const settled = Boolean(view?.results);
  useEffect(() => {
    let stop = false;
    const get = () =>
      fetch(`/api/realm?at=${watchAt}&arena=${watchArena}`)
        .then((r) => r.json())
        .then((d: ArenaData & { off?: boolean }) => {
          if (stop) return;
          if (d.off) return setOff(true);
          setView(d);
          setViewState(d.armies?.length ? "ok" : "none");
        })
        .catch(() => !stop && setViewState((s) => (s === "loading" ? "none" : s)));
    setViewState("loading");
    setView(null);
    get();
    return () => {
      stop = true;
    };
  }, [watchAt, watchArena]);
  // Over but not paid yet: look again every few seconds for the prize.
  useEffect(() => {
    if (!view || settled || !view.armies.length) return;
    const t = setInterval(() => {
      if (!canSettle(view.at, Date.now())) return;
      fetch(`/api/realm?at=${view.at}&arena=${view.arena}`)
        .then((r) => r.json())
        .then((d: ArenaData) => {
          if (d.results) {
            // Only the result is new (the armies stay the same, so the battle isn't started again).
            setView((v) => (v && v.at === d.at && v.arena === d.arena ? { ...v, results: d.results } : v));
            loadMe();
          }
        })
        .catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [view, settled, loadMe]);

  // When the hour strikes, everyone goes to watch.
  const [seenHour, setSeenHour] = useState(last.at);
  if (seenHour !== last.at) {
    setSeenHour(last.at);
    setPick(null);
    setTab("watch");
  }

  const say = (text: string, good = false) => {
    setMessage({ text, good });
    setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 5000);
  };

  const mySeq = (() => {
    const p = me?.past.find((x) => x.at === watchAt && x.arena === watchArena);
    return p ? p.seq : null;
  })();

  return (
    <Shell>
        <header className="flex items-center gap-3 py-2">
          <Link href="/play" className="flex size-9 items-center justify-center rounded-full bg-white/10" aria-label="Back to the city">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1.5 text-lg font-extrabold tracking-tight">
              <Ghost className="size-5 text-violet-300" /> Spirit Realm
            </h1>
            <p className="text-xs text-violet-200">
              {last.phase === "fighting" ? (
                <>
                  <b className="text-gold">Battle on now!</b> Next one at {hourLabel(next)}
                </>
              ) : (
                <>
                  Next battle at <b className="text-gold">{hourLabel(next)}</b> · in <span className="tabular-nums">{mmss(next - now)}</span>
                </>
              )}
              {waiting !== null && waiting > 0 && ` · ${waiting} ${waiting === 1 ? "army" : "armies"} waiting`}
            </p>
          </div>
        </header>

        <div className="my-3 grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1">
          {(
            [
              ["ready", "Get ready", Swords],
              ["watch", last.phase === "fighting" ? "Watch live" : "Watch", Eye],
            ] as const
          ).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={cn("flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold", tab === id ? "bg-violet-400 text-[#140a2e]" : "text-violet-100")}>
              <Icon className="size-4" /> {label}
              {id === "watch" && last.phase === "fighting" && <span className="size-2 animate-pulse rounded-full bg-hit" />}
            </button>
          ))}
        </div>

        {message && (
          <div className={cn("mb-3 rounded-xl px-3 py-2 text-sm", message.good ? "bg-me/25 text-white" : "bg-hit/25 text-white")} role="status">
            {message.text}
          </div>
        )}

        {off ? (
          <p className="rounded-2xl bg-white/5 p-4 text-sm text-violet-100">The Spirit Realm opens soon (the game&apos;s owner has one update to run).</p>
        ) : tab === "ready" ? (
          <>
            <details className="mb-4 rounded-2xl bg-white/5 p-3 text-sm text-violet-100">
              <summary className="cursor-pointer font-semibold text-white">How the Spirit Realm works</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>A battle at the start of every hour. Get your army ready any time before it.</li>
                <li>Buy fighters (each has its strengths and its price), upgrade weapons and armour, and pick the gate you start from.</li>
                <li>At the hour every army enters the realm and marches to the middle. Fighters go for the nearest enemy.</li>
                <li>The last army standing (or the strongest when time runs out) wins 85% of everything spent in its arena.</li>
                <li>Up to 30 armies an arena; with more players, more arenas fight at the same time. Anyone can watch.</li>
                <li>What happens in the realm stays there: your health, things and reputation in the city are never touched. Only the money you spend is real.</li>
              </ul>
            </details>
            {me ? (
              me.next.at === next ? (
                <Shop key={`${me.next.at}-${me.next.army?.spent ?? 0}`} me={me} onMe={setMe} onMessage={say} />
              ) : (
                <p className="text-sm text-violet-200">Loading…</p>
              )
            ) : (
              <p className="text-sm text-violet-200">Loading…</p>
            )}
          </>
        ) : (
          <section>
            <div className="mb-2 flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-white">Battle at {hourLabel(watchAt)}</span>
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => {
                  const at = last.at - i * 3_600_000;
                  return (
                    <button key={at} onClick={() => setPick({ at, arena: me?.past.find((p) => p.at === at)?.arena ?? 0 })} className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", at === watchAt ? "bg-white/20 text-white" : "bg-white/5 text-violet-200")}>
                      {hourLabel(at)}
                    </button>
                  );
                })}
              </span>
            </div>
            {viewState === "loading" && <p className="py-10 text-center text-sm text-violet-200">Opening the realm…</p>}
            {viewState === "none" && (
              <div className="rounded-2xl bg-white/5 p-5 text-center text-sm text-violet-100">
                <p>Nobody fought at {hourLabel(watchAt)}.</p>
                <button onClick={() => setTab("ready")} className="mt-3 rounded-xl bg-violet-400 px-4 py-2 font-semibold text-[#140a2e]">
                  Get ready for {hourLabel(next)}
                </button>
              </div>
            )}
            {viewState === "ok" && view && <ArenaView data={view} mySeq={mySeq} onArena={(arena) => setPick({ at: watchAt, arena })} />}
            {me?.past.some((p) => p.prize && p.prize > 0) && (
              <p className="mt-4 text-center text-xs text-violet-200">
                Your winnings lately: <b className="text-gold">{cash(me.past.reduce((s, p) => s + (p.prize ?? 0), 0))}</b>
              </p>
            )}
          </section>
        )}
    </Shell>
  );
}
