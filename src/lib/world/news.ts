// The city's news (docs/NEWS.md): the weather, fires, traffic, power cuts, market prices, stars
// spotted about town, football, floods, road works, festivals. Made from the clock and the map,
// the same for everyone at the same moment (no database), a new story every 20 minutes and the
// weather every 3 hours. The weather also shows in the sky (rain falls when the news says so).
// Players' own news (new inventions) is added by the screen.

import type { RegionMap } from "./compile.ts";
import { toTile } from "./geo.ts";

export type NewsKind = "weather" | "fire" | "traffic" | "power" | "market" | "star" | "sport" | "flood" | "roads" | "festival" | "city" | "fun" | "money" | "game";

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

/** Street life: the stories Lagos actually talks about (an area, a landmark; title and text). */
const FUN: ((a: string, l: string) => [string, string])[] = [
  (a) => [`Goat chases danfo conductor down ${a} street`, `Witnesses say the goat "had a point". The conductor has agreed to give correct change from now on.`],
  (a) => [`Owambe in ${a} runs three days, nobody knows whose party it is`, `Guests say the jollof was too good to ask questions. Aso-ebi sellers report record sales.`],
  (a) => [`${a} man returns borrowed generator after 11 years`, `"I was going to bring it back," he told reporters. The owner says it now works better than before.`],
  (_a, l) => [`Pastor prophesies traffic will clear at ${l}; it does not`, `Drivers stuck for two hours say they are "still believing".`],
  (a) => [`NEPA brings light to ${a} for 4 hours straight; residents suspicious`, `Some households switched everything on at once, just in case. Freezers are full again.`],
  (a) => [`Okada rider in ${a} wins "politest rider" award, immediately overcharges judge`, `He says the award covers "goodwill, not fuel".`],
  (_a, l) => [`Crowd gathers at ${l} to watch a man parallel park perfectly`, `Onlookers clapped. Some cried. One person asked him to teach a class.`],
  (a) => [`Mama Put in ${a} raises meat price, adds "small" extra rice to calm customers`, `Customers say the peace deal is holding, for now.`],
  (a) => [`Landlord in ${a} asks for two years' rent upfront "because of the economy"`, `Tenants responded by asking for two years of light upfront. Talks continue.`],
  (_a, l) => [`Mystery DJ sets up speakers at ${l}, whole street starts dancing`, `Police arrived to break it up and were seen doing the shaku shaku within minutes.`],
  (a) => [`Area boys in ${a} demand "settlement" from a new billboard`, `The billboard did not pay. The area boys are reportedly "reviewing their strategy".`],
  (a) => [`${a} wedding: groom arrives late on okada, still makes a grand entrance`, `The bride says she has "seen worse". The okada man stayed for the reception.`],
  (_a, l) => [`Tourist asks for directions at ${l}, gets 5 different answers, all confident`, `All five routes reportedly end at a suya spot. Locals call it "the Lagos way".`],
  (a) => [`Power bank charging business booms in ${a} after blackout`, `One entrepreneur now charges ₦500 a bar. Analysts call it "the real economy".`],
  (a) => [`Agbero in ${a} gives back change without being asked; area in shock`, `Commuters say they will remember this day. The agbero says it was "a mistake".`],
  (_a, l) => [`Cow spotted taking selfies near ${l}`, `Okay, it was standing next to someone taking selfies. Still a great photo.`],
  (a) => [`Street football final in ${a} ends 9-8 after 4 hours and one broken window`, `The window's owner has asked for a rematch. On a different street.`],
  (a) => [`Estate in ${a} installs new gate; gateman now more powerful than the estate chairman`, `Residents need a password, a smile and sometimes a bottle of Malt to get home.`],
  (_a, l) => [`Buskers near ${l} play Fela for 6 hours, crowd refuses to leave`, `Some fans have started a petition to make it every Saturday.`],
  (a) => [`Jollof war breaks out between two caterers in ${a}`, `The judges declared a draw "for their own safety".`],
  (a) => [`${a} landlord paints house gold; neighbours squint`, `"It reflects my personality," he says. It also reflects the sun into three windows.`],
  (_a, l) => [`Rumour: a famous billionaire may buy ${l}`, `Nobody can confirm it. Everybody is repeating it.`],
  (a) => [`Thugs block road in ${a}, ask for "toll"; residents pay in jokes instead`, `The thugs laughed, let everyone pass, and asked for the jokes to be written down.`],
  (a) => [`Phone repairer in ${a} fixes cracked screen in 4 minutes, customers line up round the block`, `He says the secret is "experience and small prayer".`],
];

