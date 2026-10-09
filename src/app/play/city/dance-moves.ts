// The dance moves people do on a club's dance floor: the regulars mix them up, players pick one
// (and everyone in the club sees it). Kept apart from the 3D code so menus can list them cheaply.

export const DANCE_MOVES = [
  { id: "groove", label: "Groove" },
  { id: "armsup", label: "Hands up" },
  { id: "shaku", label: "Shaku shaku" },
  { id: "point", label: "Disco point" },
  { id: "wave", label: "Body wave" },
  { id: "gwara", label: "Gwara gwara" },
  { id: "legwork", label: "Legwork" },
  { id: "spin", label: "Spin" },
] as const;

export type DanceMove = (typeof DANCE_MOVES)[number]["id"];

export const isDanceMove = (v: unknown): v is DanceMove => DANCE_MOVES.some((m) => m.id === v);

/** Beats per second on every dance floor (120 a minute): the crowd, the lights and you move together. */
export const CLUB_BPS = 2;

/** When beat 0 was (performance.now() seconds). The club music resets it, so everyone dances in time with what you hear. */
let beatOrigin = 0;

/** The music just played beat n: line the dancing up with it. */
export function syncBeat(n: number) {
  beatOrigin = performance.now() / 1000 - n / CLUB_BPS;
}

/** The beat now (whole numbers are on the beat). */
export function clubBeat() {
  return (performance.now() / 1000 - beatOrigin) * CLUB_BPS;
}
