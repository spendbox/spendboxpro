// Conversations with the city's people. The player picks one of a few suggested replies (or
// types something short); the person answers in character. Every answer is written by the
// grammar from a seed made of (who, which conversation, which turn, what you said), so the
// same chat replays the same way, but a new chat (or a different reply) goes somewhere else.
//
// Some answers ask the game to do something real first (`action`):
//   "hint"  → ask the server for a real, rough clue (gossips only; rare)
//   "gift"  → ask the server for a few coins (generous people only; capped)
//   "quest" → ask the server for a side quest (quest-givers only)
// then `afterAction` turns the server's answer into the person's next line.

import { flavour, moodAt, personaOf, voiceFor, type Npc } from "../npcs";
import { expand, say, tidy, type Voice } from "./grammar";
import { JOKES, RIDDLES } from "./jokes";
import { TOPICS, type Mood, type Topic } from "./lines";
import type { Special } from "./personas";
import { between, chance, hashText, pick, sample, seeded, type Rand } from "./rng";

export type Intent =
  | { kind: "start" }
  | { kind: "hello" }
  | { kind: "topic"; topic: Topic; word?: string }
  | { kind: "more" }
  | { kind: "about" }
  | { kind: "npc" }
  | { kind: "hint" }
  | { kind: "gift" }
  | { kind: "quest" }
  | { kind: "joke" }
  | { kind: "punchline" }
  | { kind: "groan" }
  | { kind: "riddle" }
  | { kind: "guess"; answer: string }
  | { kind: "giveup" }
  | { kind: "fortune" }
  | { kind: "advice" }
  | { kind: "sell" }
  | { kind: "lore" }
  | { kind: "gossip" }
  | { kind: "compliment" }
  | { kind: "tease" }
  | { kind: "bye" }
  | { kind: "free"; word?: string };

export type Choice = { label: string; intent: Intent };

export type TalkAction = "hint" | "gift" | "quest";

/** How a line looks in the chat: a clue, a gift, a quest offer, a joke… */
export type LineTag = "clue" | "gift" | "quest" | "joke" | "riddle";

export type TalkLine = { text: string; tag?: LineTag };

export type TalkState = {
  /** Which conversation with this person ("New chat" starts the next one). */
  convo: number;
  /** Turns so far in this conversation. */
  n: number;
  topic: Topic | null;
  pending: { type: "joke" | "riddle"; i: number } | null;
  /** Things that happen once per conversation. */
  used: { hint?: boolean; gift?: boolean; quest?: boolean };
  /** A liar sticks to their story (mostly). */
  tale: { count: number; area: string } | null;
  /** Recent lines, so nobody repeats themselves. */
  recent: string[];
  jokes: number[];
  riddles: number[];
  ended: boolean;
};

export type TalkReply = {
  lines: TalkLine[];
  /** Ask the server for this first, then call afterAction. */
  action?: TalkAction;
  /** True when the person brought it up themselves (stay quiet if nothing comes of it). */
  unprompted?: boolean;
  state: TalkState;
  choices: Choice[];
};

export type HintAnswer = { hint: { tile: number; count: number; repeat?: boolean } | null; why?: string } | { error: string };
export type GiftAnswer = { coins: number; why?: string } | { error: string };
export type QuestAnswer = { quest: { title: string; brief: string } | null; why?: string } | { error: string };

export type TalkOptions = {
  /** A made-up place for liars' clues (a street name), from a random number. */
  fakeArea: (rand: Rand) => string;
  /** The place name for a real clue's tile. */
  areaOf?: (tile: number) => string;
};

export function newTalk(convo = 0): TalkState {
  return { convo, n: 0, topic: null, pending: null, used: {}, tale: null, recent: [], jokes: [], riddles: [], ended: false };
}

// ---------------------------------------------------------------- reading what the player typed