/** One story for a 20-minute slot. */
function storyOf(slot: number, p: ReturnType<typeof placesOf>): NewsItem {
  const at = slot * STORY_MS;
  const area = pickOf(p.areas, rand(slot, 2));
  const id = `news-${slot}`;
  // About a third of the time, street life: the funny, everyday stories.
  if (rand(slot, 20) < 0.35) {
    const l = pickOf(p.landmarks, rand(slot, 21));
    const [title, text] = pickOf(FUN, rand(slot, 22))(area.name, l.name);
    return { id, at, kind: "fun", title, text, area: area.name, x: area.x, z: area.z };
  }
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

/** Something a player did that made the news: bought a dear home, put a business on a building, arrived rich. */
export type PlayerEvent = {
  id: string;
  at: number;
  kind: "buy" | "business" | "rich" | "challenge";
  who: string;
  what: string;
  price: number;
  building?: string;
  /** Where it happened (tiles), when it isn't a building (a challenge on the map). */
  x?: number;
  z?: number;
  /** A challenge: who else played (their names) and how many. */
  beat?: string[];
};

/** A player's big moment as a headline, said with some fun (the same words each time for the same event). */
export function playerStory(e: PlayerEvent, area: string, price: string): Pick<NewsItem, "title" | "text"> {
  let h = 0;
  for (const c of e.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pick = <T,>(xs: T[]) => xs[h % xs.length];
  const where = area || "Lagos";
  if (e.kind === "business")
    return pick([
      { title: `${e.who} lights up ${where}`, text: `A new name glows over ${where}: ${e.who} has taken a whole building. Neighbours say the sign is so bright they've stopped buying candles.` },
      { title: `Big business lands in ${where}: ${e.who}`, text: `${e.who} has put its name on a building in ${where}. Area boys have already asked who the "chairman" is.` },
      { title: `${where} gets a new landmark: ${e.who}`, text: `Tap the glowing building to find out what ${e.who} does. Early visitors say the receptionist is very friendly.` },
    ]);
  if (e.kind === "challenge") {
    const n = (e.beat?.length ?? 0) + 1;
    const others = e.beat?.length ? (e.beat.length === 1 ? e.beat[0] : `${e.beat.slice(0, -1).join(", ")} and ${e.beat.at(-1)}`) : "the challengers";
    const prize = e.price > 0 ? price : "bragging rights";
    return pick([
      { title: `${e.who} wins ${e.what} showdown in ${where}`, text: `${n} players sat down, one stood up smiling. ${e.who} beat ${others} and walked away with ${prize}. Rematch? The streets are talking.` },
      { title: `"Game over!": ${e.who} takes the pot in ${where}`, text: `${e.who} cleaned out ${others} at ${e.what} and pocketed ${prize}. Someone is already saying the game was "not fair at all".` },
      { title: `${where}: ${others} vs ${e.who}. Guess who won.`, text: `It was ${e.who}. ${e.what}, ${prize}, and a victory dance that witnesses describe as "unnecessary but effective".` },
      { title: `Champion alert: ${e.who} rules ${e.what} in ${where}`, text: `${e.who} beat ${others} for ${prize}. Think you can do better? Tap Challenge and find out.` },
      { title: `${e.who} sends ${others} home empty-handed`, text: `A ${e.what} challenge in ${where} ended with ${e.who} collecting ${prize}. The losers have asked for "small time to recover".` },
    ]);
  }
  if (e.kind === "rich")
    return pick([
      { title: `Big money arrives: ${e.who} lands in Lagos`, text: `Born into a rich family, ${e.who} has just arrived with ${price} to spend. Estate agents across Lekki are ironing their best shirts.` },
      { title: `${e.who} touches down with ${price}`, text: `Sources say ${e.who}'s family "sent small money". Small for who? Watch this space.` },
    ]);
  return pick([
    { title: `${e.who} just bought ${e.what} in ${where} for ${price}`, text: `Neighbours say they saw three cars of "family members" arrive within the hour. Congratulations are pouring in.` },
    { title: `Odogwu alert: ${e.who} drops ${price} in ${where}`, text: `${e.who} is the proud new owner of ${e.what}. The gateman has already asked for a raise.` },
    { title: `"Na my house be this": ${e.who} buys in ${where}`, text: `${e.what} for ${price}. Witnesses report the agent did a small dance after the papers were signed.` },
    { title: `${where} has a new big man (or big woman): ${e.who}`, text: `${e.who} paid ${price} for ${e.what}. Neighbours are already planning the housewarming they weren't invited to.` },
    { title: `Bank alert heard across ${where}`, text: `${e.who} just spent ${price} on ${e.what}. Somewhere, a landlord is wiping a tear of joy.` },
  ]);
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
