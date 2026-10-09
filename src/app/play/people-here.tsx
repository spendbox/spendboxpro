"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPin, MessageCircle, UserCheck, UserPlus, Users, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import type { Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";

// Real people near you. Inside a place (a floor of a building, a club, a balloon, a train...):
// as soon as another real player is there (not an NPC), a card pops up saying who, with
// buttons to message them or add them as a friend. It tucks away after a few seconds into a
// little "2 real people here" chip you can tap to see them again, and pops up again whenever
// someone new walks in. Plus a nudge when a friend goes somewhere in town, to join them.

export type HerePerson = { id: string; name: string; avatar: Avatar };
type FriendStatus = "friend" | "incoming" | "outgoing" | null;

export function PeopleHere({
  room,
  people,
  statusOf,
  busy,
  onChat,
  onAddFriend,
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
}) {
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<string[]>([]);
  const [poppedAt, setPoppedAt] = useState(0);
  const seen = useRef<{ room: string; ids: Set<string> } | null>(null);
  const ids = people.map((p) => p.id).join(",");

  // Someone new here (or you walked in and people were already here): pop up.
  useEffect(() => {
    const prev = seen.current?.room === room ? seen.current.ids : new Set<string>();
    const now = new Set(ids ? ids.split(",") : []);
    const added = [...now].filter((id) => !prev.has(id));
    const id = setTimeout(() => {
      seen.current = { room, ids: now };
      if (!added.length) return;
      setFresh(added);
      setOpen(true);
      setPoppedAt(Date.now());
    }, 0);
    return () => clearTimeout(id);
  }, [room, ids]);
  // ...and tuck away again after a while.
  useEffect(() => {
    if (!poppedAt) return;
    const id = setTimeout(() => setOpen(false), 9000);
    return () => clearTimeout(id);
  }, [poppedAt]);

  if (!people.length) return null;
  const n = people.length;
  const newcomer = fresh.length === 1 ? people.find((p) => p.id === fresh[0]) : undefined;
  const title = newcomer && n > 1 ? `${newcomer.name} just walked in` : `${n} real ${n === 1 ? "person" : "people"} here`;

  if (!open) {
    return (
      <button
        onClick={() => {
          setFresh([]);
          setOpen(true);
          setPoppedAt(0);
        }}
        className="glass pointer-events-auto flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-semibold shadow"
      >
        <span className="flex -space-x-2">
          {people.slice(0, 3).map((p) => (
            <AvatarFace key={p.id} avatar={p.avatar} size={24} className="rounded-full ring-2 ring-white" />
          ))}
        </span>
        <span className="size-2 rounded-full bg-[#40c057]" aria-hidden />
        {n} real {n === 1 ? "person" : "people"} here
      </button>
    );
  }

  return (
    <div className="glass pointer-events-auto w-full max-w-xl rounded-2xl p-3 shadow-lg" role="status">
      <div className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#12b886] text-white">
          <Users className="size-4" />
        </span>
        <p className="min-w-0 flex-1 text-sm">
          <b className="block truncate">{title}</b>
          <span className="block truncate text-xs text-muted">Real players, not NPCs. Say hi!</span>
        </p>
        <button onClick={() => setOpen(false)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Hide">
          <X className="size-4" />
        </button>
      </div>
      <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto">
        {people.map((p) => {
          const st = statusOf(p.id);
          return (
            <li key={p.id} className="flex items-center gap-2.5 rounded-xl px-1 py-1">
              <span className="relative shrink-0">
                <AvatarFace avatar={p.avatar} size={34} className="rounded-full" />
                {fresh.includes(p.id) && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-[#ff4fd8] ring-2 ring-white" aria-label="just arrived" />}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{p.name}</b>
                {st === "friend" && <span className="text-xs font-semibold text-[#2b8a3e]">Your friend</span>}
              </span>
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
