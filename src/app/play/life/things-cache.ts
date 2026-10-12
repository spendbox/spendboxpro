import type { MyThings } from "../item-actions";

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
