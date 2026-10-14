import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Town Hall (game-db/085 and 086): the server's side. Photos live in the public "town" bucket
// (a message's image_path is "town/<sender>/<name>.jpg"); everything goes after 24 hours.

export type TownMessage = {
  id: number;
  from: string;
  name: string;
  avatar: unknown;
  text: string;
  /** The photo's address, if there is one. */
  image: string | null;
  at: string;
  /** What it answers (a few words of it). */
  reply: { id: number; name: string; text: string } | null;
  /** Emoji → how many people reacted with it. */
  reactions: Record<string, number>;
};

export const TOWN_BUCKET = "town";

export const TOWN_WORDS: Record<string, string> = {
  too_fast: "One message every 5 seconds. Take a breath!",
  too_long: "That's a bit long: 300 letters at most.",
  empty: "Type something first.",
  frozen: "Your account is paused, so you can't talk here right now.",
  no_name: "Pick a player name first.",
  bad_room: "That Town Hall isn't open.",
  bad_target: "That photo didn't come through. Try again.",
  gone: "That message has gone.",
};

export function townError(message: string) {
  if (/town_hall_\w+|does not exist/.test(message)) return "The Town Hall opens soon.";
  const code = Object.keys(TOWN_WORDS).find((k) => message.includes(k));
  return code ? TOWN_WORDS[code] : "That didn't work. Try again.";
}

/** A photo's public address from its image_path ("town/<user>/<name>.jpg"). */
export function townImageUrl(path: string | null | undefined) {
  if (!path || !path.startsWith(`${TOWN_BUCKET}/`)) return null;
  return createAdminClient().storage.from(TOWN_BUCKET).getPublicUrl(path.slice(TOWN_BUCKET.length + 1)).data.publicUrl;
}

/** Removes a message's photo file (when the message goes). */
export async function removeTownImage(path: string | null | undefined) {
  if (!path || !path.startsWith(`${TOWN_BUCKET}/`)) return;
  await createAdminClient().storage.from(TOWN_BUCKET).remove([path.slice(TOWN_BUCKET.length + 1)]).then(() => {}, () => {});
}

/** Messages over a day old: their photos, then the messages themselves. */
export async function clearOldTownHall(limit = 200) {
  const db = createAdminClient();
  const { data, error } = await db.rpc("town_hall_expired", { p_limit: limit });
  if (error || !data?.length) return 0;
  const rows = data as { id: number; image: string | null }[];
  const files = rows.flatMap((r) => (r.image?.startsWith(`${TOWN_BUCKET}/`) ? [r.image.slice(TOWN_BUCKET.length + 1)] : []));
  for (let i = 0; i < files.length; i += 500) await db.storage.from(TOWN_BUCKET).remove(files.slice(i, i + 500)).then(() => {}, () => {});
  const { count } = await db.from("chat_messages").delete({ count: "exact" }).in("id", rows.map((r) => r.id));
  return count ?? 0;
}
