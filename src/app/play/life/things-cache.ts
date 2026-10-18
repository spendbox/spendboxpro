import type { MyThings } from "../item-actions";
import type { PlayerEvent } from "@/lib/world/news";

// Your things and reputation, kept on the phone so the reputation pill and the Things screen
// open at once with what was last seen, then freshen in the background.
let last: MyThings | null = null;
let pending: Promise<MyThings | null> | null = null;
const KEY = "nt-things";

export function cachedThings(): MyThings | null {
  if (last) return last;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) last = JSON.parse(raw) as MyThings;
  } catch {}
  return last;
}

export function loadThings(): Promise<MyThings | null> {
  if (pending) return pending;
  pending = fetch("/api/things", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<MyThings | null>) : null))
    .then((t) => {
      if (t) {
        last = t;
        try {
          localStorage.setItem(KEY, JSON.stringify(t));
        } catch {}
      }
      return t;
    })
    .catch(() => null)
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Look round the map (people about, or marks left) without queueing behind taps. */
export async function around<T>(what: "people" | "marks", region: string, x: number, z: number): Promise<T | null> {
  const r = await fetch(`/api/around?what=${what}&region=${encodeURIComponent(region)}&x=${Math.round(x)}&z=${Math.round(z)}`, { cache: "no-store" });
  if (!r.ok) return null;
  const body = (await r.json()) as Record<string, T>;
  return body[what] ?? null;
}

/** People about round a spot, and how many are online in the whole city. */
export async function peopleAround<T>(region: string, x: number, z: number): Promise<{ people: T[]; online: number } | null> {
  const r = await fetch(`/api/around?what=people&region=${encodeURIComponent(region)}&x=${Math.round(x)}&z=${Math.round(z)}`, { cache: "no-store" });
  if (!r.ok) return null;
  const body = (await r.json()) as { people?: T[]; online?: number };
  return { people: body.people ?? [], online: Number(body.online) || 0 };
}

/** How many are in each room round a spot (the server's, game-db/127): the spot rounded like the server, so phones share the CDN's answers. */
export async function roomCountsAround(region: string, x: number, z: number): Promise<Record<string, number> | null> {
  const g = 20;
  const r = await fetch(`/api/room-counts?region=${encodeURIComponent(region)}&x=${Math.round(x / g) * g}&z=${Math.round(z / g) * g}`).catch(() => null);
  if (!r?.ok) return null;
  return ((await r.json()) as { counts?: Record<string, number> }).counts ?? {};
}

/** Players in the news (the same for everyone: cached for a minute, /api/player-news). */
export async function sharedPlayerNews(region: string): Promise<PlayerEvent[]> {
  const r = await fetch(`/api/player-news?region=${encodeURIComponent(region)}`);
  if (!r.ok) return [];
  const body = (await r.json()) as { events?: PlayerEvent[] };
  return body.events ?? [];
}