const TOPIC_WORDS: [Topic, RegExp][] = [
  ["hunt", /\b(hunt|hunter|hunters|drone|drones|sweep|search|searching|bot|caught|catch|seek|seeker|seeking|decoy)\b/],
  ["food", /\b(food|eat|eating|hungry|jollof|rice|suya|chop|puff[- ]?puff|amala|egusi|pizza|burger|drink|zobo|shawarma|plantain|dinner|lunch|breakfast|snack|soup|yam)\b/],
  ["weather", /\b(weather|rain|raining|sun|sunny|hot|cold|harmattan|wind|cloud|clouds|storm|sky)\b/],
  ["music", /\b(music|song|songs|dance|dancing|afrobeats?|amapiano|dj|sing|singing|concert|beat|highlife)\b/],
  ["football", /\b(football|soccer|match|goal|goals|team|eagles|league|striker|referee|penalty)\b/],
  ["gossip", /\b(gossip|gist|news|tea|rumou?r|rumou?rs|scandal|drama)\b/],
  ["place", /\b(building|floor|roof|rooftop|lift|elevator|office|here|this place|view|balloon|train|bus|boat)\b/],
  ["money", /\b(money|coins?|cash|rich|broke|price|prices|salary|pay|naira|business)\b/],
  ["love", /\b(love|crush|date|dating|marry|married|wedding|single|boyfriend|girlfriend|romance)\b/],
  ["work", /\b(work|job|boss|office|career|shift|salary)\b/],
  ["tech", /\b(phone|wifi|wi-fi|internet|data|network|battery|app|computer|laptop|tech)\b/],
  ["life", /\b(life|happy|sad|meaning|dream|dreams|future|purpose|tired|bored)\b/],
  ["lore", /\b(story|stories|legend|legends|history|tale|tales|myth|old days|long ago)\b/],
  ["advice", /\b(advice|advise|should i|tips?|help me decide|what do i do)\b/],
];

