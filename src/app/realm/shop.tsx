"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, Shield } from "@/components/icons";
import { cn } from "@/lib/cn";
import { gateDir, gateLabel } from "@/lib/realm/battle";
import { FIGHTERS, MAX_FIGHTERS, MAX_OF_KIND, MAX_SPEND, UPGRADE_COST, UPGRADE_MAX, UPGRADE_NAMES, armyCost, armySize, type Army, type FighterId } from "@/lib/realm/fighters";
import { GATES, hourLabel } from "@/lib/realm/schedule";
import { cash } from "@/lib/world/value";
import { enlist, leaveRealm, type RealmMe } from "./actions";
import { drawFighter } from "./draw";

// Getting ready for the next battle: buy fighters, weapons and armour, pick your gate, enter.

function FighterIcon({ kind, size = 52 }: { kind: FighterId; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (!c || !ref.current) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ref.current.width = size * dpr;
    ref.current.height = size * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);
    const big = kind === "giant" || kind === "dragon";
    drawFighter(c, kind, size / 2, size * 0.88, size * (big ? 0.42 : 0.72));
  }, [kind, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}

const MiniBar = ({ label, value, max }: { label: string; value: number; max: number }) => (
  <div className="flex items-center gap-1.5">
    <span className="w-12 text-[10px] uppercase tracking-wide text-violet-300">{label}</span>
    <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
      <span className="block h-full rounded-full bg-violet-300" style={{ width: `${Math.min(100, Math.round((value / max) * 100))}%` }} />
    </span>
  </div>
);

