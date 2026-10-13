// The first five minutes (docs/FIRST_STEPS.md): three things to do on day one (say hi, play a
// challenge, go out), each with a small reward, shown one at a time by the guide on the map.

/** The reward for each step (naira; paid in mint at the city's rate, once per player). */
export const FIRST_STEP_NAIRA = 20_000;

export type FirstStep = "hi" | "challenge" | "out";

/** What the server says (POST /api/first-steps): which are done, which were paid just now. */
export type FirstSteps = { hi: boolean; challenge: boolean; out: boolean; paid: string[]; rewardNaira: number };

export const FIRST_STEPS: { id: FirstStep; title: string; text: string }[] = [
  { id: "hi", title: "Say hi to someone", text: "Tap the green online count at the top, pick someone and send them a message." },
  { id: "challenge", title: "Play a challenge", text: "Tap the trophy (top right) to start a game of Whot! or Ludo, or join one that lights up near you." },
  { id: "out", title: "Go out", text: "Tap a club, a restaurant or a landmark on the map and go in. Your room is home: you can always go back." },
];