/** What the player meant by something they typed. */
export function readIntent(text: string, state: TalkState): Intent {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9'?\- ]+/g, " ").replace(/\s+/g, " ").trim()} `;
  if (state.pending?.type === "riddle") {
    if (/\b(give up|no idea|i don'?t know|dunno|tell me|pass)\b/.test(t)) return { kind: "giveup" };
    return { kind: "guess", answer: text.slice(0, 60) };
  }
  if (state.pending?.type === "joke") {
    if (/\b(no|stop|boring|enough|please don'?t)\b/.test(t)) return { kind: "groan" };
    return { kind: "punchline" };
  }
  if (/\b(bye|goodbye|see you|see ya|later|gotta go|good night|ciao|o dabo|sai anjima)\b/.test(t)) return { kind: "bye" };
  if (/\b(npc|robot|real person|human|an ai|a bot|real)\b/.test(t) && /\b(you|you're|youre|u)\b/.test(t)) return { kind: "npc" };
  if (
    /\b(clue|clues|hint|hints|hot ?spots?|tip off)\b/.test(t) ||
    (/\b(ghost|ghosts|hider|hiders|hiding|hide|people|players?)\b/.test(t) && /\b(where|near|around|seen|see|spot|spotted|heard|know)\b/.test(t))
  )
    return { kind: "hint" };
  if (/\b(give me|spare|dash me|loan|lend|pay me|i'?m broke|am broke|help me with (money|coins))\b/.test(t)) return { kind: "gift" };
  if (/\b(quest|quests|mission|errand|errands|task|favou?r|job for me|help you|work for you)\b/.test(t)) return { kind: "quest" };
  if (/\b(joke|jokes|make me laugh|funny one)\b/.test(t)) return { kind: "joke" };
  if (/\b(riddle|riddles|puzzle|brain ?teaser)\b/.test(t)) return { kind: "riddle" };
  if (/\b(fortune|destiny|palm|horoscope|stars say|will i win)\b/.test(t)) return { kind: "fortune" };
  if (/\b(sell|selling|buy|deal|deals|goods|discount|last price)\b/.test(t)) return { kind: "sell" };
  if (/\b(who are you|your name|about you|yourself|where are you from|how old|your age|what do you do)\b/.test(t)) return { kind: "about" };
  if (/\b(stupid|idiot|ugly|dumb|boring|liar|annoying|shut up|useless|fool|mad)\b/.test(t)) return { kind: "tease" };
  if (/\b(love you|like you|nice|cool|great|awesome|beautiful|handsome|funny|smart|best|kind|sweet)\b/.test(t)) return { kind: "compliment" };
  if (/^ (hi|hello|hey|yo|how far|wetin dey|good (morning|afternoon|evening)|sup|hiya|kedu|sannu|howdy) /.test(t)) return { kind: "hello" };
  for (const [topic, re] of TOPIC_WORDS) {
    const m = re.exec(t);
    if (m) return { kind: "topic", topic, word: m[1] };
  }
  if (/\b(more|really|and then|go on|why|how|what)\b/.test(t) && state.topic) return { kind: "more" };
  return { kind: "free" };
}

// ---------------------------------------------------------------- helpers

const keyOf = (i: Intent) => ("topic" in i ? `${i.kind}:${i.topic}` : "answer" in i ? `${i.kind}:${i.answer}` : i.kind);

function voice(npc: Npc, rand: Rand, at: number, extra?: Record<string, string | number | undefined>): Voice {
  return voiceFor(npc, rand, at, extra);
}

/** The player's side: plain shared lines, no personality (sometimes with a little lead-in). */
function playerSays(npc: Npc, rule: string, rand: Rand, at: number) {
  const v = { ...voice(npc, rand, at), own: undefined, mood: undefined };
  const line = say(rule, v).replace(/\.$/, "");
  if (line.length < 12 || !chance(rand, 0.3)) return line;
  const lead = say("ask_lead", v).replace(/\.$/, "");
  return `${lead} ${line.replace(/^([A-Z])(?=[a-z'])/, (c) => c.toLowerCase()).replace(/^i\b/, "I")}`;
}

const SPECIAL_INTENT: Record<Special, Intent> = {
  hint: { kind: "hint" },
  gift: { kind: "gift" },
  quest: { kind: "quest" },
  joke: { kind: "joke" },
  riddle: { kind: "riddle" },
  fortune: { kind: "fortune" },
  advice: { kind: "advice" },
  sell: { kind: "sell" },
  lore: { kind: "lore" },
  gossip: { kind: "gossip" },
};
const SPECIAL_RULE: Record<Special, string> = {
  hint: "ask_hint", gift: "ask_gift", quest: "ask_quest", joke: "ask_joke", riddle: "ask_riddle", fortune: "ask_fortune",
  advice: "ask_advice", sell: "ask_sell", lore: "ask_lore", gossip: "ask_gossip",
};

function normal(s: string) {
  return s.toLowerCase().replace(/^(a|an|the|your)\s+/, "").replace(/[^a-z0-9 ]+/g, "").trim();
}

/** Suggested replies for the next turn (3–4, different every time). */
export function choicesFor(npc: Npc, state: TalkState, at: number): Choice[] {
  const rand = seeded(`${npc.id}|${npc.roundId}|${state.convo}|${state.n}|choices`);
  const p = (rule: string) => playerSays(npc, rule, rand, at);
  if (state.pending?.type === "joke") {
    return [
      { label: pick(rand, ["Why?", "I don't know, why?", "Go on, tell me!", "Hmm… why?", "I give up, why?"]), intent: { kind: "punchline" } },
      { label: pick(rand, ["Not another joke…", "Please, no more jokes", "Spare me", "Is this going to hurt?"]), intent: { kind: "groan" } },
      { label: p("ask_more").replace(/^Tell me more$/, "Just tell me"), intent: { kind: "punchline" } },
    ];
  }
  if (state.pending?.type === "riddle") {
    const riddle = RIDDLES[state.pending.i];
    const wrong = sample(rand, RIDDLES.filter((r) => normal(r.a) !== normal(riddle.a)).map((r) => r.a), 2);
    const options = sample(rand, [riddle.a, ...new Set(wrong)], 3);
    return [
      ...options.map((a) => ({ label: `Is it ${a}?`, intent: { kind: "guess", answer: a } as Intent })),
      { label: pick(rand, ["I give up", "No idea, tell me", "Pass!"]), intent: { kind: "giveup" } },
    ];
  }
  const persona = personaOf(npc);
  const out: Choice[] = [];
  const add = (c: Choice) => {
    if (!out.some((o) => keyOf(o.intent) === keyOf(c.intent) || o.label === c.label)) out.push(c);
  };
  if (state.ended) {
    add({ label: pick(rand, ["Wait, one more thing!", "Actually, before you go…", "Hold on!"]), intent: { kind: "hello" } });
  } else if (state.topic && chance(rand, 0.85)) {
    add({ label: p("ask_more"), intent: { kind: "more" } });
  }
  // What they're known for (once it's used, something else).
  const special = persona.special;
  const spent = (special === "hint" && state.used.hint) || (special === "gift" && state.used.gift) || (special === "quest" && state.used.quest);
  if (!spent && (state.n === 0 || chance(rand, 0.75))) add({ label: p(SPECIAL_RULE[special]), intent: SPECIAL_INTENT[special] });
  // A change of subject: their favourites first.
  const fresh = (t: Topic) => t !== state.topic;
  const favourite = npc.topics.filter(fresh);
  const t1 = favourite.length && chance(rand, 0.7) ? pick(rand, favourite) : pick(rand, TOPICS.filter(fresh));
  add({ label: p(`ask_${t1}`), intent: { kind: "topic", topic: t1 } });
  // A wildcard.
  const wild: [Intent, string, number][] = [
    [{ kind: "about" }, "ask_about", state.n < 4 ? 3 : 1],
    [{ kind: "hint" }, "ask_hint", state.used.hint ? 0.5 : 2],
    [{ kind: "joke" }, "ask_joke", 2],
    [{ kind: "riddle" }, "ask_riddle", 1.5],
    [{ kind: "gossip" }, "ask_gossip", 1.5],
    [{ kind: "npc" }, "ask_npc", 0.6],
    [{ kind: "compliment" }, "ask_compliment", 1],
    [{ kind: "tease" }, "ask_tease", 0.7],
    [{ kind: "bye" }, "ask_bye", state.n >= 4 && !state.ended ? 2.5 : 0],
    [{ kind: "fortune" }, "ask_fortune", 0.6],
    [{ kind: "quest" }, "ask_quest", state.used.quest ? 0 : 0.5],
    [{ kind: "gift" }, "ask_gift", state.used.gift ? 0 : 0.5],
  ];
  for (let tries = 0; out.length < 4 && tries < 6; tries++) {
    const total = wild.reduce((s, w) => s + w[2], 0);
    let r = rand() * total;
    const w = wild.find((x) => (r -= x[2]) < 0) ?? wild[0];
    add({ label: p(w[1]), intent: w[0] });
  }
  if (out.length < 3) {
    const t2 = pick(rand, TOPICS.filter((t) => fresh(t) && t !== t1));
    add({ label: p(`ask_${t2}`), intent: { kind: "topic", topic: t2 } });
  }
  return out.slice(0, 4);
}

// ---------------------------------------------------------------- the person's answers

function finish(npc: Npc, state: TalkState, lines: TalkLine[], at: number, extra?: Partial<TalkReply>): TalkReply {
  const said = lines.map((l) => l.text).filter(Boolean);
  const next: TalkState = { ...state, n: state.n + 1, recent: [...state.recent, ...said].slice(-40) };
  return { lines: lines.filter((l) => l.text), state: next, choices: choicesFor(npc, next, at), ...extra };
}

/** The opening line of a new conversation. */
export function begin(npc: Npc, state: TalkState, at: number): TalkReply {
  const rand = seeded(`${npc.id}|${npc.roundId}|${state.convo}|begin`);
  const v = voice(npc, rand, at);
  const lines: TalkLine[] = [{ text: flavour(npc, say("greet", v), rand, at) }];
  if (chance(rand, 0.35)) lines.push({ text: say(chance(rand, 0.5) ? "mood_line" : "opener", v) });
  return finish(npc, { ...newTalk(state.convo), convo: state.convo }, lines, at);
}

/** The person's answer to what the player picked or typed. */
export function respond(npc: Npc, state: TalkState, intent: Intent, at: number, opts: TalkOptions, typed = ""): TalkReply {
  const persona = personaOf(npc);
  let best: TalkReply | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const rand = seeded(`${npc.id}|${npc.roundId}|${state.convo}|${state.n}|${keyOf(intent)}|${hashText(typed)}|${attempt}`);
    const reply = answer(npc, persona, state, intent, at, opts, rand);
    best = reply;
    if (!reply.lines.some((l) => state.recent.includes(l.text))) break;
  }
  return best!;
}

function answer(npc: Npc, persona: ReturnType<typeof personaOf>, state: TalkState, intent: Intent, at: number, opts: TalkOptions, rand: Rand): TalkReply {
  const v = voice(npc, rand, at);
  const s = (rule: string, extra?: Record<string, string | number | undefined>) => say(rule, extra ? { ...v, vars: { ...v.vars, ...extra } } : v);
  const lines: TalkLine[] = [];
  let next: TalkState = { ...state, ended: false, pending: null };
  let action: TalkAction | undefined;
  let unprompted = false;

  const topicLine = (topic: Topic) => {
    let text = s(`t_${topic}`);
    if (chance(rand, 0.22)) {
      let more = s(`t_${topic}`);
      for (let k = 0; k < 3 && more === text; k++) more = s(`t_${topic}`);
      if (more !== text) text += ` ${s("more_lead")} ${more.replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase())}`;
    }
    if (chance(rand, 0.33)) text += ` ${s(`q_${topic}`)}`;
    return text;
  };

  switch (intent.kind) {
    case "start":
      return begin(npc, state, at);
    case "hello": {
      lines.push({ text: `${s("react_hi")} ${chance(rand, 0.5) ? s("opener") : s("smalltalk")}` });
      break;
    }
    case "topic": {
      next.topic = intent.topic;
      const lead = intent.word && chance(rand, 0.35) ? `${s("echo", { word: intent.word })} ` : chance(rand, 0.3) ? `${s("react_ok")} ` : "";
      lines.push({ text: lead + topicLine(intent.topic) });
      break;
    }
    case "more": {
      const topic = state.topic ?? pick(rand, npc.topics);
      next.topic = topic;
      lines.push({ text: `${chance(rand, 0.6) ? `${s("react_more")} ` : ""}${topicLine(topic)}` });
      break;
    }
    case "about":
      lines.push({ text: s("about_me") });
      if (chance(rand, 0.4)) lines.push({ text: npc.blurb });
      break;
    case "npc":
      lines.push({ text: s("npc_meta") });
      break;
    case "gossip":
      next.topic = "gossip";
      lines.push({ text: topicLine("gossip") });
      break;
    case "lore":
      next.topic = "lore";
      lines.push({ text: s("t_lore") });
      break;
    case "advice":
      next.topic = "advice";
      lines.push({ text: s("t_advice") });
      break;
    case "fortune":
      lines.push({ text: npc.persona === "fortune" ? s("fortune") : `${pick(rand, ["I'm no fortune teller, but…", "Let me try. Hmm…", "My aunty taught me this:"])} ${s("fortune")}` });
      break;
    case "sell":
      lines.push({ text: npc.persona === "hustler" ? s("sell") : pick(rand, ["Me? I'm not selling anything. Except good vibes. Free.", "Nothing for sale here, friend.", tidy(expand("Ask a hustler. I'm just {roleLower.a}.", v))]) });
      break;
    case "compliment":
      lines.push({ text: s("compliment_back") });
      break;
    case "tease":
      lines.push({ text: s("tease_back") });
      break;
    case "bye":
      next.ended = true;
      lines.push({ text: s("bye") });
      break;
    case "joke": {
      const left = JOKES.map((_, i) => i).filter((i) => !state.jokes.includes(i));
      const i = pick(rand, left.length ? left : JOKES.map((_, k) => k));
      next.pending = { type: "joke", i };
      next.jokes = [...state.jokes, i].slice(-30);
      lines.push({ text: `${s("joke_intro")} ${JOKES[i].setup}`, tag: "joke" });
      break;
    }
    case "punchline": {
      const i = state.pending?.type === "joke" ? state.pending.i : pick(rand, JOKES.map((_, k) => k));
      lines.push({ text: JOKES[i].punch, tag: "joke" });
      if (chance(rand, 0.5)) lines.push({ text: s(npc.persona === "clown" || chance(rand, 0.5) ? "joke_after" : "react_laugh") });
      break;
    }
    case "groan":
      lines.push({ text: s("groan_back") });
      break;
    case "riddle": {
      const left = RIDDLES.map((_, i) => i).filter((i) => !state.riddles.includes(i));
      const i = pick(rand, left.length ? left : RIDDLES.map((_, k) => k));
      next.pending = { type: "riddle", i };
      next.riddles = [...state.riddles, i].slice(-30);
      lines.push({ text: `${s("riddle_intro")} ${RIDDLES[i].q}`, tag: "riddle" });
      break;
    }
    case "guess":
    case "giveup": {
      const r = state.pending?.type === "riddle" ? RIDDLES[state.pending.i] : null;
      if (!r) {
        lines.push({ text: s("deflect") });
        break;
      }
      const right = intent.kind === "guess" && (normal(intent.answer) === normal(r.a) || normal(intent.answer).includes(normal(r.a).split(" ").pop() ?? "#"));
      lines.push({ text: s(intent.kind === "giveup" ? "riddle_giveup" : right ? "riddle_right" : "riddle_wrong", { answer: r.a }), tag: "riddle" });
      break;
    }
    case "hint": {
      if (npc.clue === "real") {
        if (!state.used.hint) lines.push({ text: s("hint_offer") });
        action = "hint";
        next.used = { ...next.used, hint: true };
      } else if (npc.clue === "fake") {
        const fake = fakeClue(next, rand, s, opts);
        lines.push({ text: fake.text, tag: "clue" });
        next = { ...next, tale: fake.tale, used: { ...next.used, hint: true } };
      } else {
        lines.push({ text: s("hint_dunno") });
      }
      next.topic = "hunt";
      break;
    }
    case "gift": {
      if (npc.gives && !state.used.gift) {
        action = "gift";
        next.used = { ...next.used, gift: true };
      } else if (npc.gives) {
        lines.push({ text: s("gift_already") });
      } else {
        lines.push({ text: s("gift_refuse") });
      }
      next.topic = "money";
      break;
    }
    case "quest": {
      if (npc.quests && !state.used.quest) {
        action = "quest";
        next.used = { ...next.used, quest: true };
      } else if (npc.quests) {
        lines.push({ text: pick(rand, ["One job at a time! Finish the last one first.", "I already gave you something to do!", "Patience. One errand per chat."]) });
      } else {
        lines.push({ text: s("quest_refuse") });
      }
      break;
    }
    case "free":
    default: {
      const topic = pick(rand, npc.topics);
      next.topic = topic;
      lines.push({ text: `${s("deflect")} ${topicLine(topic)}` });
      break;
    }
  }

  // Their habits, now and then.
  if (lines.length && !action) {
    const last = lines[lines.length - 1];
    if (!last.tag) last.text = flavour(npc, last.text, rand, at);
  }

  // Things people bring up by themselves.
  if (!action && !next.pending && !next.ended && state.n >= 1) {
    if (npc.clue === "real" && !next.used.hint && (next.topic === "hunt" || next.topic === "gossip") && chance(rand, 0.45)) {
      action = "hint";
      unprompted = true;
      next.used = { ...next.used, hint: true };
    } else if (npc.clue === "fake" && !next.used.hint && next.topic === "hunt" && chance(rand, 0.4)) {
      const fake = fakeClue(next, rand, s, opts);
      lines.push({ text: fake.text, tag: "clue" });
      next = { ...next, tale: fake.tale, used: { ...next.used, hint: true } };
    } else if (npc.gives && !next.used.gift && state.n >= 2 && chance(rand, 0.3)) {
      lines.push({ text: s("gift_offer") });
      action = "gift";
      unprompted = true;
      next.used = { ...next.used, gift: true };
    } else if (npc.quests && !next.used.quest && chance(rand, 0.4)) {
      lines.push({ text: s("quest_offer") });
      action = "quest";
      unprompted = true;
      next.used = { ...next.used, quest: true };
    }
  }

  return finish(npc, next, lines.map((l) => ({ ...l, text: tidy(l.text) })), at, { action, unprompted });
}

/** A liar's (or a bad detective's, or the spirits') made-up clue: confident, and wrong. */
function fakeClue(
  state: TalkState,
  rand: Rand,
  s: (rule: string, extra?: Record<string, string | number | undefined>) => string,
  opts: TalkOptions,
): { text: string; tale: NonNullable<TalkState["tale"]> } {
  const keep = state.tale && chance(rand, 0.7);
  const tale = keep && state.tale ? state.tale : { count: between(rand, 2, 7), area: opts.fakeArea(rand) };
  const text = s("hint_fake", { count: tale.count, area: tale.area });
  if (state.tale && !keep) return { text: `${pick(rand, ["Actually, wait. I remember now.", "No, no, I mixed it up.", "Forget what I said before."])} ${text}`, tale };
  return { text, tale };
}

/** Turns what the server said into the person's next line. */
export function afterAction(
  npc: Npc,
  state: TalkState,
  action: TalkAction,
  result: HintAnswer | GiftAnswer | QuestAnswer,
  at: number,
  opts: TalkOptions,
  unprompted = false,
): TalkReply {
  const rand = seeded(`${npc.id}|${npc.roundId}|${state.convo}|${state.n}|after|${action}`);
  const v = voice(npc, rand, at);
  const s = (rule: string, extra?: Record<string, string | number | undefined>) => say(rule, extra ? { ...v, vars: { ...v.vars, ...extra } } : v);
  const lines: TalkLine[] = [];
  const next = { ...state };
  if ("error" in result) {
    if (!unprompted) lines.push({ text: `${pick(rand, ["Hmm, hold on…", "Wait…", "Eh?"])} ${result.error}` });
    return finish(npc, next, lines, at);
  }
  if (action === "hint" && "hint" in result) {
    const h = result.hint;
    if (h) {
      const area = opts.areaOf ? opts.areaOf(h.tile) : `tile ${h.tile}`;
      const rule = h.repeat ? "hint_again" : h.count <= 1 ? "hint_real_one" : "hint_real";
      lines.push({ text: s(rule, { count: h.count, area }), tag: "clue" });
      next.topic = "hunt";
    } else if (!unprompted) {
      lines.push({ text: s(result.why === "no_hunt" ? "hint_nohunt" : "hint_none") });
    }
  } else if (action === "gift" && "coins" in result) {
    if (result.coins > 0) lines.push({ text: s("gift_yes", { coins: result.coins }), tag: "gift" });
    else lines.push({ text: s(result.why === "already" ? "gift_already" : result.why === "daily_cap" ? "gift_cap" : "gift_no") });
  } else if (action === "quest" && "quest" in result) {
    if (result.quest) lines.push({ text: s("quest_yes", { title: result.quest.title, brief: result.quest.brief.replace(/\.?$/, ".") }), tag: "quest" });
    else lines.push({ text: s("quest_none") });
  }
  return finish(npc, next, lines.map((l) => ({ ...l, text: tidy(l.text) })), at);
}

/** How long the person "types" before a line appears (ms). */
export function typingTime(npc: Npc, text: string) {
  return Math.round(Math.min(2400, 450 + text.length * 16) * (personaOf(npc).pace ?? 1));
}

/** Their mood right now, for the card. */
export function moodLabel(npc: Npc, at: number): Mood {
  return moodAt(npc, at);
}