export function Shop({ me, onMe, onMessage }: { me: RealmMe; onMe: (m: RealmMe) => void; onMessage: (text: string, good?: boolean) => void }) {
  const saved = me.next.army;
  const [fighters, setFighters] = useState<Army["fighters"]>(() => saved?.fighters ?? {});
  const [weapons, setWeapons] = useState(saved?.weapons ?? 0);
  const [armour, setArmour] = useState(saved?.armour ?? 0);
  const [gate, setGate] = useState<number | null>(saved?.gate ?? null);
  const [busy, start] = useTransition();
  const army: Army = { fighters, weapons, armour };
  const cost = armyCost(army);
  const size = armySize(army);
  const spent = saved?.spent ?? 0;
  const diff = cost - spent;
  const canSpend = me.canSpend;
  const tooDear = canSpend !== null && diff > canSpend;
  const changed =
    !saved || saved.gate !== gate || saved.weapons !== weapons || saved.armour !== armour || FIGHTERS.some((f) => (saved.fighters[f.id] ?? 0) !== (fighters[f.id] ?? 0));

  const add = (id: FighterId, by: number) =>
    setFighters((cur) => {
      const now = cur[id] ?? 0;
      const others = armySize({ fighters: cur, weapons: 0, armour: 0 }) - now;
      const next = Math.max(0, Math.min(MAX_OF_KIND, MAX_FIGHTERS - others, now + by));
      return { ...cur, [id]: next };
    });

  const save = () =>
    start(async () => {
      if (gate === null) return;
      const r = await enlist(me.next.at, gate, army);
      if (!r.ok) return onMessage(r.error);
      onMe(r.me);
      onMessage(saved ? (r.paid > 0 ? `Army changed: ${cash(r.paid)} more paid.` : r.paid < 0 ? `Army changed: ${cash(-r.paid)} back to you.` : "Army changed.") : `You're in! Your army enters the realm at ${hourLabel(me.next.at)}.`, true);
    });

  const leave = () =>
    start(async () => {
      const r = await leaveRealm(me.next.at);
      if (!r.ok) return onMessage(r.error);
      onMe(r.me);
      setFighters({});
      setWeapons(0);
      setArmour(0);
      setGate(null);
      onMessage(`You left the battle. ${cash(r.back)} is back with you.`, true);
    });

  return (
    <div className="space-y-5 pb-28">
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-violet-200">1. Buy your fighters</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FIGHTERS.map((f) => {
            const n = fighters[f.id] ?? 0;
            return (
              <div key={f.id} className={cn("flex gap-2.5 rounded-2xl p-2.5", n ? "bg-white/15 ring-1 ring-violet-300/50" : "bg-white/5")}>
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl" style={{ background: `${f.colour}33` }}>
                  <FighterIcon kind={f.id} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-white">{f.name}</span>
                    <span className="text-xs font-semibold text-gold">{cash(f.cost)}</span>
                  </div>
                  <p className="text-xs leading-snug text-violet-200">{f.blurb}</p>
                  <div className="mt-1 space-y-0.5">
                    <MiniBar label="Health" value={f.hp} max={1200} />
                    <MiniBar label="Power" value={f.atk} max={75} />
                    <MiniBar label="Speed" value={f.speed} max={12} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button onClick={() => add(f.id, -1)} disabled={!n} className="size-8 rounded-lg bg-white/10 text-lg font-bold text-white disabled:opacity-30" aria-label={`One fewer ${f.name}`}>
                      −
                    </button>
                    <span className="w-9 text-center font-bold tabular-nums text-white">{n}</span>
                    <button onClick={() => add(f.id, 1)} className="flex size-8 items-center justify-center rounded-lg bg-violet-400 text-[#140a2e]" aria-label={`One more ${f.name}`}>
                      <Plus className="size-4" />
                    </button>
                    <button onClick={() => add(f.id, 10)} className="h-8 rounded-lg bg-white/10 px-2 text-xs font-semibold text-white">
                      +10
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-violet-300">
          Up to {MAX_OF_KIND} of each and {MAX_FIGHTERS} in all. Angels beat devils and ghosts; swords pass through ghosts; devils burn soldiers and angels.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-violet-200">2. Upgrade your weapons and armour</h2>
        {(["weapons", "armour"] as const).map((what) => {
          const level = what === "weapons" ? weapons : armour;
          const set = what === "weapons" ? setWeapons : setArmour;
          return (
            <div key={what} className="mb-2">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-violet-100">
                <Shield className="size-3.5" /> {what === "weapons" ? "Weapons: +20% damage a level" : "Armour: +20% health a level"}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: UPGRADE_MAX + 1 }, (_, l) => (
                  <button key={l} onClick={() => set(l)} className={cn("rounded-xl px-1 py-1.5 text-center", l === level ? "bg-violet-400 text-[#140a2e]" : "bg-white/5 text-violet-100")}>
                    <div className="text-xs font-semibold">{UPGRADE_NAMES[what][l]}</div>
                    <div className="text-[10px] opacity-80">{l ? cash(UPGRADE_COST[l]) : "Free"}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-violet-200">3. Pick where you start</h2>
        <div className="relative mx-auto aspect-square w-full max-w-[280px] rounded-full bg-[radial-gradient(circle,#2a1650,#0b0620)] ring-2 ring-violet-400/40">
          <div className="absolute inset-0 flex items-center justify-center px-16 text-center text-xs text-violet-200">Every army marches to the middle. Pick your gate.</div>
          {Array.from({ length: GATES }, (_, g) => {
            const [ux, uy] = gateDir(g);
            return (
              <button
                key={g}
                onClick={() => setGate(g)}
                style={{ left: `${50 + ux * 42}%`, top: `${50 + uy * 42}%` }}
                className={cn("absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full text-sm font-bold", gate === g ? "bg-gold text-[#140a2e] shadow-[0_0_16px_#ffc53d]" : "bg-white/10 text-violet-100")}
                aria-label={`Gate ${gateLabel(g)}`}
              >
                {gateLabel(g)}
              </button>
            );
          })}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-[#0b0620]/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          <div className="mb-2 flex items-baseline justify-between text-sm text-violet-100">
            <span>
              {size} fighters · <b className="text-gold">{cash(cost)}</b>
              {saved && diff !== 0 && <span className="text-xs"> ({diff > 0 ? `+${cash(diff)}` : `${cash(-diff)} back`})</span>}
            </span>
            {canSpend !== null && <span className="text-xs">You have {cash(canSpend)}</span>}
          </div>
          {!me.signedIn ? (
            <Link href="/?signin=1" className="block rounded-2xl bg-violet-400 py-3 text-center font-bold text-[#140a2e]">
              Sign in to fight
            </Link>
          ) : (
            <div className="flex gap-2">
              {saved && (
                <button onClick={leave} disabled={busy} className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                  Leave
                </button>
              )}
              <button
                onClick={save}
                disabled={busy || !size || gate === null || tooDear || cost > MAX_SPEND || !changed}
                className="flex-1 rounded-2xl bg-violet-400 py-3 font-bold text-[#140a2e] shadow-[0_0_24px_rgba(167,139,250,0.5)] disabled:opacity-40 disabled:shadow-none"
              >
                {busy
                  ? "…"
                  : !size
                    ? "Buy at least one fighter"
                    : gate === null
                      ? "Pick your gate"
                      : cost > MAX_SPEND
                        ? `Most an army can cost: ${cash(MAX_SPEND)}`
                        : tooDear
                          ? "Not enough money"
                          : saved
                            ? changed
                              ? "Save my army"
                              : `Ready for ${hourLabel(me.next.at)}`
                            : `Enter the realm at ${hourLabel(me.next.at)}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
