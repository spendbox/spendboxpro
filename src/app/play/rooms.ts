"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Who is inside which place (building or hot-air balloon), live, using ONE Supabase Realtime
// presence channel per round ("rooms:<roundId>"). Each player in a place shares
// { room, name, avatar, at }; everyone adds the counts up in their own browser.
// Watchers who aren't signed in still see the counts but can't go in.

/** A balloon ride lasts this long, then you're dropped back in the city. */
export const RIDE_MS = 10 * 60 * 1000;

export type RoomInfo = { id: string; name: string; capacity: number; kind: "building" | "balloon" };
export type RoomMember = { id: string; name: string; avatar: unknown };
type Meta = { room: string | null; name: string; avatar: unknown; at: number };

/** Room id for a building tile. */
export const buildingRoom = (tile: number) => `b:${tile}`;
/** Room id for balloon k (0 … 50). */
export const balloonRoom = (k: number) => `balloon:${k}`;

/** "7:42" for a number of milliseconds (never below 0:00). */
export function formatCountdown(ms: number) {
  const left = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

/** Milliseconds left until `endsAt` (updates every second), or null without an end time. */
export function useCountdown(endsAt: number | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return endsAt ? Math.max(0, endsAt - now) : null;
}

type Person = Meta & { id: string };

/** One entry per player (their newest tab wins), only those inside a place. */
function peopleFrom(state: Record<string, Meta[]>): Person[] {
  const out: Person[] = [];
  for (const [id, metas] of Object.entries(state)) {
    const latest = [...metas].sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
    if (latest?.room) out.push({ ...latest, id });
  }
  return out;
}

export function useRooms(
  roundId: number | null,
  me: { id: string; name: string; avatar: unknown } | null,
  opts?: { onRideEnd?: () => void },
) {
  const [people, setPeople] = useState<Person[]>([]);
  const [current, setCurrent] = useState<{ room: RoomInfo; round: number | null; at: number; rideEndsAt: number | null } | null>(null);
  const [notice, setNotice] = useState<"full" | "ride_over" | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const joined = useRef(false);
  const meRef = useRef(me);
  const currentRef = useRef(current);
  const peopleRef = useRef(people);
  const onRideEnd = useRef(opts?.onRideEnd);
  const roundRef = useRef(roundId);
  useEffect(() => {
    roundRef.current = roundId;
    meRef.current = me;
    currentRef.current = current;
    peopleRef.current = people;
    onRideEnd.current = opts?.onRideEnd;
  });

  // Your place belongs to this round only: a new map empties it.
  const myPlace = current && current.round === roundId ? current : null;

  const publish = useCallback(() => {
    const ch = channelRef.current;
    const m = meRef.current;
    const c = currentRef.current;
    if (!ch || !joined.current || !m) return;
    if (c && c.round === roundRef.current) void ch.track({ room: c.room.id, name: m.name, avatar: m.avatar, at: c.at } satisfies Meta);
    else void ch.untrack();
  }, []);

  // One channel per round. Guests get a random key and never share where they are.
  const meId = me?.id ?? null;
  useEffect(() => {
    if (roundId == null) return;
    const supabase = createClient();
    const key = meId ?? `guest-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(`rooms:${roundId}`, { config: { presence: { key } } });
    channelRef.current = channel;
    channel
      .on("presence", { event: "sync" }, () => setPeople(peopleFrom(channel.presenceState<Meta>() as unknown as Record<string, Meta[]>)))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          joined.current = true;
          publish();
        }
      });
    return () => {
      joined.current = false;
      channelRef.current = null;
      setPeople([]);
      supabase.removeChannel(channel);
    };
  }, [roundId, meId, publish]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of people) c[p.room!] = (c[p.room!] ?? 0) + 1;
    return c;
  }, [people]);

  const enter = useCallback(
    (room: RoomInfo): { ok: boolean; reason?: "full" | "signed_out" } => {
      if (!meRef.current) return { ok: false, reason: "signed_out" };
      const c = currentRef.current;
      if (c?.room.id === room.id && c.round === roundId) return { ok: true };
      const inside = peopleRef.current.filter((p) => p.room === room.id && p.id !== meRef.current?.id).length;
      if (inside >= room.capacity) return { ok: false, reason: "full" };
      const next = { room, round: roundId, at: Date.now(), rideEndsAt: room.kind === "balloon" ? Date.now() + RIDE_MS : null };
      currentRef.current = next;
      setCurrent(next);
      setNotice(null);
      publish();
      return { ok: true };
    },
    [roundId, publish],
  );

  const leave = useCallback(() => {
    currentRef.current = null;
    setCurrent(null);
    publish();
  }, [publish]);

  // Balloon rides end on their own.
  const rideEndsAt = myPlace?.rideEndsAt ?? null;
  useEffect(() => {
    if (!rideEndsAt) return;
    const id = setTimeout(() => {
      leave();
      setNotice("ride_over");
      onRideEnd.current?.();
    }, Math.max(0, rideEndsAt - Date.now()));
    return () => clearTimeout(id);
  }, [rideEndsAt, leave]);

  // Two people squeezing into the last spot at once: whoever came in last steps back out.
  useEffect(() => {
    if (!myPlace || !meId) return;
    const inside = people.filter((p) => p.room === myPlace.room.id).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    const rank = inside.findIndex((p) => p.id === meId);
    if (rank >= myPlace.room.capacity) {
      const id = setTimeout(() => {
        leave();
        setNotice("full");
      }, 0);
      return () => clearTimeout(id);
    }
  }, [people, myPlace, meId, leave]);

  // Signing out leaves the place.
  useEffect(() => {
    if (!meId && currentRef.current) {
      const id = setTimeout(leave, 0);
      return () => clearTimeout(id);
    }
  }, [meId, leave]);

  const myRoom = myPlace?.room.id ?? null;
  const members: RoomMember[] = useMemo(
    () => (myRoom ? people.filter((p) => p.room === myRoom).map(({ id, name, avatar }) => ({ id, name, avatar })) : []),
    [people, myRoom],
  );

  return {
    /** How many people are in each place right now, by room id. */
    counts,
    /** The room id you're in, or null. */
    myRoom,
    /** Full details of where you are (name, capacity, kind), or null. */
    myRoomInfo: myPlace?.room ?? null,
    /** When your balloon ride ends (ms timestamp), or null. */
    rideEndsAt,
    /** False for watchers who aren't signed in. */
    canJoin: me !== null,
    /** Why you were last put out of a place ("full" if it overflowed, "ride_over"), until you enter again. */
    notice,
    clearNotice: useCallback(() => setNotice(null), []),
    enter,
    leave,
    /** Everyone in your place (including you). */
    members,
  };
}
