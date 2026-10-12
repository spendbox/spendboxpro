"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, Copy, LoaderCircle, Minus, Plus, RotateCw, Trash2, Undo2 } from "lucide-react";
import { X } from "@/components/icons";
import { cn } from "@/lib/cn";
import {
  FURNITURE,
  MAX_FLOORS,
  ROOM_FLOOR,
  ROOM_KINDS,
  ROOM_LABEL,
  SIZES,
  clashes,
  itemSize,
  nextId,
  starterPlan,
  type FurnitureKind,
  type HomePlan,
  type HomeSize,
  type PlanFloor,
  type RoomKind,
} from "@/lib/home-plan";
import { loadHomePlan, saveHomePlan } from "../life/home-plan-actions";
import { useEscape } from "../menu/escape";
import { STOREY_M, buildHome } from "./home3d";

// Plan your home (docs/HOME_PLANNER.md): a floor plan on half-metre squares. Draw rooms by
// dragging across the grid, put furniture in from the list and drag it into place (or nudge it a
// square at a time), turn it, stack up to four floors, then see it all in 3D. Saved to your
// account.

type Tool = "rooms" | "furniture";
type Sel = { type: "room" | "item"; id: number } | null;

const FLOOR_NAME = ["Ground floor", "First floor", "Second floor", "Third floor"];

