"use client";

import { OnTop } from "../on-top";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ArrowLeft, Check, Dices, LoaderCircle, Minus, Plus, Scissors, Shuffle, Undo2, Combine, PencilRuler } from "lucide-react";
import { X } from "@/components/icons";
import { cn } from "@/lib/cn";
import {
  BUILDER_SIZES,
  CELL_M,
  POOLS,
  ROOM_KINDS,
  ROOM_LABEL,
  ROOM_NAIRA,
  ROOM_STYLES,
  SIZES,
  STRUCTURES,
  STRUCTURE_ORDER,
  buildHouse,
  canSplit,
  defaultRooms,
  floorName,
  joinRoom,
  joinable,
  maxRoomsOn,
  planBill,
  planM2,
  refurnish,
  relayoutFloor,
  roomFits,
  roomMin,
  roomStyle,
  setFloorCount,
  setRoomKind,
  setRoomStyle,
  shapeOf,
  sizeFits,
  splitRoom,
  startPaid,
  storeyM2,
  wingsOf,
  type HomePlan,
  type HomeSize,
  type PlanPaid,
  type PlanRoom,
  type RoomKind,
  type StructureId,
} from "@/lib/home-plan";
import { cash } from "@/lib/world/value";
import { loadHomePlan, saveHomePlan } from "../life/home-plan-actions";
import { useEscape } from "../menu/escape";
import { STOREY_M, buildHome } from "./home3d";

// The house builder (docs/HOME_BUILDER.md): pick a kind of house, its size and its floors, then go
// floor by floor: how many rooms (laid out for you, a new layout a tap away), and for each room
// what it's for and its style, every room furnished as it changes. All in 3D, paid for at the end.

const STEPS = ["House", "Size", "Floors", "Rooms", "Build"] as const;

const ROOM_ICON: Record<RoomKind, string> = {
  living: "🛋️",
  bedroom: "🛏️",
  kitchen: "🍳",
  bathroom: "🛁",
  dining: "🍽️",
  study: "📚",
  hall: "🚪",
  balcony: "🌿",
  dancehall: "🪩",
  cinema: "🎬",
  gym: "🏋️",
  games: "🎱",
  bar: "🍸",
  pool: "🏊",
};
/** Short names for the room buttons. */
const ROOM_SHORT: Record<RoomKind, string> = {
  living: "Living",
  bedroom: "Bedroom",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  dining: "Dining",
  study: "Study",
  hall: "Hall",
  balcony: "Balcony",
  dancehall: "Dance hall",
  cinema: "Cinema",
  gym: "Gym",
  games: "Games",
  bar: "Bar",
  pool: "Pool",
};
const STYLE_ICON = ["🏛️", "◼️", "✨", "🧸"];
const STYLE_HINT = ["Warm wood and soft colours", "Clean lines, greys and black", "Marble, gold and a chandelier", "Rugs, lamps and plants"];

const m2 = (r: Pick<PlanRoom, "w" | "d">) => Math.round(r.w * r.d * CELL_M * CELL_M);
const metres = (r: Pick<PlanRoom, "w" | "d">) => `${+(r.w * CELL_M).toFixed(1)} × ${+(r.d * CELL_M).toFixed(1)} m`;

