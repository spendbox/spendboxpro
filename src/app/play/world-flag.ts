// While the real-world map is being built, it is switched on per browser: open the game with
// ?world=lagos to show Lagos instead of the hourly town (it stays on in that browser), ?world=0
// to go back. Everyone else keeps the hourly town until it is switched on for all.

import { REGIONS } from "@/lib/world";

const KEY = "newtown.world";

export function worldPreview(): string | null {
  try {
    const q = new URLSearchParams(location.search).get("world");
    if (q && REGIONS[q]) localStorage.setItem(KEY, q);
    if (q === "0") localStorage.removeItem(KEY);
    const id = localStorage.getItem(KEY);
    return id && REGIONS[id] ? id : null;
  } catch {
    return null;
  }
}
