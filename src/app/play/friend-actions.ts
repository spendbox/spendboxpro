"use server";

import { currentUserId } from "@/lib/game";
import { friendLists, friendRows, type FriendLists, type FriendPerson } from "@/lib/friends";
import { createAdminClient } from "@/lib/supabase/admin";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the database said, in words a player understands. */
function say(message: string) {
  const [code, n] = message.split(":");
  switch (code) {
    case "self":
      return "That's you!";
    case "bot":
      return "The bot can't be anyone's friend.";
    case "frozen":
      return "That account can't add friends right now.";
    case "no_player":
      return "We couldn't find that player.";
    case "unknown_player":
      return "Please sign in again.";
    case "too_many_friends":
      return `You can have up to ${n ?? 300} friends (and requests). Remove someone first.`;
    case "too_many_requests":
      return `That's ${n ?? 40} friend requests today. Try again tomorrow.`;
    case "no_request":
      return "That request isn't there any more.";
    case "blocked":
      return "You can't add this player.";
    default:
      return "Couldn't do that just now. Try again.";
  }
}

async function lists(db: ReturnType<typeof createAdminClient>, userId: string): Promise<FriendLists> {
  const { data } = await db.rpc("friends_of", { p_user: userId });
  return friendLists(data);
}

/** Your friends, the requests waiting for you, and the ones you sent. */
export async function loadFriends(): Promise<Result<FriendLists>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const { data, error } = await db.rpc("friends_of", { p_user: userId });
  if (error) return { ok: false, error: "Couldn't load your friends. Try again." };
  return { ok: true, ...friendLists(data) };
}

/** Ask someone to be friends (or say yes, if they already asked you). */
export async function addFriend(id: string): Promise<Result<{ status: "pending" | "friends"; lists: FriendLists }>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  if (!ID.test(id)) return { ok: false, error: "We couldn't find that player." };
  const db = createAdminClient();
  const { data, error } = await db.rpc("friend_request", { p_user: userId, p_other: id });
  if (error) return { ok: false, error: say(error.message) };
  return { ok: true, status: data?.status === "friends" ? "friends" : "pending", lists: await lists(db, userId) };
}

/** Say yes to someone's request. */
export async function acceptFriend(id: string): Promise<Result<{ lists: FriendLists }>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  if (!ID.test(id)) return { ok: false, error: "That request isn't there any more." };
  const db = createAdminClient();
  const { error } = await db.rpc("friend_accept", { p_user: userId, p_other: id });
  if (error) return { ok: false, error: say(error.message) };
  return { ok: true, lists: await lists(db, userId) };
}

/** Remove a friend, cancel your request, or turn theirs down. */
export async function removeFriend(id: string): Promise<Result<{ lists: FriendLists }>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  if (!ID.test(id)) return { ok: false, error: "We couldn't find that player." };
  const db = createAdminClient();
  const { error } = await db.rpc("friend_remove", { p_user: userId, p_other: id });
  if (error) return { ok: false, error: say(error.message) };
  return { ok: true, lists: await lists(db, userId) };
}

/** Players to add, by name (at least 2 letters). */
export async function findPlayers(text: string): Promise<Result<{ players: FriendPerson[] }>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const q = String(text ?? "").trim().slice(0, 40);
  if (q.length < 2) return { ok: true, players: [] };
  const { data, error } = await createAdminClient().rpc("find_players", { p_user: userId, p_text: q });
  if (error) return { ok: false, error: "Couldn't search just now. Try again." };
  return { ok: true, players: friendRows(data) };
}
