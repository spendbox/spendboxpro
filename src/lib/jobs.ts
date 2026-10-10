// Jobs: any commercial building in town can give you a job. You apply with a short trivia
// interview about the town you're in (its name, country, money, streets, station, famous places,
// a local trivia question); score at least the job's pass mark and you're hired. A job pays mint
// by the hour while the town lasts, taxed, and builds a skill: with the skill, the same kind of
// job in the next town needs no interview. The database side is game-db/035_fees_and_jobs.sql.
//
// Shared by the server (which asks and marks the interview, so the answers never reach the
// phone) and the screens (job titles, pay and skills).

import { TRIVIA, type TriviaCategory } from "@/app/play/activities/trivia-questions";
import { FLAVORS, LANDMARKS, nameOf, type LandmarkKey } from "@/lib/city/places";
import { streetName, stationName, type CityPlan } from "@/lib/city/layout";

export type Skill =
  | "hospitality"
  | "retail"
  | "office"
  | "finance"
  | "health"
  | "safety"
  | "transport"
  | "entertainment"
  | "tech"
  | "tourism"
  | "fitness"
  | "education"
  | "industry";

export const SKILLS: Record<Skill, { label: string; colour: string }> = {
  hospitality: { label: "Hospitality", colour: "#e8590c" },
  retail: { label: "Retail", colour: "#d6336c" },
  office: { label: "Office work", colour: "#495057" },
  finance: { label: "Finance", colour: "#2b8a3e" },
  health: { label: "Health care", colour: "#e03131" },
  safety: { label: "Public safety", colour: "#1971c2" },
  transport: { label: "Transport", colour: "#f08c00" },
  entertainment: { label: "Entertainment", colour: "#ae3ec9" },
  tech: { label: "Science and tech", colour: "#0c8599" },
  tourism: { label: "Tourism", colour: "#15aabf" },
  fitness: { label: "Sport and fitness", colour: "#12b886" },
  education: { label: "Education", colour: "#7048e8" },
  industry: { label: "Industry", colour: "#868e96" },
};

/** A job: its id and title, the skill it builds, mint an hour, and the interview pass mark (out of INTERVIEW_LENGTH). */
export type Job = { job: string; title: string; skill: Skill; pay: number; pass: number };

const J = (job: string, title: string, skill: Skill, pay: number, pass = 3): Job => ({ job, title, skill, pay, pass });

/** The job at each kind of place (CityRoom.type). Places not listed (houses, parks...) don't hire. More jobs will come. */
export const JOBS: Record<string, Job> = {
  restaurant: J("waiter", "Waiter", "hospitality", 6),
  club: J("bartender", "Bartender", "entertainment", 8),
  hotel: J("receptionist", "Hotel receptionist", "hospitality", 10),
  spa: J("therapist", "Spa therapist", "hospitality", 9),
  office: J("clerk", "Office clerk", "office", 8),
  tower: J("analyst", "Business analyst", "office", 14, 4),
  twin: J("analyst", "Business analyst", "office", 14, 4),
  capitol: J("civil_servant", "Civil servant", "office", 12, 4),
  bank: J("teller", "Bank teller", "finance", 15, 4),
  mall: J("shop_assistant", "Shop assistant", "retail", 6),
  megamall: J("store_manager", "Store manager", "retail", 11, 4),
  market: J("trader", "Market trader", "retail", 5),
  fuel: J("attendant", "Fuel attendant", "transport", 5),
  station: J("ticket_officer", "Ticket officer", "transport", 7),
  airport: J("check_in", "Check-in agent", "tourism", 12, 4),
  intlairport: J("cabin_crew", "Cabin crew", "tourism", 16, 4),
  spaceport: J("mission_control", "Mission control assistant", "tech", 20, 4),
  port: J("dock_worker", "Dock worker", "industry", 9),
  power: J("technician", "Plant technician", "industry", 12, 4),
  solar: J("technician", "Plant technician", "industry", 12, 4),
  dam: J("technician", "Plant technician", "industry", 12, 4),
  oilrig: J("rig_hand", "Rig hand", "industry", 18, 4),
  hospital: J("nurse", "Nurse", "health", 12, 4),
  police: J("officer", "Police officer", "safety", 10, 4),
  fire: J("firefighter", "Firefighter", "safety", 10, 4),
  museum: J("guide", "Museum guide", "tourism", 8),
  funfair: J("ride_operator", "Ride operator", "entertainment", 6),
  waterpark: J("lifeguard", "Lifeguard", "fitness", 8),
  arena: J("steward", "Stadium steward", "entertainment", 7),
  stadium: J("steward", "Stadium steward", "entertainment", 7),
  court: J("steward", "Arena steward", "entertainment", 7),
  boxing: J("steward", "Arena steward", "entertainment", 7),
  wrestling: J("steward", "Arena steward", "entertainment", 7),
  gym: J("coach", "Fitness coach", "fitness", 9),
  campus: J("lab_assistant", "Lab assistant", "education", 9),
  school: J("teaching_assistant", "Teaching assistant", "education", 8),
};

/** The job a place gives, or null if it doesn't hire. */
export function jobAt(type: string | undefined): Job | null {
  return (type && JOBS[type]) || null;
}

/** Questions in an interview. */
export const INTERVIEW_LENGTH = 5;

/** An interview question as the player sees it (the server keeps the answer). */
export type InterviewQuestion = { q: string; options: string[] };

