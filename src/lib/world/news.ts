// The city's news (docs/NEWS.md): the weather, fires, traffic, power cuts, market prices, stars
// spotted about town, football, floods, road works, festivals. Made from the clock and the map,
// the same for everyone at the same moment (no database), a new story every 20 minutes and the
// weather every 3 hours. The weather also shows in the sky (rain falls when the news says so).
// Players' own news (new inventions) is added by the screen.

import type { RegionMap } from "./compile.ts";
import { toTile } from "./geo.ts";

export type NewsKind = "weather" | "fire" | "traffic" | "power" | "market" | "star" | "sport" | "flood" | "roads" | "festival" | "city";

export type NewsItem = { id: string; at: number; kind: NewsKind; title: string; text: string; area?: string; x?: number; z?: number };

export type WeatherKind = "clear" | "cloudy" | "rain" | "fog";

const STORY_MS = 20 * 60_000;
const WEATHER_MS = 3 * 3_600_000;

/** A steady random number from a slot and a salt (0..1). */
function rand(slot: number, salt: number) {
  const v = Math.sin(slot * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
const pickOf = <T,>(list: readonly T[], r: number) => list[Math.floor(r * list.length) % list.length];

/** Lagos weather for a 3-hour slot: sunny, cloudy, rain (sometimes a storm), or harmattan haze. */
function weatherOfSlot(slot: number): { kind: WeatherKind; strength: number; label: string } {
  const r = rand(slot, 1);
  if (r < 0.3) return { kind: "clear", strength: 1, label: "Sunny and hot" };
  if (r < 0.55) return { kind: "cloudy", strength: 0.7, label: "Cloudy" };
  if (r < 0.8) return { kind: "rain", strength: 0.6, label: "Rain" };
  if (r < 0.9) return { kind: "rain", strength: 1, label: "Thunderstorm" };
  return { kind: "fog", strength: 0.8, label: "Harmattan haze" };
}

/** The weather in the city now (for the sky and the news). */
export function weatherNow(now = Date.now()) {
  return weatherOfSlot(Math.floor(now / WEATHER_MS));
}

type Place = { name: string; x: number; z: number };

function placesOf(region: RegionMap) {
  const at = (lat: number, lon: number) => toTile(region.frame, { lat, lon });
  const areas: Place[] = [
    ...region.region.districts.map((d) => ({ name: d.name, ...at(d.at.lat, d.at.lon) })),
    ...region.region.areas.filter((a) => a.kind !== "village").map((a) => ({ name: a.name, ...at(a.at[0], a.at[1]) })),
  ];
  const mid = (l: RegionMap["landmarks"][number]) => ({ name: l.name, x: l.ax + (l.w - 1) / 2, z: l.az + (l.d - 1) / 2 });
  const landmarks = region.landmarks.map(mid);
  const markets = region.landmarks.filter((l) => l.type === "market").map(mid);
  const arenas = region.landmarks.filter((l) => l.type === "arena").map(mid);
  return { areas, landmarks, markets: markets.length ? markets : landmarks, arenas: arenas.length ? arenas : landmarks };
}

const FOODS = ["tomatoes", "pepper", "rice", "garri", "onions", "yam", "beans", "palm oil"];
const STARS = ["An Afrobeats star", "A Nollywood actress", "A Super Eagles striker", "A famous comedian", "A gospel singer", "A tech billionaire"];
const FESTIVALS = ["Eyo festival", "a street carnival", "an owambe that took over the street", "a food festival", "a fashion week show", "a free concert"];

/** One story for a 20-minute slot. */
function storyOf(slot: number, p: ReturnType<typeof placesOf>): NewsItem {
  const at = slot * STORY_MS;
  const area = pickOf(p.areas, rand(slot, 2));
  const id = `news-${slot}`;
  const r = rand(slot, 3);
  if (r < 0.12) {
    const what = pickOf(["shopping plaza", "market stall row", "warehouse", "filling station", "block of flats"], rand(slot, 4));
    return { id, at, kind: "fire", title: `Fire at a ${what} in ${area.name}`, text: `Firefighters fought the blaze for two hours. No one was hurt, but traders say they lost stock. Roads round it are closed for now.`, area: area.name, x: area.x, z: area.z };
  }
  if (r < 0.24) {
    const road = pickOf(["Third Mainland Bridge", "Ikorodu Road", "the Lekki–Epe Expressway", "Carter Bridge", "Apapa Road", "the Ikeja underbridge"], rand(slot, 5));
    return { id, at, kind: "traffic", title: `Gridlock on ${road}`, text: `A broken-down trailer has traffic backed up for kilometres. Danfo drivers are taking side streets; give yourself extra time.`, area: area.name };
  }
  if (r < 0.34) return { id, at, kind: "power", title: `Power cut across ${area.name}`, text: `The lights went off this afternoon. Generators are humming on every street; anyone with a solar kit is smiling.`, area: area.name, x: area.x, z: area.z };
  if (r < 0.46) {
    const m = pickOf(p.markets, rand(slot, 6));
    const food = pickOf(FOODS, rand(slot, 7));
    const up = rand(slot, 8) < 0.6;
    return { id, at, kind: "market", title: `${food[0].toUpperCase()}${food.slice(1)} ${up ? "up" : "down"} ${Math.round(10 + rand(slot, 9) * 40)}% at ${m.name}`, text: up ? `Traders blame the roads and fuel. Shoppers are buying less and haggling more.` : `A good harvest has brought prices down. Mama Puts are celebrating.`, area: m.name, x: m.x, z: m.z };
  }
  if (r < 0.58) {
    const l = pickOf(p.landmarks, rand(slot, 10));
    return { id, at, kind: "star", title: `${pickOf(STARS, rand(slot, 11))} spotted at ${l.name}`, text: `Fans crowded round for selfies. Phones up, everyone!`, area: l.name, x: l.x, z: l.z };
  }
  if (r < 0.68) {
    const a = pickOf(p.arenas, rand(slot, 12));
    const won = rand(slot, 13) < 0.6;
    return { id, at, kind: "sport", title: won ? `Big win at ${a.name}: parties in ${area.name}` : `Heartbreak at ${a.name}`, text: won ? `Fans spilled onto the streets singing after a late winner.` : `A late goal against the home side sent fans home quiet.`, area: a.name, x: a.x, z: a.z };
  }
  if (r < 0.76) return { id, at, kind: "flood", title: `Flooding in ${area.name}`, text: `Heavy rain left some streets under water. Okadas are charging double to wade through.`, area: area.name, x: area.x, z: area.z };
  if (r < 0.86) return { id, at, kind: "roads", title: `New road works in ${area.name}`, text: `The state has started fixing potholes. Expect diversions for a few days, and smoother rides after.`, area: area.name, x: area.x, z: area.z };
  if (r < 0.95) return { id, at, kind: "festival", title: `${pickOf(FESTIVALS, rand(slot, 14)).replace(/^./, (c) => c.toUpperCase())} in ${area.name}`, text: `Music, food and colour all afternoon. Everyone is invited.`, area: area.name, x: area.x, z: area.z };
  return { id, at, kind: "city", title: `New footbridge opens in ${area.name}`, text: `Pedestrians can finally cross the busy road safely.`, area: area.name, x: area.x, z: area.z };
}

/** The latest news (newest first): a story every 20 minutes, and the weather when it changes. */
export function cityNews(region: RegionMap, now = Date.now(), count = 15): NewsItem[] {
  const p = placesOf(region);
  const out: NewsItem[] = [];
  const slot = Math.floor(now / STORY_MS);
  for (let k = 0; k < count; k++) out.push(storyOf(slot - k, p));
  // The weather's turns in the last few slots.
  const ws = Math.floor(now / WEATHER_MS);
  for (let k = 0; k < 3; k++) {
    const w = weatherOfSlot(ws - k);
    const before = weatherOfSlot(ws - k - 1);
    if (w.label === before.label) continue;
    const text =
      w.kind === "rain" ? (w.strength >= 1 ? "Thunder and heavy rain across Lagos. Stay off the roads if you can; expect floods in low areas." : "Showers across the city. Umbrellas out, and watch for slow traffic.")
      : w.kind === "fog" ? "Dusty harmattan haze is cutting how far you can see. Drive carefully."
      : w.kind === "clear" ? "Clear skies and plenty of sun. Drink water."
      : "Grey skies over the city, but no rain yet.";
    out.push({ id: `weather-${ws - k}`, at: (ws - k) * WEATHER_MS, kind: "weather", title: `Weather: ${w.label}`, text });
  }
  return out.sort((a, b) => b.at - a.at);
}
