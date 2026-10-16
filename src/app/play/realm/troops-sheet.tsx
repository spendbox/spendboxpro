"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Plus, Shield } from "@/components/icons";
import { cn } from "@/lib/cn";
import { FIGHTERS, MAX_FIGHTERS, MAX_OF_KIND, MAX_SPEND, UPGRADE_COST, UPGRADE_MAX, UPGRADE_NAMES, armyCost, armySize, type Army, type FighterId } from "@/lib/realm/fighters";
import { cash } from "@/lib/world/value";
import { Sheet } from "../sheet";
import { drawFighter } from "./draw";

// Spirit mode: buy troops for the battle on the map (then pick where they come in). The last
// choice is kept, so sending the same again is two taps.

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
    <span className="w-11 text-[10px] uppercase tracking-wide text-muted">{label}</span>
    <span className="h-1 flex-1 overflow-hidden rounded-full bg-panel-2">
      <span className="block h-full rounded-full bg-[#7c3aed]" style={{ width: `${Math.min(100, Math.round((value / max) * 100))}%` }} />
    </span>
  </div>
);

export function TroopsSheet({ start, canSpend, leftInBattle, onClose, onChoose }: { start: Army; canSpend: number | null; leftInBattle: number; onClose: () => void; onChoose: (troops: Army) => void }) {
  const [fighters, setFighters] = useState<Army["fighters"]>(start.fighters);
  const [weapons, setWeapons] = useState(start.weapons);
  const [armour, setArmour] = useState(start.armour);
  const troops: Army = { fighters, weapons, armour };
  const cost = armyCost(troops);
  const size = armySize(troops);
  const limit = Math.min(MAX_SPEND, leftInBattle);
  const tooDear = (canSpend !== null && cost > canSpend) || cost > limit;

  const add = (id: FighterId, by: number) =>
    setFighters((cur) => {
      const now = cur[id] ?? 0;
      const others = armySize({ fighters: cur, weapons: 0, armour: 0 }) - now;
      return { ...cur, [id]: Math.max(0, Math.min(MAX_OF_KIND, MAX_FIGHTERS - others, now + by)) };
    });

  return (
    <Sheet onClose={onClose} title="Send troops" wide>
      <div className="space-y-4 pb-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FIGHTERS.map((f) => {
            const n = fighters[f.id] ?? 0;
            return (
              <div key={f.id} className={cn("flex gap-2.5 rounded-2xl p-2.5", n ? "bg-[#ede9fe] ring-1 ring-[#7c3aed]/40" : "bg-panel-2")}>
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[#1e1037]">
                  <FighterIcon kind={f.id} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-ink">{f.name}</span>
                    <span className="text-xs font-bold text-gold-dark">{cash(f.cost)}</span>
                  </div>
                  <p className="text-xs leading-snug text-muted">{f.blurb}</p>
                  <div className="mt-1 space-y-0.5">
                    <MiniBar label="Health" value={f.hp} max={1200} />
                    <MiniBar label="Power" value={f.atk} max={75} />
                    <MiniBar label="Speed" value={f.speed} max={12} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button onClick={() => add(f.id, -1)} disabled={!n} className="size-8 rounded-lg bg-white text-lg font-bold text-ink shadow-sm disabled:opacity-30" aria-label={`One fewer ${f.name}`}>
                      −
                    </button>
                    <span className="w-9 text-center font-bold tabular-nums text-ink">{n}</span>
                    <button onClick={() => add(f.id, 1)} className="flex size-8 items-center justify-center rounded-lg bg-[#7c3aed] text-white" aria-label={`One more ${f.name}`}>
                      <Plus className="size-4" />
                    </button>
                    <button onClick={() => add(f.id, 10)} className="h-8 rounded-lg bg-white px-2 text-xs font-semibold text-ink shadow-sm">
                      +10
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted">Angels beat devils and ghosts; swords pass through ghosts; devils burn soldiers and angels. Up to {MAX_OF_KIND} of each kind.</p>

        {(["weapons", "armour"] as const).map((what) => {
          const level = what === "weapons" ? weapons : armour;
          const set = what === "weapons" ? setWeapons : setArmour;
          return (
            <div key={what}>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Shield className="size-3.5" /> {what === "weapons" ? "Weapons: +20% damage a level" : "Armour: +20% health a level"}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: UPGRADE_MAX + 1 }, (_, l) => (
                  <button key={l} onClick={() => set(l)} className={cn("rounded-xl px-1 py-1.5 text-center", l === level ? "bg-[#7c3aed] text-white" : "bg-panel-2 text-ink")}>
                    <div className="text-xs font-semibold">{UPGRADE_NAMES[what][l]}</div>
                    <div className="text-[10px] opacity-80">{l ? cash(UPGRADE_COST[l]) : "Free"}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <div className="sticky bottom-0 -mx-1 rounded-2xl bg-panel px-1 pt-2">
          <div className="mb-2 flex items-baseline justify-between text-sm text-ink">
            <span>
              {size} troops · <b className="text-gold-dark">{cash(cost)}</b>
            </span>
            {canSpend !== null && <span className="text-xs text-muted">You have {cash(canSpend)}</span>}
          </div>
          <button
            onClick={() => onChoose(troops)}
            disabled={!size || tooDear}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#7c3aed] py-3 font-bold text-white disabled:opacity-40"
          >
            <MapPin className="size-4" />
            {!size ? "Pick some troops" : cost > limit ? `At most ${cash(limit)} more this battle` : tooDear ? "Not enough money" : "Choose where they come in"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