const COUNTRY: Record<string, { name: string; money: string; trivia: TriviaCategory }> = {
  ng: { name: "Nigeria", money: "Naira", trivia: "Nigeria" },
  us: { name: "the United States", money: "Dollar", trivia: "World" },
  uk: { name: "the United Kingdom", money: "Pound", trivia: "World" },
  gh: { name: "Ghana", money: "Cedi", trivia: "Africa" },
  ke: { name: "Kenya", money: "Shilling", trivia: "Africa" },
  za: { name: "South Africa", money: "Rand", trivia: "Africa" },
};
const MONEY = ["Naira", "Dollar", "Pound", "Cedi", "Shilling", "Rand", "Euro", "Franc"];
const COUNTRIES = ["Nigeria", "the United States", "the United Kingdom", "Ghana", "Kenya", "South Africa", "France", "Brazil"];

/** A small seeded random number maker (the same key always asks the same questions). */
function rng(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Built = { q: string; right: string; wrong: string[] };

/** Three different wrong answers from a list (never the right one). */
function pickWrong(r: () => number, pool: string[], right: string) {
  const left = [...new Set(pool)].filter((x) => x && x !== right);
  const out: string[] = [];
  while (out.length < 3 && left.length) out.push(left.splice(Math.floor(r() * left.length), 1)[0]);
  return out;
}

function landmarkNames(flavorId: string, keys: LandmarkKey[]) {
  const lm = LANDMARKS[flavorId];
  if (!lm) return [];
  const out: string[] = [];
  for (const k of keys) for (const n of lm.wide[k] ?? []) out.push(nameOf(n));
  return out;
}

/**
 * The interview for a job at a place in this town, with the right answers: the town's name
 * always, then four of country, money, a street, the station, a famous place and local trivia.
 * `key` makes it the same every time for the same player, town and place.
 */
export function buildInterview(plan: CityPlan, placeName: string, job: Job, key: string): { questions: InterviewQuestion[]; answers: number[] } {
  const r = rng(key);
  const flavor = plan.city.flavor;
  const country = COUNTRY[flavor.id] ?? { name: "this country", money: "Naira", trivia: "World" as TriviaCategory };
  const others = FLAVORS.filter((f) => f.id !== flavor.id);
  const otherCities = others.flatMap((f) => f.cities).concat(flavor.cities.filter((c) => c !== plan.city.name));
  const built: Built[] = [{ q: "Which town are you in right now?", right: plan.city.name, wrong: pickWrong(r, otherCities, plan.city.name) }];
  const extra: (() => Built | null)[] = [
    () => ({ q: `Which country is ${plan.city.name} in?`, right: country.name, wrong: pickWrong(r, COUNTRIES, country.name) }),
    () => ({ q: `What money do people spend in ${country.name}?`, right: country.money, wrong: pickWrong(r, MONEY, country.money) }),
    () => {
      // A street that's really in this town, against streets from other countries.
      const k = Math.floor(r() * 7) - 3;
      const right = streetName(plan, r() < 0.5 ? "x" : "z", k);
      const base = right.split(" ").slice(0, -1).join(" ");
      const wrong = pickWrong(r, others.flatMap((f) => f.streets).filter((s) => s !== base), base).map((s) => `${s} ${right.split(" ").slice(-1)[0]}`);
      return { q: `Which of these streets is in ${plan.city.name}?`, right, wrong };
    },
    () => {
      const right = stationName(plan);
      return { q: `What is the railway station in ${plan.city.name} called?`, right, wrong: pickWrong(r, otherCities.map((c) => `${c} Central Station`), right) };
    },
    () => {
      const mine = landmarkNames(flavor.id, ["bridge", "stadium", "monument", "market", "museum"]);
      if (!mine.length) return null;
      const right = mine[Math.floor(r() * mine.length)];
      const theirs = others.flatMap((f) => landmarkNames(f.id, ["bridge", "stadium", "monument", "market", "museum"]));
      return { q: `Which of these famous places is in ${country.name}?`, right, wrong: pickWrong(r, theirs, right) };
    },
    () => {
      const bank = TRIVIA.filter((t) => t.cat === country.trivia);
      if (!bank.length) return null;
      const t = bank[Math.floor(r() * bank.length)];
      return { q: t.q, right: t.right, wrong: [...t.wrong] };
    },
    () => {
      const right = placeName;
      const decoys = ["The Corner Kitchen", "Harbour Bistro", "Club Neon", "Grand Plaza Hotel", "City Mall", "Central Bank", "Sunset Diner", "Riverside Office Park"];
      return { q: `Where are you applying to work as ${/^[aeiou]/i.test(job.title) ? "an" : "a"} ${job.title.toLowerCase()}?`, right, wrong: pickWrong(r, decoys, right) };
    },
  ];
  // Four of the others, in a random order.
  const order = extra.map((f) => ({ f, k: r() }));
  order.sort((a, b) => a.k - b.k);
  for (const { f } of order) {
    if (built.length >= INTERVIEW_LENGTH) break;
    const b = f();
    if (b && b.wrong.length === 3) built.push(b);
  }
  const questions: InterviewQuestion[] = [];
  const answers: number[] = [];
  for (const b of built) {
    const at = Math.floor(r() * 4);
    const options = [...b.wrong];
    options.splice(at, 0, b.right);
    questions.push({ q: b.q, options });
    answers.push(at);
  }
  return { questions, answers };
}

/** Pay an hour with a skill level's bonus (5% a level). */
export function payWithSkill(pay: number, level: number, bonus = 0.05) {
  return Math.round(pay * (1 + level * bonus) * 100) / 100;
}