export function HomePlanner({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  const [plan, setPlanNow] = useState<HomePlan | null>(null);
  const [history, setHistory] = useState<HomePlan[]>([]);
  const [floor, setFloor] = useState(0);
  const [tool, setTool] = useState<Tool>("furniture");
  const [roomKind, setRoomKind] = useState<RoomKind>("bedroom");
  const [sel, setSel] = useState<Sel>(null);
  const [view3d, setView3d] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    void loadHomePlan()
      .then((r) => {
        if (!alive) return;
        if (r.ok) setPlanNow(r.plan);
        else {
          setPlanNow(starterPlan());
          setNote({ text: r.error, bad: true });
        }
      })
      .catch(() => alive && setPlanNow(starterPlan()));
    return () => {
      alive = false;
    };
  }, []);

  /** Change the plan (undo remembers the one before). */
  const change = (fn: (p: HomePlan) => HomePlan) => {
    if (!plan) return;
    setHistory((h) => [...h.slice(-40), plan]);
    setPlanNow(fn(structuredClone(plan)));
    setDirty(true);
  };
  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setPlanNow(prev);
    setSel(null);
    setDirty(true);
  };
  async function save() {
    if (!plan) return;
    setBusy(true);
    const r = await saveHomePlan(plan).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusy(false);
    if (r.ok) setDirty(false);
    setNote(r.ok ? { text: "Saved. This is your home's plan now." } : { text: r.error, bad: true });
  }

  if (!plan)
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-panel">
        <LoaderCircle className="size-6 animate-spin text-muted" />
      </div>
    );

  const { w, d } = SIZES[plan.size];
  const fl = plan.floors[floor] ?? plan.floors[0];
  const bad = clashes(fl);
  const room = sel?.type === "room" ? fl.rooms.find((r) => r.id === sel.id) : undefined;
  const item = sel?.type === "item" ? fl.items.find((i) => i.id === sel.id) : undefined;
  const onFloor = (fn: (f: PlanFloor) => void) => change((p) => (fn(p.floors[floor]), p));

  /** Move or resize what's selected, kept inside the home. */
  const nudge = (dx: number, dy: number, grow = false) =>
    onFloor((f) => {
      if (sel?.type === "item") {
        const it = f.items.find((i) => i.id === sel.id);
        if (!it) return;
        const s = itemSize(it);
        it.x = Math.max(0, Math.min(w - s.w, it.x + dx));
        it.y = Math.max(0, Math.min(d - s.d, it.y + dy));
      } else if (sel?.type === "room") {
        const r = f.rooms.find((x) => x.id === sel.id);
        if (!r) return;
        if (grow) {
          r.w = Math.max(2, Math.min(w - r.x, r.w + dx));
          r.d = Math.max(2, Math.min(d - r.y, r.d + dy));
        } else {
          r.x = Math.max(0, Math.min(w - r.w, r.x + dx));
          r.y = Math.max(0, Math.min(d - r.d, r.y + dy));
        }
      }
    });

  function addItem(kind: FurnitureKind) {
    const f = FURNITURE[kind];
    const id = nextId(fl.items);
    // In the middle of the room you've picked (or of the home), on a free square if there's one.
    const box = room ?? { x: 0, y: 0, w, d };
    let at = { x: Math.max(0, Math.min(w - f.w, Math.round(box.x + box.w / 2 - f.w / 2))), y: Math.max(0, Math.min(d - f.d, Math.round(box.y + box.d / 2 - f.d / 2))) };
    for (let r = 0; r < Math.max(w, d); r++) {
      const spot = ring(at, r).find((p) => p.x >= 0 && p.y >= 0 && p.x + f.w <= w && p.y + f.d <= d && clashes({ rooms: [], items: [...fl.items, { id, kind, rot: 0, ...p }] }).size === bad.size);
      if (spot) {
        at = spot;
        break;
      }
    }
    onFloor((fl2) => fl2.items.push({ id, kind, rot: 0, ...at }));
    setSel({ type: "item", id });
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-panel" role="dialog" aria-label="Plan your home">
      {/* Top: close, title, undo, 2D / 3D, save */}
      <header className="flex shrink-0 items-center gap-1.5 border-b border-line px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          onClick={() => (!dirty || confirm("Leave without saving your changes?") ? onClose() : undefined)}
          className="grid size-9 place-items-center rounded-full hover:bg-panel-2"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
        <h2 className="min-w-0 flex-1 truncate font-display text-base font-bold">Plan your home</h2>
        <button onClick={undo} disabled={!history.length} className="grid size-9 place-items-center rounded-full hover:bg-panel-2 disabled:opacity-30" aria-label="Undo">
          <Undo2 className="size-4" />
        </button>
        <div className="flex rounded-full bg-panel-2 p-0.5 text-xs font-semibold">
          <button onClick={() => setView3d(false)} className={cn("rounded-full px-2.5 py-1", !view3d && "bg-ink text-white")}>
            2D
          </button>
          <button onClick={() => setView3d(true)} className={cn("flex items-center gap-1 rounded-full px-2.5 py-1", view3d && "bg-ink text-white")}>
            <Box className="size-3.5" /> 3D
          </button>
        </div>
        <button onClick={() => void save()} disabled={busy || !dirty} className="h-9 rounded-full bg-gold px-3.5 text-sm font-semibold text-ink disabled:opacity-50">
          {busy ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </header>

      {/* Floors */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:none]">
        {plan.floors.map((_, i) => (
          <button
            key={i}
            onClick={() => {
              setFloor(i);
              setSel(null);
            }}
            className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", i === floor ? "bg-ink text-white" : "bg-panel-2")}
          >
            {FLOOR_NAME[i]}
          </button>
        ))}
        {plan.floors.length < MAX_FLOORS && (
          <button
            onClick={() => {
              change((p) => (p.floors.push({ rooms: [], items: [] }), p));
              setFloor(plan.floors.length);
              setSel(null);
              setTool("rooms");
              setNote({ text: "A new floor. Put Stairs on the floor below to reach it, then draw its rooms." });
            }}
            className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-line px-3 py-1 text-xs font-semibold text-muted"
          >
            <Plus className="size-3.5" /> Add a floor
          </button>
        )}
        {floor > 0 && floor === plan.floors.length - 1 && (
          <button
            onClick={() => {
              if (!confirm(`Take away the ${FLOOR_NAME[floor].toLowerCase()} and everything on it?`)) return;
              change((p) => (p.floors.pop(), p));
              setFloor(floor - 1);
              setSel(null);
            }}
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-hit"
          >
            <Minus className="size-3.5" /> Remove
          </button>
        )}
        <select
          value={plan.size}
          onChange={(e) => {
            const size = e.target.value as HomeSize;
            if (!confirm("Start again at this size? Your rooms and furniture are set out afresh.")) return;
            change(() => starterPlan(size));
            setFloor(0);
            setSel(null);
          }}
          className="ml-auto shrink-0 rounded-full bg-panel-2 px-2 py-1 text-xs font-semibold"
          aria-label="How big your home is"
        >
          {(Object.keys(SIZES) as HomeSize[]).map((k) => (
            <option key={k} value={k}>
              {SIZES[k].label}
            </option>
          ))}
        </select>
      </div>

      {/* The plan */}
      <div className="relative min-h-0 flex-1 bg-[#f4f1ea]">
        {view3d ? (
          <Home3DView plan={plan} floor={floor} />
        ) : (
          <PlanGrid
            plan={plan}
            floor={floor}
            tool={tool}
            roomKind={roomKind}
            sel={sel}
            bad={bad}
            onSelect={setSel}
            onDrawRoom={(r) => {
              const id = nextId(fl.rooms);
              onFloor((f) => f.rooms.push({ id, kind: roomKind, ...r }));
              setSel({ type: "room", id });
            }}
            onMoveItem={(id, x, y, first) => {
              // One undo step for a whole drag.
              if (first) setHistory((h) => [...h.slice(-40), plan]);
              setPlanNow((p) => {
                if (!p) return p;
                const n = structuredClone(p);
                const it = n.floors[floor].items.find((i) => i.id === id);
                if (it) {
                  const s = itemSize(it);
                  it.x = Math.max(0, Math.min(w - s.w, x));
                  it.y = Math.max(0, Math.min(d - s.d, y));
                }
                return n;
              });
              setDirty(true);
            }}
          />
        )}
        {note && (
          <button onClick={() => setNote(null)} className={cn("absolute inset-x-3 top-2 mx-auto max-w-sm rounded-2xl px-3 py-2 text-left text-xs font-semibold shadow", note.bad ? "bg-hit text-white" : "bg-ink text-white")}>
            {note.text}
          </button>
        )}
      </div>

      {/* Tools: what's selected, or what to add */}
      <div className="shrink-0 border-t border-line pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {view3d ? (
          <p className="px-3 py-3 text-center text-xs text-muted">Drag to look round, pinch to zoom. Floors above {FLOOR_NAME[floor].toLowerCase()} are left off so you can see in.</p>
        ) : room || item ? (
          <div className="px-2 pt-2">
            <div className="flex items-center gap-2">
              <b className="min-w-0 flex-1 truncate text-sm">{room ? ROOM_LABEL[room.kind] : FURNITURE[item!.kind].label}</b>
              {item && (
                <>
                  <IconBtn label="Turn" onClick={() => onFloor((f) => {
                    const it = f.items.find((i) => i.id === item.id)!;
                    it.rot = (it.rot + 1) % 4;
                    const s = itemSize(it);
                    it.x = Math.min(it.x, w - s.w);
                    it.y = Math.min(it.y, d - s.d);
                  })}>
                    <RotateCw className="size-4" />
                  </IconBtn>
                  <IconBtn label="Copy" onClick={() => addItem(item.kind)}>
                    <Copy className="size-4" />
                  </IconBtn>
                </>
              )}
              <IconBtn
                label="Delete"
                onClick={() => {
                  onFloor((f) => {
                    if (room) f.rooms = f.rooms.filter((r) => r.id !== room.id);
                    else f.items = f.items.filter((i) => i.id !== item!.id);
                  });
                  setSel(null);
                }}
              >
                <Trash2 className="size-4 text-hit" />
              </IconBtn>
              <button onClick={() => setSel(null)} className="h-9 rounded-full bg-ink px-3 text-xs font-semibold text-white">
                Done
              </button>
            </div>
            <div className="mt-2 flex items-center justify-center gap-4">
              <Pad label={room ? "Move" : "Nudge a square"} onMove={(dx, dy) => nudge(dx, dy)} />
              {room && <Pad label="Bigger / smaller" onMove={(dx, dy) => nudge(dx, dy, true)} grow />}
            </div>
            {room && (
              <div className="mt-2 flex gap-1 overflow-x-auto [scrollbar-width:none]">
                {ROOM_KINDS.map((k) => (
                  <button key={k} onClick={() => onFloor((f) => (f.rooms.find((r) => r.id === room.id)!.kind = k))} className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", room.kind === k ? "bg-ink text-white" : "bg-panel-2")}>
                    {ROOM_LABEL[k]}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="px-2 pt-2">
            <div className="mb-2 flex gap-1 text-xs font-semibold">
              <button onClick={() => setTool("furniture")} className={cn("flex-1 rounded-full py-1.5", tool === "furniture" ? "bg-ink text-white" : "bg-panel-2")}>
                Furniture
              </button>
              <button onClick={() => setTool("rooms")} className={cn("flex-1 rounded-full py-1.5", tool === "rooms" ? "bg-ink text-white" : "bg-panel-2")}>
                Rooms
              </button>
            </div>
            {tool === "furniture" ? (
              <>
                <p className="mb-1.5 text-[11px] text-muted">Tap to put one in, then drag it where you want it. Tap a piece to turn or move it a square at a time.</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                  {(Object.keys(FURNITURE) as FurnitureKind[]).map((k) => (
                    <button key={k} onClick={() => addItem(k)} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-panel-2 px-2.5 py-2 text-xs font-semibold">
                      <span className="size-3 rounded-sm" style={{ background: FURNITURE[k].colour }} />
                      {FURNITURE[k].label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="mb-1.5 text-[11px] text-muted">Pick a room, then drag across the grid to draw it. Tap a room to move, resize or change it.</p>
                <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
                  {ROOM_KINDS.map((k) => (
                    <button key={k} onClick={() => setRoomKind(k)} className={cn("flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold", roomKind === k ? "bg-ink text-white" : "bg-panel-2")}>
                      <span className="size-3 rounded-sm ring-1 ring-black/10" style={{ background: ROOM_FLOOR[k] }} />
                      {ROOM_LABEL[k]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The squares round `at` at distance r (r = 0: just `at`). */
function ring(at: { x: number; y: number }, r: number) {
  if (r === 0) return [at];
  const out: { x: number; y: number }[] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) out.push({ x: at.x + dx, y: at.y + dy });
  return out;
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="grid size-9 place-items-center rounded-full bg-panel-2" aria-label={label} title={label}>
      {children}
    </button>
  );
}

/** Four arrows: move (or grow) a square at a time. */
function Pad({ label, onMove, grow }: { label: string; onMove: (dx: number, dy: number) => void; grow?: boolean }) {
  const b = "grid size-8 place-items-center rounded-lg bg-panel-2 active:bg-ink/10";
  return (
    <div className="flex flex-col items-center">
      <span className="mb-0.5 text-[10px] font-semibold text-muted">{label}</span>
      <div className="grid grid-cols-3 gap-0.5">
        <span />
        <button className={b} onClick={() => onMove(0, -1)} aria-label={grow ? "Shorter" : "Up"}>
          <ArrowUp className="size-4" />
        </button>
        <span />
        <button className={b} onClick={() => onMove(-1, 0)} aria-label={grow ? "Narrower" : "Left"}>
          <ArrowLeft className="size-4" />
        </button>
        <span className="grid size-8 place-items-center text-muted">{grow ? <Plus className="size-3" /> : null}</span>
        <button className={b} onClick={() => onMove(1, 0)} aria-label={grow ? "Wider" : "Right"}>
          <ArrowRight className="size-4" />
        </button>
        <span />
        <button className={b} onClick={() => onMove(0, 1)} aria-label={grow ? "Longer" : "Down"}>
          <ArrowDown className="size-4" />
        </button>
        <span />
      </div>
    </div>
  );
}

/** The flat plan: the grid, rooms, furniture. Drag to draw rooms or move furniture. */
function PlanGrid({
  plan,
  floor,
  tool,
  roomKind,
  sel,
  bad,
  onSelect,
  onDrawRoom,
  onMoveItem,
}: {
  plan: HomePlan;
  floor: number;
  tool: Tool;
  roomKind: RoomKind;
  sel: Sel;
  bad: Set<number>;
  onSelect: (s: Sel) => void;
  onDrawRoom: (r: { x: number; y: number; w: number; d: number }) => void;
  onMoveItem: (id: number, x: number, y: number, first: boolean) => void;
}) {
  const { w, d } = SIZES[plan.size];
  const fl = plan.floors[floor];
  const below = floor > 0 ? plan.floors[floor - 1] : null;
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: "room"; x0: number; y0: number } | { kind: "item"; id: number; ox: number; oy: number; moved: boolean } | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; d: number } | null>(null);

  /** The plan square under the pointer (fractional). */
  const at = (e: React.PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const rectOf = (x0: number, y0: number, x1: number, y1: number) => {
    const ax = Math.max(0, Math.min(w - 1, Math.floor(Math.min(x0, x1))));
    const ay = Math.max(0, Math.min(d - 1, Math.floor(Math.min(y0, y1))));
    const bx = Math.max(0, Math.min(w, Math.ceil(Math.max(x0, x1))));
    const by = Math.max(0, Math.min(d, Math.ceil(Math.max(y0, y1))));
    return { x: ax, y: ay, w: Math.max(1, bx - ax), d: Math.max(1, by - ay) };
  };

  return (
    <svg
      ref={svg}
      viewBox={`-0.6 -0.6 ${w + 1.2} ${d + 1.2}`}
      className="h-full w-full touch-none select-none"
      onPointerDown={(e) => {
        if (tool !== "rooms" || e.target !== e.currentTarget) return;
        const p = at(e);
        drag.current = { kind: "room", x0: p.x, y0: p.y };
        e.currentTarget.setPointerCapture(e.pointerId);
        onSelect(null);
      }}
      onPointerMove={(e) => {
        const g = drag.current;
        if (!g) return;
        const p = at(e);
        if (g.kind === "room") setDraft(rectOf(g.x0, g.y0, p.x, p.y));
        else {
          const nx = Math.round(p.x - g.ox);
          const ny = Math.round(p.y - g.oy);
          const it = fl.items.find((i) => i.id === g.id);
          if (it && (nx !== it.x || ny !== it.y)) {
            onMoveItem(g.id, nx, ny, !g.moved);
            g.moved = true;
          }
        }
      }}
      onPointerUp={() => {
        const g = drag.current;
        drag.current = null;
        if (g?.kind === "room") {
          if (draft && draft.w >= 2 && draft.d >= 2) onDrawRoom(draft);
          setDraft(null);
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDraft(null);
      }}
    >
      {/* The plot, the squares (a stronger line every metre) and the floor below, faintly. */}
      <rect x={0} y={0} width={w} height={d} fill="#fffdf8" stroke="#495057" strokeWidth={0.12} pointerEvents="none" />
      {Array.from({ length: w + 1 }, (_, i) => (
        <line key={`v${i}`} x1={i} y1={0} x2={i} y2={d} stroke="#dee2e6" strokeWidth={i % 2 ? 0.02 : 0.045} pointerEvents="none" />
      ))}
      {Array.from({ length: d + 1 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={i} x2={w} y2={i} stroke="#dee2e6" strokeWidth={i % 2 ? 0.02 : 0.045} pointerEvents="none" />
      ))}
      {below?.rooms.map((r) => <rect key={`b${r.id}`} x={r.x} y={r.y} width={r.w} height={r.d} fill="none" stroke="#adb5bd" strokeDasharray="0.3 0.2" strokeWidth={0.06} pointerEvents="none" />)}
      {below?.items
        .filter((i) => i.kind === "stairs")
        .map((i) => {
          const s = itemSize(i);
          return <rect key={`bs${i.id}`} x={i.x} y={i.y} width={s.w} height={s.d} fill="#b0896844" stroke="#b08968" strokeWidth={0.06} pointerEvents="none" />;
        })}
      {/* Rooms */}
      {fl.rooms.map((r) => (
        <g
          key={`r${r.id}`}
          onPointerDown={(e) => {
            if (tool !== "rooms") return;
            e.stopPropagation();
            onSelect({ type: "room", id: r.id });
          }}
          style={{ pointerEvents: tool === "rooms" ? "auto" : "none" }}
        >
          <rect x={r.x} y={r.y} width={r.w} height={r.d} fill={ROOM_FLOOR[r.kind]} stroke={sel?.type === "room" && sel.id === r.id ? "#f08c00" : "#343a40"} strokeWidth={sel?.type === "room" && sel.id === r.id ? 0.18 : 0.1} />
          <text x={r.x + r.w / 2} y={r.y + r.d / 2} textAnchor="middle" dominantBaseline="middle" fontSize={0.62} fill="#495057" fontWeight={600} pointerEvents="none">
            {ROOM_LABEL[r.kind]}
          </text>
          <text x={r.x + r.w / 2} y={r.y + r.d / 2 + 0.75} textAnchor="middle" fontSize={0.45} fill="#868e96" pointerEvents="none">
            {(r.w * 0.5).toFixed(1)} × {(r.d * 0.5).toFixed(1)} m
          </text>
        </g>
      ))}
      {/* Furniture */}
      {fl.items.map((i) => {
        const s = itemSize(i);
        const f = FURNITURE[i.kind];
        const on = sel?.type === "item" && sel.id === i.id;
        return (
          <g
            key={`i${i.id}`}
            style={{ pointerEvents: tool === "furniture" ? "auto" : "none", cursor: "grab" }}
            onPointerDown={(e) => {
              if (tool !== "furniture") return;
              e.stopPropagation();
              const p = at(e);
              drag.current = { kind: "item", id: i.id, ox: p.x - i.x, oy: p.y - i.y, moved: false };
              svg.current?.setPointerCapture(e.pointerId);
              onSelect({ type: "item", id: i.id });
            }}
          >
            <rect
              x={i.x + 0.06}
              y={i.y + 0.06}
              width={s.w - 0.12}
              height={s.d - 0.12}
              rx={i.kind === "rug" ? 0.1 : 0.18}
              fill={f.colour}
              fillOpacity={i.kind === "rug" ? 0.35 : 0.85}
              stroke={bad.has(i.id) ? "#e03131" : on ? "#f08c00" : "#212529"}
              strokeWidth={on || bad.has(i.id) ? 0.16 : 0.05}
            />
            {/* Which way it faces (a small bar on its back edge). */}
            {i.kind !== "rug" && i.kind !== "plant" && i.kind !== "lamp" && <FrontMark x={i.x} y={i.y} w={s.w} d={s.d} rot={i.rot} />}
            {s.w * s.d >= 4 && (
              <text x={i.x + s.w / 2} y={i.y + s.d / 2} textAnchor="middle" dominantBaseline="middle" fontSize={0.42} fill={i.kind === "tv" ? "#fff" : "#212529"} pointerEvents="none">
                {f.label}
              </text>
            )}
          </g>
        );
      })}
      {draft && <rect x={draft.x} y={draft.y} width={draft.w} height={draft.d} fill={ROOM_FLOOR[roomKind]} fillOpacity={0.7} stroke="#f08c00" strokeDasharray="0.3 0.2" strokeWidth={0.12} pointerEvents="none" />}
      {/* Size labels */}
      <text x={w / 2} y={-0.18} textAnchor="middle" fontSize={0.45} fill="#868e96">
        {w * 0.5} m
      </text>
      <text x={-0.2} y={d / 2} textAnchor="middle" fontSize={0.45} fill="#868e96" transform={`rotate(-90 -0.2 ${d / 2})`}>
        {d * 0.5} m
      </text>
    </svg>
  );
}

/** A dark bar along an item's back (its unturned "top" edge, turned with it). */
function FrontMark({ x, y, w, d, rot }: { x: number; y: number; w: number; d: number; rot: number }) {
  const t = 0.18;
  const r = [
    { x: x + 0.15, y: y + 0.1, w: w - 0.3, h: t },
    { x: x + w - 0.1 - t, y: y + 0.15, w: t, h: d - 0.3 },
    { x: x + 0.15, y: y + d - 0.1 - t, w: w - 0.3, h: t },
    { x: x + 0.1, y: y + 0.15, w: t, h: d - 0.3 },
  ][rot % 4];
  return <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#000" fillOpacity={0.35} pointerEvents="none" />;
}

/** The plan in 3D: drag to look round, pinch or scroll to zoom. */
function Home3DView({ plan, floor }: { plan: HomePlan; floor: number }) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<{ scene: THREE.Scene; home: ReturnType<typeof buildHome> | null; target: THREE.Vector3 } | null>(null);

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
    sun.position.set(8, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, far: 50 });
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#a9c99a" }));
    ground.position.y = -0.13;
    ground.receiveShadow = true;
    scene.add(ground);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(9, 11, 12);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 3;
    controls.maxDistance = 40;
    const target = new THREE.Vector3();
    live.current = { scene, home: null, target };
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
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.target.lerp(target, 0.15);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      live.current?.home?.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      live.current = null;
    };
  }, []);

  // The home, rebuilt when the plan or the floor changes.
  useEffect(() => {
    const l = live.current;
    if (!l) return;
    if (l.home) {
      l.scene.remove(l.home.group);
      l.home.dispose();
    }
    l.home = buildHome(plan, floor);
    l.scene.add(l.home.group);
    l.target.set(0, floor * STOREY_M, 0);
  }, [plan, floor]);

  return <div ref={host} className="absolute inset-0 grid place-items-center text-sm text-muted" />;
}
