// The walkthrough (docs/FIRST_STEPS.md): a few fun tips, three missions with rewards (paid once
// each by the server, game-db/080), then a tour of the rest. Everyone gets it, old players too.

export type Mission = "name" | "hi" | "win";

/** What each mission pays (naira, paid in mint at the city's rate). */
export const MISSION_NAIRA: Record<Mission, number> = { name: 20_000, hi: 50_000, win: 50_000 };

export const MISSIONS: Mission[] = ["name", "hi", "win"];

/** What the server says (POST /api/tutorial): which are done, which were paid just now. */
export type MissionState = { name: boolean; hi: boolean; win: boolean; paid: Mission[] };

/** The tutorial's stages, in order. */
export type Phase = "intro" | "missions" | "tips" | "done";

/** What the walkthrough points at, so that button glows. */
export type Glow = "home" | "hi" | "challenge" | "camera" | "profile" | null;

/** The next mission to do (null: all done or skipped). */
export function nextMission(done: Partial<Record<Mission, boolean>>, skipped: Mission[]): Mission | null {
  return MISSIONS.find((m) => !done[m] && !skipped.includes(m)) ?? null;
}

/** Everything the three missions pay together (naira). */
export const MISSIONS_TOTAL = MISSIONS.reduce((t, m) => t + MISSION_NAIRA[m], 0);