export function HomeBuilder({ onClose, onFineTune, onAddMoney }: { onClose: () => void; onFineTune?: (plan: HomePlan) => void; onAddMoney?: () => void }) {
  useEscape(onClose);
  const [plan, setPlanNow] = useState<HomePlan | null>(null);
  const [history, setHistory] = useState<HomePlan[]>([]);
  const [paid, setPaid] = useState<PlanPaid>(() => startPaid());
  const [perMint, setPerMint] = useState(1500);
  const [owner, setOwner] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 9999));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [built, setBuilt] = useState<number | null>(null);
  /** What building can be paid from (mint; null: not known), and the "not enough money" card. */
  const [canSpend, setCanSpend] = useState<number | null>(null);
  const [short, setShort] = useState<{ cost: number; have: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void loadHomePlan()
      .then((r) => {
        if (!alive) return;
        if (!r.ok) return setLoadError(r.error);
        setPlanNow(r.plan);
        setPaid(r.paid);
        setPerMint(r.perMint);
        setOwner(r.owner);
        setCanSpend(r.canSpend);
      })
      .catch(() => alive && setLoadError("The connection blinked. Close this and try again."));
    return () => {
      alive = false;
    };
  }, []);

  const money = (naira: number) => cash(naira / perMint);
  const bill = useMemo(() => (plan ? planBill(plan, paid) : null), [plan, paid]);

  /** Change the plan (Undo brings back the one before). */
  const change = (next: HomePlan) => {
    if (!plan || next === plan) return;
    setHistory((h) => [...h.slice(-30), plan]);
    setPlanNow(next);
    setNote(null);
  };
  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setPlanNow(prev);
    setPick(null);
  };
  const nextSeed = () => {
    const s = seed + 1;
    setSeed(s);
    return s;
  };

  if (loadError)
    return (
      <Shell onClose={onClose}>
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div>
            <p className="text-4xl">🏗️</p>
            <p className="mt-2 font-semibold">{loadError}</p>
            <button onClick={onClose} className="mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">
              Close
            </button>
          </div>
        </div>
      </Shell>
    );
  if (!plan || !bill)
    return (
      <Shell onClose={onClose}>
        <div className="grid flex-1 place-items-center">
          <LoaderCircle className="size-6 animate-spin text-muted" />
        </div>
      </Shell>
    );

  const structure = plan.structure ? STRUCTURES[plan.structure] : null;
  const shape = shapeOf(plan);
  const fl = plan.floors[Math.min(level, plan.floors.length - 1)];
  const room = pick != null ? fl.rooms.find((r) => r.id === pick) : undefined;
  const roomsHere = fl.rooms.filter((r) => r.kind !== "hall").length;
  const pools = plan.floors.reduce((a, f) => a + f.items.filter((i) => POOLS.has(i.kind)).length, 0);
  const canNext = step === 0 ? !!plan.structure : true;

  const chooseStructure = (id: StructureId) => {
    const st = STRUCTURES[id];
    // Keep the size you'd picked if this kind of house works at it.
    const size = plan.structure && sizeFits(st.shape, plan.size) && BUILDER_SIZES.includes(plan.size) ? plan.size : st.size;
    change(buildHouse(id, size, st.floors, nextSeed()));
    setLevel(0);
    setPick(null);
  };
  const chooseSize = (size: HomeSize) => {
    if (!plan.structure) return;
    change(buildHouse(plan.structure, size, plan.floors.length, seed));
    setPick(null);
  };
  const go = (to: number) => {
    setStep(Math.max(0, Math.min(STEPS.length - 1, to)));
    setPick(null);
    setNote(null);
    if (to === 3) setLevel(0);
  };

  async function build() {
    if (!plan || !bill || busy) return;
    // Not enough to pay for it: say so straight away (the server checks again).
    const cost = bill.naira / perMint;
    if (canSpend != null && cost > canSpend + 0.005) return setShort({ cost, have: canSpend });
    setBusy(true);
    const r = await saveHomePlan(plan).catch(() => ({ ok: false as const, error: "The connection blinked. Try again.", short: undefined }));
    setBusy(false);
    if (!r.ok) {
      if (r.short) {
        setCanSpend(r.short.have);
        return setShort(r.short);
      }
      return setNote({ text: r.error, bad: true });
    }
    if (canSpend != null) setCanSpend(Math.max(0, canSpend - r.paidMint));
    setPaid(r.paid);
    setBuilt(r.paidMint);
    window.dispatchEvent(new Event("nt-home-plan-saved"));
  }

  if (built != null)
    return (
      <Shell onClose={onClose}>
        <div className="relative flex-1">
          <HouseView plan={plan} upTo={plan.floors.length - 1} pick={null} spin />
        </div>
        <div className="start-pop space-y-3 border-t border-line bg-panel p-4 text-center">
          <p className="text-4xl">🎉</p>
          <p className="font-display text-2xl font-extrabold">{structure ? `Your ${structure.label} is ready!` : "Your home is ready!"}</p>
          <p className="text-sm text-muted">
            {built > 0 ? `${cash(built)} well spent. Your home is worth more now, and it's yours to walk round.` : "Saved. Walk in and have a look round."}
          </p>
          <button onClick={onClose} className="h-12 w-full rounded-full bg-gold font-bold text-ink">
            Lovely
          </button>
        </div>
      </Shell>
    );

  return (
    <Shell
      onClose={onClose}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{STEPS[step] === "House" ? "Upgrade your home" : (structure?.label ?? "Your home")}</span>
          {bill.naira > 0 && <span className="shrink-0 rounded-full bg-gold/25 px-2 py-0.5 text-xs font-bold text-ink">{money(bill.naira)}</span>}
        </span>
      }
      extra={
        history.length > 0 && (
          <button onClick={undo} className="grid size-9 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Undo">
            <Undo2 className="size-5" />
          </button>
        )
      }
    >
      {/* The house in 3D: turning slowly while you choose its kind, size and floors; one floor
          at a time (tap a room) while you do its rooms. */}
      <div className="relative min-h-0 flex-1 bg-[#dfe9f3]">
        <HouseView plan={plan} upTo={step === 3 ? level : plan.floors.length - 1} pick={step === 3 ? pick : null} spin={step < 3} onPick={step === 3 ? (id) => setPick((p) => (p === id ? null : id)) : undefined} />
        {step === 3 && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white">{room ? `${ROOM_ICON[room.kind]} ${ROOM_LABEL[room.kind]}` : "Tap a room to change it"}</span>
          </div>
        )}
        {step < 3 && structure && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-ink shadow">
              {plan.floors.length} floor{plan.floors.length > 1 ? "s" : ""} · {Math.round(planM2(plan)).toLocaleString("en-GB")} m² · {plan.floors.reduce((a, f) => a + f.rooms.length - 1, 0)} rooms{pools ? ` · ${pools} pool${pools > 1 ? "s" : ""}` : ""}
            </span>
          </div>
        )}
      </div>

      <div className="max-h-[58%] shrink-0 overflow-y-auto border-t border-line bg-panel">
        {/* Where you are: five steps. */}
        <div className="flex items-center gap-1 px-4 pt-3">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => (i <= step || canNext) && plan.structure && go(i)} className="flex flex-1 flex-col items-center gap-1" disabled={!plan.structure && i > 0}>
              <span className={cn("h-1.5 w-full rounded-full", i <= step ? "bg-gold" : "bg-ink/10")} />
              <span className={cn("text-[10px] font-semibold", i === step ? "text-ink" : "text-muted")}>{s}</span>
            </button>
          ))}
        </div>

        <div key={step} className="start-pop space-y-3 p-4">
          {step === 0 && (
            <>
              <Heading title="What kind of house?" hint="It changes the shape of your home and how many floors it starts with. You can add floors later." />
              <div className="grid grid-cols-2 gap-2">
                {STRUCTURE_ORDER.map((id) => {
                  const st = STRUCTURES[id];
                  const on = plan.structure === id;
                  const had = paid.builds?.includes(id);
                  return (
                    <button
                      key={id}
                      onClick={() => !on && chooseStructure(id)}
                      className={cn("flex flex-col items-start gap-1.5 rounded-2xl border p-3 text-left transition", on ? "border-gold bg-gold/15 ring-2 ring-gold" : "border-line bg-panel-2/50")}
                    >
                      <span className="flex w-full items-center justify-between">
                        <ShapeIcon structure={id} />
                        <span className="text-[10px] font-bold text-muted">
                          {st.floors} floor{st.floors > 1 ? "s" : ""}
                          {st.pool ? " · 🏊" : ""}
                        </span>
                      </span>
                      <span className="font-display text-sm font-bold leading-tight">{st.label}</span>
                      <span className="text-[11px] leading-snug text-muted">{st.blurb}</span>
                      <span className="text-xs font-bold text-ink">{had ? "Yours already" : st.naira ? `Design ${money(st.naira)}` : "No design fee"}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 1 && structure && (
            <>
              <Heading title="How big inside?" hint="Only the inside grows. Your building on the map stays as it is, so go as big as you like." />
              <div className="space-y-2">
                {BUILDER_SIZES.filter((s) => sizeFits(structure.shape, s)).map((s) => {
                  const on = plan.size === s;
                  const area = storeyM2(structure.shape, s);
                  return (
                    <button key={s} onClick={() => !on && chooseSize(s)} className={cn("flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left", on ? "border-gold bg-gold/15 ring-2 ring-gold" : "border-line")}>
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-panel-2 font-display text-sm font-extrabold">{SIZES[s].name[0]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{SIZES[s].name}</span>
                        <span className="block text-xs text-muted">
                          {SIZES[s].w * CELL_M} × {SIZES[s].d * CELL_M} m · {Math.round(area)} m² a floor · up to {maxRoomsOn({ structure: plan.structure, size: s })} rooms a floor
                        </span>
                      </span>
                      {on && <Check className="size-5 text-gold" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 2 && structure && (
            <>
              <Heading title="How many floors?" hint={`This house comes with ${structure.floors} floor${structure.floors > 1 ? "s" : ""} and can have up to ${structure.maxFloors}. The stairs go in for you.`} />
              <div className="flex items-center justify-center gap-5 py-2">
                <RoundButton label="One floor less" disabled={plan.floors.length <= 1} onClick={() => change(setFloorCount(plan, plan.floors.length - 1, seed))}>
                  <Minus className="size-6" />
                </RoundButton>
                <div className="text-center">
                  <p className="font-display text-5xl font-extrabold leading-none">{plan.floors.length}</p>
                  <p className="mt-1 text-xs text-muted">floor{plan.floors.length > 1 ? "s" : ""} · {Math.round(planM2(plan)).toLocaleString("en-GB")} m²</p>
                </div>
                <RoundButton label="One more floor" disabled={plan.floors.length >= structure.maxFloors} onClick={() => change(setFloorCount(plan, plan.floors.length + 1, seed))}>
                  <Plus className="size-6" />
                </RoundButton>
              </div>
              <p className="text-center text-xs text-muted">Each new floor costs about {money(storeyM2(shape, plan.size) * 180_000)} to build and adds to your home&apos;s value.</p>
            </>
          )}

          {step === 3 && (
            <>
              {/* The floors, one at a time. */}
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
                {plan.floors.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setLevel(i);
                      setPick(null);
                    }}
                    className={cn("shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold", i === level ? "bg-ink text-white" : "bg-panel-2 text-muted")}
                  >
                    {floorName(i)}
                  </button>
                ))}
              </div>
              {!room ? (
                <>
                  <div className="flex items-center gap-3 rounded-2xl bg-panel-2/60 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">Rooms on this floor</p>
                      <p className="text-xs text-muted">Laid out and furnished for you, plus the hall with the stairs.</p>
                    </div>
                    <RoundButton small label="Fewer rooms" disabled={roomsHere <= 1} onClick={() => change(relayoutFloor(plan, level, roomsHere - 1, seed))}>
                      <Minus className="size-4" />
                    </RoundButton>
                    <span className="w-6 text-center font-display text-xl font-extrabold">{roomsHere}</span>
                    <RoundButton small label="More rooms" disabled={roomsHere >= maxRoomsOn(plan)} onClick={() => change(relayoutFloor(plan, level, roomsHere + 1, seed))}>
                      <Plus className="size-4" />
                    </RoundButton>
                  </div>
                  <button onClick={() => change(relayoutFloor(plan, level, roomsHere || defaultRooms(plan), nextSeed()))} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink text-sm font-semibold text-white">
                    <Shuffle className="size-4" /> Try another layout
                  </button>
                  <div className="grid grid-cols-2 gap-1.5">
                    {fl.rooms.map((r) => (
                      <button key={r.id} onClick={() => setPick(r.id)} className="flex items-center gap-2 rounded-xl border border-line px-2.5 py-2 text-left">
                        <span className="text-lg">{ROOM_ICON[r.kind]}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{ROOM_LABEL[r.kind]}</span>
                          <span className="block text-[11px] text-muted">
                            {m2(r)} m² · {ROOM_STYLES[roomStyle(r)]}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {onFineTune && (
                    <button onClick={() => onFineTune(plan)} className="flex w-full items-center justify-center gap-1.5 py-1 text-xs font-semibold text-muted underline">
                      <PencilRuler className="size-3.5" /> Move furniture yourself (optional)
                    </button>
                  )}
                </>
              ) : (
                <RoomPanel
                  plan={plan}
                  level={level}
                  room={room}
                  money={money}
                  onBack={() => setPick(null)}
                  onKind={(k) => change(setRoomKind(plan, level, room.id, k, nextSeed()))}
                  onStyle={(st) => change(setRoomStyle(plan, level, room.id, st, nextSeed()))}
                  onShuffle={() => change(refurnish(plan, level, room.id, nextSeed()))}
                  onSplit={() => {
                    change(splitRoom(plan, level, room.id, nextSeed()));
                  }}
                  onJoin={() => change(joinRoom(plan, level, room.id, nextSeed()))}
                />
              )}
            </>
          )}

          {step === 4 && (
            <>
              <Heading title="Ready to build?" hint={owner ? "Builders, pools and furniture are paid from your savings, then your wallet. What you've paid for before is free." : "You rent this home, so you can rearrange it, but building onto it is for the owner."} />
              <div className="rounded-2xl bg-panel-2/60 p-3 text-sm">
                <p className="font-semibold">
                  {structure?.label ?? "Your home"} · {SIZES[plan.size].name} · {plan.floors.length} floor{plan.floors.length > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted">
                  {Math.round(planM2(plan)).toLocaleString("en-GB")} m² · {plan.floors.reduce((a, f) => a + f.rooms.length, 0)} rooms
                  {pools ? ` · ${pools} pool${pools > 1 ? "s" : ""}` : ""}
                </p>
              </div>
              {bill.lines.length ? (
                <div className="divide-y divide-line rounded-2xl border border-line">
                  {bill.lines.slice(0, 8).map((l) => (
                    <div key={l.label} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        {l.label}
                        {l.count > 1 ? ` × ${l.count}` : ""}
                      </span>
                      <span className="shrink-0 font-semibold">{money(l.naira)}</span>
                    </div>
                  ))}
                  {bill.lines.length > 8 && (
                    <div className="flex items-center justify-between px-3 py-2 text-sm text-muted">
                      <span>Furniture and more ({bill.lines.length - 8})</span>
                      <span>{money(bill.lines.slice(8).reduce((a, l) => a + l.naira, 0))}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between bg-gold/15 px-3 py-2.5 font-bold">
                    <span>Total</span>
                    <span>{money(bill.naira)}</span>
                  </div>
                </div>
              ) : (
                <p className="rounded-2xl bg-me/10 p-3 text-sm">Nothing new to pay for. Saving just rearranges your home.</p>
              )}
              {bill.valueNaira > 0 && <p className="text-xs text-muted">It adds about {money(bill.valueNaira)} to your home&apos;s value.</p>}
              {canSpend != null && bill.naira > 0 && (
                <p className={cn("rounded-xl px-3 py-2 text-sm", bill.naira / perMint > canSpend + 0.005 ? "bg-hit/10 text-hit" : "bg-me/10")}>
                  You have <b>{cash(canSpend)}</b> in your savings and wallet
                  {bill.naira / perMint > canSpend + 0.005 ? `, ${cash(bill.naira / perMint - canSpend)} short.` : ". Enough to build it."}
                </p>
              )}
            </>
          )}

          {note && <p className={cn("rounded-xl px-3 py-2 text-sm", note.bad ? "bg-hit/10 text-hit" : "bg-me/10")}>{note.text}</p>}
        </div>

        {/* Back and next (or build). */}
        {!(step === 3 && room) && (
          <div className="sticky bottom-0 flex gap-2 border-t border-line bg-panel p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {step > 0 && (
              <button onClick={() => go(step - 1)} className="flex h-12 items-center gap-1 rounded-full border border-line px-4 font-semibold">
                <ArrowLeft className="size-4" /> Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button onClick={() => go(step + 1)} disabled={!canNext} className="h-12 flex-1 rounded-full bg-gold font-bold text-ink disabled:opacity-50">
                {step === 0 && !plan.structure ? "Pick a kind of house" : step === 3 ? "Review and build" : "Next"}
              </button>
            ) : (
              <button onClick={() => void build()} disabled={busy || (!owner && bill.naira > 0)} className="h-12 flex-1 rounded-full bg-gold font-bold text-ink disabled:opacity-50">
                {busy ? "Building…" : bill.naira > 0 ? `Build it for ${money(bill.naira)}` : "Save my home"}
              </button>
            )}
          </div>
        )}
      </div>
      {short && (
        <OnTop className="fixed inset-0 grid place-items-end bg-black/40 p-3 sm:place-items-center" onClick={() => setShort(null)}>
          <div className="start-pop w-full max-w-sm rounded-3xl bg-panel p-5 text-center shadow-xl" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label="Not enough money">
            <p className="text-4xl">💸</p>
            <p className="mt-2 font-display text-xl font-extrabold">Not enough money yet</p>
            <p className="mt-1 text-sm text-muted">
              Building this costs <b className="text-ink">{cash(short.cost)}</b>. You have <b className="text-ink">{cash(short.have)}</b> in your savings and wallet, so you&apos;re{" "}
              <b className="text-hit">{cash(Math.max(0, short.cost - short.have))}</b> short.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {onAddMoney && (
                <button onClick={onAddMoney} className="h-12 rounded-full bg-gold font-bold text-ink">
                  Add money
                </button>
              )}
              <button
                onClick={() => {
                  setShort(null);
                  go(0);
                }}
                className="h-12 rounded-full bg-ink font-semibold text-white"
              >
                Make it smaller or simpler
              </button>
              <button onClick={() => setShort(null)} className="h-10 text-sm font-semibold text-muted">
                Not now
              </button>
            </div>
          </div>
        </OnTop>
      )}
    </Shell>
  );
}

/** One room: what it's for, its style, a new arrangement, split it or knock through. */
function RoomPanel({
  plan,
  level,
  room,
  money,
  onBack,
  onKind,
  onStyle,
  onShuffle,
  onSplit,
  onJoin,
}: {
  plan: HomePlan;
  level: number;
  room: PlanRoom;
  money: (naira: number) => string;
  onBack: () => void;
  onKind: (k: RoomKind) => void;
  onStyle: (s: number) => void;
  onShuffle: () => void;
  onSplit: () => void;
  onJoin: () => void;
}) {
  const hall = room.kind === "hall";
  const next = joinable(plan.floors[level], room.id);
  const style = roomStyle(room);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="grid size-9 shrink-0 place-items-center rounded-full bg-panel-2" aria-label="Back to the floor">
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-bold leading-tight">
            {ROOM_ICON[room.kind]} {ROOM_LABEL[room.kind]}
          </p>
          <p className="text-xs text-muted">
            {metres(room)} · {m2(room)} m²
          </p>
        </div>
        <button onClick={onBack} className="h-9 shrink-0 rounded-full bg-gold px-4 text-sm font-bold text-ink">
          Done
        </button>
      </div>

      {!hall && (
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">This room is a…</p>
          <div className="grid grid-cols-4 gap-1.5">
            {ROOM_KINDS.filter((k) => k !== "hall").map((k) => {
              const fits = roomFits(room, k);
              const on = room.kind === k;
              return (
                <button
                  key={k}
                  onClick={() => fits && !on && onKind(k)}
                  disabled={!fits}
                  title={fits ? undefined : `Needs a room at least ${roomMin(k) * CELL_M} × ${roomMin(k) * CELL_M} m`}
                  className={cn("flex flex-col items-center gap-0.5 rounded-xl border px-1 py-1.5 text-center", on ? "border-gold bg-gold/15 ring-2 ring-gold" : "border-line", !fits && "opacity-35")}
                >
                  <span className="text-lg leading-none">{ROOM_ICON[k]}</span>
                  <span className="text-[10px] font-semibold leading-tight">{ROOM_SHORT[k]}</span>
                  {ROOM_NAIRA[k] && <span className="text-[9px] text-muted">{money(ROOM_NAIRA[k]!)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">Style</p>
        <div className="grid grid-cols-4 gap-1.5">
          {ROOM_STYLES.map((name, i) => (
            <button key={name} onClick={() => i !== style && onStyle(i)} className={cn("flex flex-col items-center gap-0.5 rounded-xl border px-1 py-1.5", i === style ? "border-gold bg-gold/15 ring-2 ring-gold" : "border-line")}>
              <span className="text-lg leading-none">{STYLE_ICON[i]}</span>
              <span className="text-[11px] font-semibold">{name}</span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted">{STYLE_HINT[style]}.</p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <SmallAction onClick={onShuffle} icon={<Dices className="size-4" />} label="Rearrange" />
        <SmallAction onClick={onSplit} disabled={!canSplit(room)} icon={<Scissors className="size-4" />} label="Split in two" />
        <SmallAction onClick={onJoin} disabled={!next} icon={<Combine className="size-4" />} label={next ? `Join the ${ROOM_SHORT[next.kind].toLowerCase()}` : "Join next door"} />
      </div>
    </div>
  );
}

function SmallAction({ onClick, icon, label, disabled }: { onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-panel-2 px-1 text-[11px] font-semibold leading-tight disabled:opacity-35">
      {icon}
      <span className="line-clamp-1">{label}</span>
    </button>
  );
}

function RoundButton({ children, onClick, disabled, label, small }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string; small?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className={cn("grid shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-25", small ? "size-9" : "size-14")}>
      {children}
    </button>
  );
}

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <p className="font-display text-xl font-bold leading-tight">{title}</p>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
    </div>
  );
}

function Shell({ children, onClose, title, extra }: { children: React.ReactNode; onClose: () => void; title?: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-panel" role="dialog" aria-label="Upgrade your home">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <h2 className="min-w-0 flex-1 font-display text-base font-bold">{title ?? "Upgrade your home"}</h2>
        {extra}
        <button onClick={onClose} className="grid size-9 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      {children}
    </div>
  );
}

/** A house type's shape from above, with its floors shown as layers behind. */
function ShapeIcon({ structure }: { structure: StructureId }) {
  const st = STRUCTURES[structure];
  const size: HomeSize = sizeFits(st.shape, "large") ? "large" : "grand";
  const { w, d } = SIZES[size];
  const k = 34 / Math.max(w, d);
  const wings = wingsOf(st.shape, size);
  const layers = Math.min(3, st.floors);
  return (
    <svg width="44" height="40" viewBox="0 0 44 40" aria-hidden>
      {Array.from({ length: layers }, (_, i) => layers - 1 - i).map((l) => (
        <g key={l} transform={`translate(${2 + l * 3} ${4 - l * 3 + 2})`} opacity={l ? 0.45 : 1}>
          {wings.map((g, j) => (
            <rect key={j} x={g.x * k} y={g.y * k} width={g.w * k} height={g.d * k} fill={l ? "#c9b48a" : "#f5c242"} stroke="#7a5b16" strokeWidth={0.8} rx={1} />
          ))}
        </g>
      ))}
      {st.pool && <rect x={2 + w * k * 0.55} y={8 + d * k * 0.15} width={w * k * 0.25} height={d * k * 0.18} fill="#3bc9db" rx={1} />}
    </svg>
  );
}

/**
 * The house in 3D. `spin`: turns slowly by itself (until you drag). `onPick`: tap a room on the
 * floor you're on.
 */
function HouseView({ plan, upTo, pick, spin, onPick }: { plan: HomePlan; upTo: number; pick: number | null; spin?: boolean; onPick?: (roomId: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    sun: THREE.DirectionalLight;
    home: ReturnType<typeof buildHome> | null;
    target: THREE.Vector3;
    fit: number;
  } | null>(null);
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  // The renderer, once.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      el.textContent = "This phone can't show 3D just now.";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#dfe9f3");
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d7b68, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1e0, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    scene.add(sun.target);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#a9c99a" }));
    ground.position.y = -0.14;
    ground.receiveShadow = true;
    scene.add(ground);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.autoRotateSpeed = 0.9;
    const target = new THREE.Vector3();
    live.current = { scene, camera, controls, sun, home: null, target, fit: 0 };
    let raf = 0;
    const size = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    // Stop turning by itself once you take hold of it.
    const hold = () => (controls.autoRotate = false);
    controls.addEventListener("start", hold);
    // A tap (not a drag) on a room picks it.
    let down: { x: number; y: number } | null = null;
    const ray = new THREE.Raycaster();
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      const l = live.current;
      if (!down || !l?.home || !pickRef.current) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 8) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(l.home.floors, false)[0];
      const id = hit?.object.userData.roomId as number | undefined;
      if (id != null) pickRef.current(id);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.target.lerp(target, 0.12);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.removeEventListener("start", hold);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      live.current?.home?.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      live.current = null;
    };
  }, []);

  useEffect(() => {
    const l = live.current;
    if (l) l.controls.autoRotate = !!spin;
  }, [spin]);

  // The home, rebuilt when the plan, the floor or the picked room changes; the camera pulled back
  // to fit a bigger home.
  useEffect(() => {
    const l = live.current;
    if (!l) return;
    if (l.home) {
      l.scene.remove(l.home.group);
      l.home.dispose();
    }
    l.home = buildHome(plan, upTo, 1.3, false, pick);
    l.scene.add(l.home.group);
    const { w, d } = SIZES[plan.size];
    const span = Math.max(w, d) * CELL_M;
    l.target.set(0, upTo * STOREY_M, 0);
    const half = span * 0.75 + 2;
    Object.assign(l.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, far: span * 4 + 40 });
    l.sun.shadow.camera.updateProjectionMatrix();
    l.sun.position.set(span * 0.5, span + 12, span * 0.7);
    l.controls.minDistance = 4;
    l.controls.maxDistance = span * 3 + 20;
    // Re-frame when the home's size changes, or between the whole house and one floor (not on
    // every little change). One floor at a time, the camera comes closer.
    const close = !!pickRef.current;
    const fit = span + upTo * 0.01 + (close ? 1000 : 0);
    if (Math.abs(l.fit - fit) > 0.001) {
      const dist = span * (close ? 0.85 : 1.25) + (close ? 3 : 6);
      l.camera.position.set(dist * 0.6, upTo * STOREY_M + dist * 0.75, dist * 0.8);
      l.fit = fit;
    }
  }, [plan, upTo, pick]);

  return <div ref={host} className="absolute inset-0 grid place-items-center text-sm text-muted" />;
}
