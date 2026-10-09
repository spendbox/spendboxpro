// Friends: players who said yes to each other. They stay friends from one game (one town) to
// the next, and see where each other is in every new town. The lists come from friends_of()
// (game-db/026_friends.sql).

import { cleanAvatar, type Avatar } from "@/lib/avatar";

export type FriendPerson = { id: string; name: string; avatar: Avatar; level: number; at: string | null };
export type FriendLists = {
  /** Friends (newest first). */
  friends: FriendPerson[];
  /** Requests waiting for you to say yes. */
  incoming: FriendPerson[];
  /** Requests you sent that haven't been answered yet. */
  outgoing: FriendPerson[];
};

export const NO_FRIENDS: FriendLists = { friends: [], incoming: [], outgoing: [] };

/** A list from friends_of() or find_players(), checked and tidied. */
export function friendRows(rows: unknown): FriendPerson[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.name !== "string") return [];
    const at = typeof o.since === "string" ? o.since : typeof o.at === "string" ? o.at : null;
    return [{ id: o.id, name: o.name, avatar: cleanAvatar(o.avatar, o.name), level: Number(o.level ?? 1) || 1, at }];
  });
}

/** All three lists from friends_of(). */
export function friendLists(data: unknown): FriendLists {
  if (!data || typeof data !== "object") return NO_FRIENDS;
  const o = data as Record<string, unknown>;
  return { friends: friendRows(o.friends), incoming: friendRows(o.incoming), outgoing: friendRows(o.outgoing) };
}
