// The stadium's fixed timetable (no secrets: works the same on the server and in the browser).
// Every sport has numbered slots counted from a fixed epoch, so everyone agrees which match
// is on: football every 15 minutes, basketball every 12, boxing and wrestling every 10.
// Bets open 15 minutes before kick-off and close at kick-off.

import { sidesFor } from "./teams";
import type { MatchInfo, MatchOption, Sport } from "./types";

export const SPORTS: Sport[] = ["football", "basketball", "boxing", "wrestling"];

export const SPORT_INFO: Record<
  Sport,
  { label: string; verb: string; everyMin: number; lengthMin: number; ticket: number; place: string; noun: string }
> = {
  football: { label: "Football", verb: "Watch the match", everyMin: 15, lengthMin: 10, ticket: 20, place: "Stadium", noun: "match" },
  basketball: { label: "Basketball", verb: "Watch the game", everyMin: 12, lengthMin: 8, ticket: 15, place: "Basketball court", noun: "game" },
  boxing: { label: "Boxing", verb: "Watch the fight", everyMin: 10, lengthMin: 6, ticket: 15, place: "Boxing arena", noun: "fight" },
  wrestling: { label: "Wrestling", verb: "Watch the fight", everyMin: 10, lengthMin: 5, ticket: 15, place: "Wrestling arena", noun: "match" },
};

/** Slot 0 of every sport starts here (1 Jan 2026, 00:00 UTC), plus the sport's offset. */
const EPOCH = Date.UTC(2026, 0, 1);
/** Sports start at different minutes so the stadium always has something coming up. */
const OFFSET_MIN: Record<Sport, number> = { football: 0, basketball: 4, boxing: 2, wrestling: 7 };
/** Bets open this long before kick-off. */
export const OPENS_BEFORE_MS = 15 * 60_000;
/** Far enough ahead for any id anyone could send (about 190 years of slots). */
const MAX_SLOT = 10_000_000;

const MINUTE = 60_000;

export function kickoffOf(sport: Sport, slot: number): number {
  return EPOCH + OFFSET_MIN[sport] * MINUTE + slot * SPORT_INFO[sport].everyMin * MINUTE;
}

/** The slot whose kick-off is the latest one at or before `nowMs`. */
export function slotAt(sport: Sport, nowMs: number): number {
  return Math.floor((nowMs - EPOCH - OFFSET_MIN[sport] * MINUTE) / (SPORT_INFO[sport].everyMin * MINUTE));
}

const cache = new Map<string, MatchInfo>();

export function matchAt(sport: Sport, slot: number): MatchInfo {
  const id = `${sport}:${slot}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const { home, away, league } = sidesFor(sport, slot);
  const kickoffAt = kickoffOf(sport, slot);
  const options: MatchOption[] =
    sport === "football"
      ? [
          { key: "home", label: home.name },
          { key: "draw", label: "Draw" },
          { key: "away", label: away.name },
        ]
      : [
          { key: "home", label: home.name },
          { key: "away", label: away.name },
        ];
  const match: MatchInfo = {
    id,
    sport,
    slot,
    title: `${home.name} vs ${away.name}`,
    home,
    away,
    options,
    opensAt: kickoffAt - OPENS_BEFORE_MS,
    kickoffAt,
    endsAt: kickoffAt + SPORT_INFO[sport].lengthMin * MINUTE,
    league,
  };
  if (cache.size > 200) cache.clear();
  cache.set(id, match);
  return match;
}

/** A match from its id ("football:2741"), or null if the id isn't a real slot. */
export function matchById(id: string): MatchInfo | null {
  if (typeof id !== "string" || id.length > 40) return null;
  const m = /^([a-z]+):(\d{1,8})$/.exec(id);
  if (!m) return null;
  const sport = m[1] as Sport;
  if (!SPORTS.includes(sport)) return null;
  const slot = Number(m[2]);
  if (!Number.isSafeInteger(slot) || slot < 0 || slot > MAX_SLOT) return null;
  return matchAt(sport, slot);
}

/**
 * What's on: the match being played right now (kick-off <= now < end), the next three that
 * haven't kicked off yet, and the last one that finished.
 */
export function liveAndNext(sport: Sport, nowMs: number): { live: MatchInfo | null; next: MatchInfo[]; last: MatchInfo | null } {
  const s = Math.max(0, slotAt(sport, nowMs));
  const cur = matchAt(sport, s);
  const live = cur.kickoffAt <= nowMs && nowMs < cur.endsAt ? cur : null;
  const next: MatchInfo[] = [];
  for (let i = cur.kickoffAt > nowMs ? s : s + 1; next.length < 3; i++) next.push(matchAt(sport, i));
  let last: MatchInfo | null = null;
  for (let i = s; i >= Math.max(0, s - 1); i--) {
    const m = matchAt(sport, i);
    if (m.endsAt <= nowMs) {
      last = m;
      break;
    }
  }
  return { live, next, last };
}

/** For "Match on now" badges: whether this sport has a match being played, and its title. */
export function liveLabel(sport: Sport, nowMs: number): { live: boolean; title: string | null; match: MatchInfo | null } {
  const { live } = liveAndNext(sport, nowMs);
  return { live: !!live, title: live?.title ?? null, match: live };
}

/** Every match being played right now, across all sports. */
export function liveNow(nowMs: number): MatchInfo[] {
  const out: MatchInfo[] = [];
  for (const s of SPORTS) {
    const { live } = liveAndNext(s, nowMs);
    if (live) out.push(live);
  }
  return out;
}

/** Whether bets are being taken on this match at `nowMs`. */
export function bettingOpen(match: MatchInfo, nowMs: number): boolean {
  return nowMs >= match.opensAt && nowMs < match.kickoffAt;
}
