"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, MapPin, MessageCircle, Search, UserCheck, UserMinus, UserPlus, Users, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import type { Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import type { FriendLists, FriendPerson } from "@/lib/friends";
import { acceptFriend, addFriend, findPlayers, removeFriend } from "./friend-actions";
import { Sheet } from "./sheet";

// Friends: add people (by name, or from who's around), say yes to requests, and see where each
// friend is in this town (and go to them). Friends stay friends in every new town, until one of
// you removes the other.

type Someone = { id: string; name: string; avatar: Avatar };

export function FriendsSheet({
  initial,
  placeOf,
  playing,
  suggestions,
  myRoom,
  onGo,
  onMessage,
  onChanged,
  onClose,
}: {
  /** Your lists as the game last loaded them. */
  initial: FriendLists;
  /** Where each player in a place is right now (useRooms().placeOf). */
  placeOf: Record<string, { room: string; name: string }>;
  /** Players in this game and their side. */
  playing: Record<string, "hider" | "seeker">;
  /** People around (in this game, or in your place) to add. */
  suggestions: Someone[];
  /** The place you're in, if any. */
  myRoom: string | null;
  onGo: (friend: FriendPerson, room: string) => void;
  onMessage: (friend: FriendPerson) => void;
  /** Something changed (the game reloads its copy). */
  onChanged: () => void;
  onClose: () => void;
}) {
  // What the last action returned, until the game's own copy catches up.
  const initialKey = JSON.stringify([initial.friends.map((f) => f.id), initial.incoming.map((f) => f.id), initial.outgoing.map((f) => f.id)]);
  const [local, setLocal] = useState<{ base: string; lists: FriendLists } | null>(null);
  const lists = local && local.base === initialKey ? local.lists : initial;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [found, setFound] = useState<{ q: string; list: FriendPerson[] } | null>(null);
  const [searching, setSearching] = useState(false);

  // Search by name as you type (a moment after you stop).
  const q = text.trim();
  useEffect(() => {
    if (q.length < 2) return;
    let live = true;
    const id = setTimeout(() => {
      setSearching(true);
      findPlayers(q)
        .then((res) => {
          if (!live) return;
          setFound({ q, list: res.ok ? res.players : [] });
          if (!res.ok) setError(res.error);
        })
        .catch(() => live && setError("Couldn't search just now. Try again."))
        .finally(() => live && setSearching(false));
    }, 350);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q]);

  const status = useMemo(() => {
    const m = new Map<string, "friend" | "incoming" | "outgoing">();
    for (const f of lists.friends) m.set(f.id, "friend");
    for (const f of lists.incoming) m.set(f.id, "incoming");
    for (const f of lists.outgoing) m.set(f.id, "outgoing");
    return m;
  }, [lists]);

  async function run(id: string, fn: () => Promise<{ ok: true; lists: FriendLists } | { ok: false; error: string }>, done?: string) {
    if (busy) return;
    setBusy(id);
    setError(null);
    setNote(null);
    try {
      const res = await fn();
      if (!res.ok) return setError(res.error);
      setLocal({ base: initialKey, lists: res.lists });
      if (done) setNote(done);
      setConfirm(null);
      onChanged();
    } catch {
      setError("Couldn't do that just now. Try again.");
    } finally {
      setBusy(null);
    }
  }
  const add = (p: Someone) =>
    run(p.id, async () => {
      const res = await addFriend(p.id);
      return res.ok ? { ok: true, lists: res.lists } : res;
    }, status.get(p.id) === "incoming" ? `You and ${p.name} are friends now.` : `Friend request sent to ${p.name}.`);
  const accept = (p: FriendPerson) => run(p.id, () => acceptFriend(p.id), `You and ${p.name} are friends now.`);
  const remove = (p: FriendPerson, done: string) => run(p.id, () => removeFriend(p.id), done);

  const searchList = q.length >= 2 && found?.q === q ? found.list : null;
  const others = suggestions.filter((s) => !status.has(s.id)).slice(0, 12);

  /** The button for someone who isn't a friend yet. */
  const addButton = (p: Someone) => {
    const st = status.get(p.id);
    if (st === "friend")
      return (
        <span className="flex items-center gap-1 rounded-full bg-[#d3f9d8] px-2.5 py-1 text-xs font-bold text-[#2b8a3e]">
          <UserCheck className="size-3.5" />
          Friends
        </span>
      );
    if (st === "outgoing") return <span className="rounded-full bg-panel-2 px-2.5 py-1 text-xs font-semibold text-muted">Requested</span>;
    return (
      <button
        onClick={() => add(p)}
        disabled={busy !== null}
        className="flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
      >
        {busy === p.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
        {st === "incoming" ? "Say yes" : "Add"}
      </button>
    );
  };

  return (
    <Sheet onClose={onClose} wide>
      <div className="flex items-center gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-[#ffe3f1] text-[#c2255c]">
          <Users className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-extrabold leading-tight">Friends</h2>
          <p className="text-xs text-muted">They stay your friends in every new town. See where they are and go to them.</p>
        </div>
        <button onClick={onClose} className="grid size-9 shrink-0 place-items-center self-start rounded-full text-muted hover:bg-panel-2" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>

      {error && <p className="mt-3 rounded-xl bg-hit/10 px-3 py-2 text-sm text-hit">{error}</p>}
      {note && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-[#d3f9d8] px-3 py-2 text-sm font-medium text-[#2b8a3e]">
          <Check className="size-4 shrink-0" />
          {note}
        </p>
      )}

      {lists.incoming.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">Want to be your friend</h3>
          <ul className="space-y-1.5">
            {lists.incoming.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 rounded-2xl bg-[#fff4e6] p-2">
                <AvatarFace avatar={p.avatar} size={40} className="shrink-0 rounded-full" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{p.name}</b>
                  <span className="text-xs text-muted">Level {p.level}</span>
                </span>
                <button
                  onClick={() => accept(p)}
                  disabled={busy !== null}
                  className="flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {busy === p.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  Yes
                </button>
                <button
                  onClick={() => remove(p, `You turned down ${p.name}.`)}
                  disabled={busy !== null}
                  className="rounded-full bg-panel-2 px-3 py-1.5 text-xs font-semibold text-muted disabled:opacity-50"
                >
                  No
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4">
        <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">
          Your friends{lists.friends.length ? ` (${lists.friends.length})` : ""}
        </h3>
        {lists.friends.length === 0 ? (
          <p className="rounded-2xl bg-panel-2 px-3 py-3 text-sm text-muted">No friends yet. Add people below: once they say yes, you&apos;ll see where they are in every town.</p>
        ) : (
          <ul className="space-y-1.5">
            {lists.friends.map((f) => {
              const at = placeOf[f.id];
              const side = playing[f.id];
              const here = at && at.room === myRoom;
              return (
                <li key={f.id} className="rounded-2xl bg-panel-2/70 p-2">
                  <div className="flex items-center gap-2.5">
                    <span className="relative shrink-0">
                      <AvatarFace avatar={f.avatar} size={40} className="rounded-full" />
                      {(at || side) && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-[#40c057] ring-2 ring-white" aria-label="in this town" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-sm">{f.name}</b>
                      <span className={cn("block truncate text-xs", at || side ? "text-[#2b8a3e]" : "text-muted")}>
                        {here
                          ? "Here with you"
                          : at
                            ? `At ${at.name || "a place in town"}`
                            : side
                              ? `In this town, playing as a ${side === "hider" ? "ghost" : "hunter"}`
                              : "Not in this town right now"}
                      </span>
                    </span>
                    {at && !here && (
                      <button onClick={() => onGo(f, at.room)} className="flex items-center gap-1 rounded-full bg-[#7048e8] px-3 py-1.5 text-xs font-bold text-white">
                        <MapPin className="size-3.5" />
                        Go
                      </button>
                    )}
                    <button onClick={() => onMessage(f)} className="grid size-8 place-items-center rounded-full bg-white text-ink ring-1 ring-ink/10" aria-label={`Message ${f.name}`}>
                      <MessageCircle className="size-4" />
                    </button>
                    <button
                      onClick={() => setConfirm(confirm === f.id ? null : f.id)}
                      className="grid size-8 place-items-center rounded-full bg-white text-muted ring-1 ring-ink/10"
                      aria-label={`Remove ${f.name}`}
                    >
                      <UserMinus className="size-4" />
                    </button>
                  </div>
                  {confirm === f.id && (
                    <div className="mt-2 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs">
                      <span className="flex-1">Remove {f.name} from your friends?</span>
                      <button onClick={() => setConfirm(null)} className="rounded-full bg-panel-2 px-3 py-1 font-semibold">
                        Keep
                      </button>
                      <button
                        onClick={() => remove(f, `${f.name} is no longer your friend.`)}
                        disabled={busy !== null}
                        className="rounded-full bg-hit px-3 py-1 font-bold text-white disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-4">
        <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">Add friends</h3>
        <label className="flex items-center gap-2 rounded-2xl bg-panel-2 px-3 py-2">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search by player name"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            maxLength={40}
            autoComplete="off"
          />
          {searching && <LoaderCircle className="size-4 shrink-0 animate-spin text-muted" />}
        </label>
        {searchList && (
          <ul className="mt-1.5 space-y-1">
            {searchList.length === 0 ? (
              <li className="px-1 py-2 text-sm text-muted">Nobody called that. Check the spelling?</li>
            ) : (
              searchList.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 rounded-2xl px-1 py-1">
                  <AvatarFace avatar={p.avatar} size={34} className="shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{p.name}</b>
                    <span className="text-xs text-muted">Level {p.level}</span>
                  </span>
                  {addButton(p)}
                </li>
              ))
            )}
          </ul>
        )}
        {!searchList && others.length > 0 && (
          <>
            <p className="mb-1 mt-2.5 text-xs text-muted">People around you now</p>
            <ul className="space-y-1">
              {others.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 rounded-2xl px-1 py-1">
                  <AvatarFace avatar={p.avatar} size={34} className="shrink-0 rounded-full" />
                  <b className="min-w-0 flex-1 truncate text-sm">{p.name}</b>
                  {addButton(p)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {lists.outgoing.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">Requests you sent</h3>
          <ul className="space-y-1">
            {lists.outgoing.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 rounded-2xl px-1 py-1">
                <AvatarFace avatar={p.avatar} size={34} className="shrink-0 rounded-full" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{p.name}</b>
                  <span className="text-xs text-muted">Waiting for a yes</span>
                </span>
                <button
                  onClick={() => remove(p, `Request to ${p.name} cancelled.`)}
                  disabled={busy !== null}
                  className="rounded-full bg-panel-2 px-3 py-1.5 text-xs font-semibold text-muted disabled:opacity-50"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Sheet>
  );
}
