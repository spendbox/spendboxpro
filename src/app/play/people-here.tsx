"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPin, MessageCircle, UserCheck, UserPlus, Users, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import type { Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";

// Real people near you. Inside a place (a floor of a building, a club, a balloon, a train...):
// when you walk in and other real players are there (not NPCs), a card pops up saying who, with
// buttons to hug them, shake hands, message them or add them as a friend. It tucks away after a
// few seconds into a little "2 real people here" chip you can tap to see them again. Busy places
// stay calm: people walking in later just show as a short line on the chip ("Ada and 3 others
// walked in"); only a friend arriving opens the card again (at most once a minute), a packed
// place starts with the chip, and the card lists a few people with "Show all" for the rest.
// Plus a nudge when a friend goes somewhere in town, to join them.

export type HerePerson = { id: string; name: string; avatar: Avatar };
type FriendStatus = "friend" | "incoming" | "outgoing" | null;

/** More people than this when you walk in: start with the chip, not the card. */
const PACKED = 5;
/** Rows the card shows before "Show all". */
const ROWS = 4;

export function PeopleHere({
  room,
  people,
  statusOf,
  busy,
  onChat,
  onAddFriend,
  greet,
}: {
  /** The place you're in (the pop-up starts again in each new place). */
  room: string;
  /** The real players here with you (not you, not NPCs). */
  people: HerePerson[];
  statusOf: (id: string) => FriendStatus;
  /** Someone being added as a friend right now. */
  busy: string | null;
  onChat: (p: HerePerson) => void;
  onAddFriend: (p: HerePerson) => void;
  /** Hug and handshake buttons for someone (left out: none). */
  greet?: (p: HerePerson) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const [fresh, setFresh] = useState<string[]>([]);
  const [poppedAt, setPoppedAt] = useState(0);
  // People who walked in lately, for the line on the chip.
  const [arrived, setArrived] = useState<{ ids: string[]; at: number } | null>(null);
  const seen = useRef<{ room: string; ids: Set<string> } | null>(null);
  const enteredAt = useRef(0);
  const lastPop = useRef(0);
  const statusRef = useRef(statusOf);
  useEffect(() => {
    statusRef.current = statusOf;
  });
  const ids = people.map((p) => p.id).join(",");

  // You walked in and people were already here: pop up (unless it's packed). Someone new later:
  // a line on the chip, or the card if they're your friend.
  useEffect(() => {
    const same = seen.current?.room === room;
    const prev = same ? seen.current!.ids : new Set<string>();
    const now = new Set(ids ? ids.split(",") : []);
    const added = [...now].filter((id) => !prev.has(id));
    const id = setTimeout(() => {
      const at = Date.now();
      seen.current = { room, ids: now };
      if (!same) {
        enteredAt.current = at;
        setAll(false);
        setArrived(null);
        setOpen(false);
      }
      if (!added.length) return;
      setFresh(added);
      // Who's here takes a moment to load: anyone showing up in the first few seconds was already here.
      const walkingIn = at - enteredAt.current < 4000;
      const friend = added.some((p) => statusRef.current(p) === "friend");
      const pop = walkingIn ? now.size <= PACKED : friend && at - lastPop.current > 60_000;
      if (pop) {
        lastPop.current = at;
        setOpen(true);
        setPoppedAt(at);
      } else if (!walkingIn) {
        setArrived((a) => ({ ids: [...(a && at - a.at < 6000 ? a.ids : []), ...added], at }));
      }
    }, 0);
    return () => clearTimeout(id);
  }, [room, ids]);
  // ...and tuck away again after a while.
  useEffect(() => {
    if (!poppedAt) return;
    const id = setTimeout(() => setOpen(false), 9000);
    return () => clearTimeout(id);
  }, [poppedAt]);
  useEffect(() => {
    if (!arrived) return;
    const id = setTimeout(() => setArrived(null), 5000);
    return () => clearTimeout(id);
  }, [arrived]);

  if (!people.length) return null;
  const n = people.length;
  const newcomer = fresh.length === 1 ? people.find((p) => p.id === fresh[0]) : undefined;
  const title = newcomer && n > 1 ? `${newcomer.name} just walked in` : `${n} real ${n === 1 ? "person" : "people"} here`;

  if (!open) {
    const came = (arrived?.ids ?? []).map((id) => people.find((p) => p.id === id)).filter((p): p is HerePerson => Boolean(p));
    const faces = [...came, ...people.filter((p) => !came.includes(p))].slice(0, 3);
    return (
      <button
        onClick={() => {
          setFresh(came.map((p) => p.id));
          setArrived(null);
          setOpen(true);
          setPoppedAt(0);
        }}
        className={cn(
          "glass pointer-events-auto flex max-w-full items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-semibold shadow transition-shadow",
          came.length > 0 && "ring-2 ring-[#40c057]/60",
        )}
      >
        <span className="flex shrink-0 -space-x-2">
          {faces.map((p) => (
            <AvatarFace key={p.id} avatar={p.avatar} size={24} className="rounded-full ring-2 ring-white" />
          ))}
        </span>
        <span className="size-2 shrink-0 rounded-full bg-[#40c057]" aria-hidden />
        <span className="min-w-0 truncate">
          {came.length > 0 ? (
            <>
              {came[0].name}
              {came.length > 1 && ` and ${came.length - 1} other${came.length === 2 ? "" : "s"}`} walked in
              <span className="font-normal text-muted"> · {n} here</span>
            </>
          ) : (
            `${n} real ${n === 1 ? "person" : "people"} here`
          )}
        </span>
      </button>
    );
  }

  // Newcomers and friends first; a few rows, then "Show all".
  const rank = (p: HerePerson) => (fresh.includes(p.id) ? 2 : 0) + (statusOf(p.id) === "friend" ? 1 : 0);
  const sorted = [...people].sort((a, b) => rank(b) - rank(a));
  const rows = all ? sorted : sorted.slice(0, ROWS);
  return (
    <div className="glass pointer-events-auto w-full max-w-xl rounded-2xl p-2.5 shadow-lg sm:p-3" role="status">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#12b886] text-white sm:size-8">
          <Users className="size-4" />
        </span>
        <p className="min-w-0 flex-1 text-xs sm:text-sm">
          <b className="block truncate">{title}</b>
          <span className="block truncate text-[11px] text-muted sm:text-xs">Real players, not NPCs. Say hi!</span>
        </p>
        <button onClick={() => setOpen(false)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Hide">
          <X className="size-4" />
        </button>
      </div>
      <ul className={cn("mt-1.5 space-y-0.5 overflow-y-auto", all ? "max-h-[min(14rem,40dvh)]" : "")}>
        {rows.map((p) => {
          const st = statusOf(p.id);
          return (
            <li key={p.id} className="flex items-center gap-2 rounded-xl px-1 py-0.5">
              <span className="relative shrink-0">
                <AvatarFace avatar={p.avatar} size={30} className="rounded-full" />
                {fresh.includes(p.id) && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-[#ff4fd8] ring-2 ring-white" aria-label="just arrived" />}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-xs sm:text-sm">{p.name}</b>
                {st === "friend" && <span className="text-[11px] font-semibold text-[#2b8a3e] sm:text-xs">Your friend</span>}
              </span>
              {greet?.(p)}
              <button onClick={() => onChat(p)} className="flex items-center gap-1 rounded-full bg-panel-2 px-2.5 py-1.5 text-xs font-semibold">
                <MessageCircle className="size-3.5" />
                Chat
              </button>
              {st === "friend" ? (
                <span className="grid size-7 place-items-center rounded-full bg-[#d3f9d8] text-[#2b8a3e]" aria-label="Friends">
                  <UserCheck className="size-3.5" />
                </span>
              ) : st === "outgoing" ? (
                <span className="rounded-full bg-panel-2 px-2.5 py-1.5 text-xs font-semibold text-muted">Requested</span>
              ) : (
                <button
                  onClick={() => onAddFriend(p)}
                  disabled={busy !== null}
                  className="flex items-center gap-1 rounded-full bg-ink px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {busy === p.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                  {st === "incoming" ? "Say yes" : "Add"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!all && n > ROWS && (
        <button
          onClick={() => {
            setAll(true);
            setPoppedAt(0);
          }}
          className="mt-1 w-full rounded-xl bg-panel-2 py-1.5 text-xs font-semibold"
        >
          Show all {n}
        </button>
      )}
    </div>
  );
}

/** A friend just went somewhere in town: join them? */
export function FriendNudge({ friend, place, onJoin, onClose }: { friend: HerePerson; place: string; onJoin: () => void; onClose: () => void }) {
  useEffect(() => {
    const id = setTimeout(onClose, 10_000);
    return () => clearTimeout(id);
  }, [onClose]);
  return (
    <div className={cn("glass pointer-events-auto flex w-full max-w-xl items-center gap-2.5 rounded-2xl p-2.5 shadow-lg")} role="status">
      <AvatarFace avatar={friend.avatar} size={38} className="shrink-0 rounded-full" />
      <p className="min-w-0 flex-1 text-sm">
        <b className="block truncate">{friend.name} is at {place || "a place in town"}</b>
        <span className="block truncate text-xs text-muted">Your friend. Go and say hi?</span>
      </p>
      <button onClick={onJoin} className="flex shrink-0 items-center gap-1 rounded-full bg-[#7048e8] px-3 py-1.5 text-xs font-bold text-white">
        <MapPin className="size-3.5" />
        Join
      </button>
      <button onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close">
        <X className="size-4" />
      </button>
    </div>
  );
}
