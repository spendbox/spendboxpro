// Other players in your story (docs/LIFE_WHEEL.md, phase 6). These moments are about a real player,
// a friend or someone who said they can be in other people's stories, and what you choose sends the
// next part to them (`link`): you lend Ade money in yours, and Ade gets "Pay them back?" in theirs;
// how that ends shapes what you feel about each other. {name} is the other player. Some move real
// money between you (`give`, within the usual gift limits); nobody can make another player pay.
//
// A thread starts with a moment marked `player.start` (picked only when there's someone to be in it);
// every other step is sent by a link and never picked on its own. The wallet you both spot is a
// dilemma played one after the other: you choose, then they choose without knowing what you chose,
// and each of you hears how it went.

import type { MomentDef } from "./moments.ts";

const SMALL: [number, number] = [1_000, 4_000];
const MEDIUM: [number, number] = [5_000, 25_000];

const reply = { followOnly: true, player: {} } as const;

export const PLAYER_MOMENTS: MomentDef[] = [
  // ---------------------------------------------------------------- a loan between you
  {
    id: "p_loan_ask",
    spots: "any",
    player: { start: true },
    area: "friends",
    ask: MEDIUM,
    emoji: "🤲🏾",
    title: "Short this week",
    text: ["Rent, light bill and a wedding, all in one week. You're {ask} short. Your friend {name} would probably help, if you asked."],
    choices: [
      { label: "Ask {name}", tone: "bold", traits: { people: 1, daring: 1 }, outcomes: [{ text: "You send the message and stare at your phone. Typing...", link: { send: "p_loan_request", hours: 0.05 } }] },
      { label: "Manage on your own", tone: "calm", traits: { people: -2, daring: -1 }, outcomes: [{ text: "Garri for a week. You'll manage. You always do.", effect: "bad_day" }] },
      { label: "Ask Oga Felix instead", tone: "bold", traits: { people: -1, daring: 2 }, outcomes: [{ text: "Felix lends at a rate you won't tell anyone about.", get: 1, effect: "in_debt" }] },
    ],
  },
  {
    id: "p_loan_request",
    spots: "any",
    ...reply,
    area: "friends",
    ask: MEDIUM,
    emoji: "📱",
    title: "{name} needs a favour",
    text: ["A message from {name}: \"I'm so sorry to ask. Can you lend me {ask}? I'll pay you back next week, I promise.\""],
    choices: [
      { label: "Send it", tone: "kind", traits: { giving: 2, people: 1 }, outcomes: [{ text: "Sent. {name} replies with eleven crying emojis.", give: 1, feel: 2, stood: true, link: { send: "p_loan_repay", hours: 72 } }] },
      { label: "Send half", tone: "calm", traits: { giving: 1, daring: -1 }, outcomes: [{ text: "\"Half is a lot. Thank you.\"", give: 0.5, feel: 1, link: { send: "p_loan_repay", hours: 72, ask: 0.5 } }] },
      { label: "Say you can't", tone: "calm", traits: { giving: -2 }, outcomes: [{ text: "\"No wahala, I understand.\" Do they?", feel: -1, link: { send: "p_loan_refused", hours: 0.05 } }] },
    ],
  },
  {
    id: "p_loan_refused",
    spots: "any",
    ...reply,
    area: "friends",
    emoji: "📵",
    title: "{name} said no",
    text: ["{name} can't lend you the money. They said sorry."],
    choices: [
      { label: "Fair enough", tone: "kind", traits: { wrongs: 2 }, outcomes: [{ text: "Everybody has their own wahala. You figure something out.", feel: 0 }] },
      { label: "Remember it", tone: "mean", traits: { wrongs: -2 }, outcomes: [{ text: "You'll remember who was there when you needed them.", feel: -2 }] },
    ],
  },
  {
    id: "p_loan_repay",
    spots: "any",
    ...reply,
    area: "money",
    ask: MEDIUM,
    emoji: "📆",
    title: "Next week is here",
    text: ["It's been a week since {name} lent you {ask}. You promised."],
    choices: [
      { label: "Pay {name} back", tone: "kind", traits: { truth: 2 }, outcomes: [{ text: "Paid, with a voice note saying thank you.", give: 1, feel: 1, trust: 2, link: { send: "p_loan_repaid", hours: 0.05 } }] },
      { label: "Pay it back, and a little extra", tone: "kind", traits: { truth: 1, giving: 2 }, outcomes: [{ text: "With a bit on top \"for the trouble\". {name} will remember that.", give: 1.2, feel: 2, trust: 2, link: { send: "p_loan_repaid", hours: 0.05 } }] },
      { label: "Ask for another week", tone: "calm", outcomes: [{ text: "\"Just one more week, please.\" You send it and wait.", trust: -1, link: { send: "p_loan_late", hours: 0.05 } }] },
      { label: "Stay quiet and hope they forget", tone: "mean", traits: { truth: -3 }, outcomes: [{ text: "You don't reply. Some friendships end with a bang; this one is ending with silence.", feel: -1, trust: -3, link: { send: "p_loan_ghosted", hours: 48 } }] },
    ],
  },
  {
    id: "p_loan_repaid",
    spots: "any",
    ...reply,
    area: "friends",
    emoji: "✅",
    title: "{name} paid you back",
    text: ["{name} has paid you back, on the day they promised."],
    choices: [
      { label: "\"Any time\"", tone: "kind", outcomes: [{ text: "You mean it. That's what friends are for.", feel: 2 }] },
      { label: "Say nothing, just a thumbs up", tone: "calm", outcomes: [{ text: "👍🏾. Done.", feel: 1 }] },
    ],
  },
  {
    id: "p_loan_late",
    spots: "any",
    ...reply,
    area: "money",
    emoji: "⏳",
    title: "{name} needs more time",
    text: ["\"Please, one more week. Things are hard.\" {name} still owes you."],
    choices: [
      { label: "Another week, fine", tone: "kind", traits: { wrongs: 2 }, outcomes: [{ text: "\"Thank you. Truly.\"", feel: 1, link: { send: "p_loan_repay", hours: 168 } }] },
      { label: "\"I need it now\"", tone: "bold", traits: { wrongs: -2 }, outcomes: [{ text: "Firm. Fair. The chat goes quiet for a while.", feel: -1, link: { send: "p_loan_repay", hours: 12 } }] },
      { label: "Forget it, it's a gift", tone: "kind", traits: { giving: 2, wrongs: 1 }, outcomes: [{ text: "\"Keep it. Sort yourself out.\" {name} calls you, crying.", feel: 3, stood: true }] },
    ],
  },
  {
    id: "p_loan_ghosted",
    spots: "any",
    ...reply,
    area: "money",
    emoji: "👻",
    title: "Still nothing from {name}",
    text: ["Two weeks. {name} has seen your messages and not replied. They were online an hour ago."],
    choices: [
      { label: "Let it go", tone: "calm", traits: { wrongs: 2 }, outcomes: [{ text: "Lesson learnt, at a price.", feel: -2 }] },
      { label: "Tell your friends", tone: "mean", traits: { wrongs: -2 }, outcomes: [{ text: "Now everyone knows. It doesn't bring the money back.", feel: -3, effect: "talked_about" }] },
    ],
  },

  // ---------------------------------------------------------------- a lift in the rain
  {
    id: "p_lift",
    spots: ["road"],
    rides: ["car", "taxi"],
    stage: "rain",
    player: { start: true },
    area: "friends",
    ask: SMALL,
    emoji: "🌧️",
    title: "{name} in the rain",
    text: ["Heavy rain at the bus stop, and there's {name}, soaked, waving at every car that passes. Yours is next."],
    choices: [
      { label: "Pull over and pick them up", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "{name} gets in dripping and laughing. You take them all the way home.", pay: 0.3, feel: 2, stood: true, link: { send: "p_lift_back", hours: 48 } }] },
      { label: "Send them money for a taxi", tone: "kind", traits: { giving: 2, daring: -1 }, outcomes: [{ text: "You can't stop here, but you send {ask} for a cab. \"You're a lifesaver!\"", give: 1, feel: 1, link: { send: "p_lift_back", hours: 48 } }] },
      { label: "Drive on", tone: "calm", traits: { people: -2 }, outcomes: [{ text: "You're running late. You tell yourself they didn't see you." }] },
    ],
  },
  {
    id: "p_lift_back",
    spots: "any",
    ...reply,
    area: "friends",
    ask: SMALL,
    emoji: "🚗",
    title: "{name}'s car won't start",
    text: ["Remember the rain, when {name} picked you up? Today their car has died right by you, and they haven't seen you yet."],
    choices: [
      { label: "Go and help push", tone: "kind", traits: { people: 2, daring: 1 }, outcomes: [{ text: "You push, it starts, you both cheer like you've won the league.", feel: 2, stood: true, link: { send: "p_lift_returned", hours: 0.05 } }] },
      { label: "Pay for a mechanic", tone: "kind", traits: { giving: 2 }, outcomes: [{ text: "You send {name} what a mechanic will cost. \"I owe you one.\" \"We're even.\"", give: 1, feel: 2, link: { send: "p_lift_returned", hours: 0.05 } }] },
      { label: "Walk past quickly", tone: "mean", traits: { people: -2 }, outcomes: [{ text: "They didn't see you. Probably.", feel: -1 }] },
    ],
  },
  {
    id: "p_lift_returned",
    spots: "any",
    ...reply,
    area: "friends",
    emoji: "🤝🏾",
    title: "{name} came back for you",
    text: ["Your car died, and out of nowhere it was {name}, sleeves rolled up. You gave them a lift once; they hadn't forgotten."],
    choices: [
      { label: "Buy them lunch", tone: "kind", outcomes: [{ text: "Pepper soup and stories. A good afternoon.", pay: 0.5, feel: 2 }] },
      { label: "\"We're family now\"", tone: "kind", outcomes: [{ text: "They laugh. They also don't disagree.", feel: 2 }] },
    ],
    ask: SMALL,
  },

  // ---------------------------------------------------------------- vouching for a job
  {
    id: "p_vouch_ask",
    spots: ["work", "street", "home"],
    player: { start: true },
    area: "work",
    emoji: "📄",
    title: "A reference",
    text: ["A company you'd love to work for wants a reference from someone who knows you well. {name} would do it, if you asked."],
    choices: [
      { label: "Ask {name} to vouch for you", tone: "bold", outcomes: [{ text: "Sent. Now {name}'s name is on the line too.", link: { send: "p_vouch_request", hours: 0.05 } }] },
      { label: "Use an old teacher instead", tone: "calm", traits: { people: -1, ways: 1 }, outcomes: [{ text: "Your old teacher writes three lines. It's fine." }] },
    ],
  },
  {
    id: "p_vouch_request",
    spots: "any",
    ...reply,
    area: "work",
    emoji: "✍🏾",
    title: "Vouch for {name}?",
    text: ["{name} asks you to vouch for them for a job. If they do badly, it's your name too."],
    choices: [
      { label: "Vouch, all the way", tone: "kind", traits: { people: 2, daring: 1 }, outcomes: [{ text: "\"The best person I know.\" You mean it, mostly.", feel: 2, stood: true, link: { send: "p_vouch_job", hours: 72 } }] },
      { label: "Vouch, carefully", tone: "calm", traits: { truth: 2, daring: -1 }, outcomes: [{ text: "\"Reliable, hard-working.\" True and safe.", feel: 1, link: { send: "p_vouch_job", hours: 72 } }] },
      { label: "Say you don't know them well enough", tone: "calm", traits: { truth: 1, people: -2 }, outcomes: [{ text: "\"I understand.\" They don't, really.", feel: -1, link: { send: "p_vouch_declined", hours: 0.05 } }] },
    ],
  },
  {
    id: "p_vouch_declined",
    spots: "any",
    ...reply,
    area: "work",
    emoji: "🙅🏾",
    title: "{name} won't vouch",
    text: ["{name} says they don't know you well enough to vouch for you."],
    choices: [
      { label: "Ask someone else", tone: "calm", outcomes: [{ text: "Your cousin vouches. Your cousin vouches for everyone.", feel: 0 }] },
      { label: "Take it personally", tone: "mean", outcomes: [{ text: "You thought you were closer than that.", feel: -2 }] },
    ],
  },
  {
    id: "p_vouch_job",
    spots: "any",
    ...reply,
    area: "work",
    ask: MEDIUM,
    emoji: "💼",
    title: "The job {name} got you",
    text: ["You got the job, thanks to {name}'s word. Week two: your manager offers you {ask} to quietly fudge some figures. Nobody would know. {name} would be blamed if it came out."],
    choices: [
      { label: "Refuse and do it straight", tone: "kind", traits: { truth: 3 }, outcomes: [{ text: "Your manager shrugs. Your work speaks for itself, and for {name}.", trust: 2, feel: 1, link: { send: "p_vouch_proud", hours: 24 } }] },
      { label: "Take the money", tone: "mean", traits: { truth: -3 }, outcomes: [{ chance: 0.6, text: "Nobody finds out. This time.", get: 1, unseen: true, trust: -2 }, { chance: 0.4, text: "The audit finds it. You're out, and {name}'s name comes up.", get: 1, rep: -4, trust: -3, link: { send: "p_vouch_shame", hours: 24 } }] },
    ],
  },
  {
    id: "p_vouch_proud",
    spots: "any",
    ...reply,
    area: "work",
    emoji: "🌟",
    title: "{name} made you proud",
    text: ["The company that hired {name} on your word calls you: \"Do you know anyone else like them?\""],
    choices: [
      { label: "Tell {name}", tone: "kind", outcomes: [{ text: "They're quiet on the phone for a second. \"Thank you for believing in me.\"", feel: 2, rep: 2 }] },
      { label: "Just smile", tone: "calm", outcomes: [{ text: "Your word is worth something. Good to know.", rep: 2 }] },
    ],
  },
  {
    id: "p_vouch_shame",
    spots: "any",
    ...reply,
    area: "work",
    emoji: "😬",
    title: "Your word, broken",
    text: ["The company that hired {name} on your word calls: they were caught fudging the figures. \"You recommended them.\""],
    choices: [
      { label: "Stand by them", tone: "kind", traits: { people: 2, wrongs: 2 }, outcomes: [{ text: "\"Everyone makes one mistake.\" The company is not impressed. {name} hears you did it.", rep: -1, feel: 1, stood: true }] },
      { label: "Apologise and distance yourself", tone: "calm", traits: { truth: 1, people: -1 }, outcomes: [{ text: "\"I'm sorry. I didn't know.\" Your name survives.", rep: -1, feel: -2 }] },
      { label: "Tell {name} what you think of them", tone: "mean", traits: { wrongs: -2 }, outcomes: [{ text: "A long voice note. Some of it is fair.", feel: -3 }] },
    ],
  },

  // ---------------------------------------------------------------- a wallet you both saw
  {
    id: "p_wallet",
    spots: ["street", "shop"],
    player: { start: true },
    area: "street",
    ask: MEDIUM,
    emoji: "👛",
    title: "You and {name} saw it",
    text: ["A fat wallet on the pavement: {ask} and an ID card. {name} has seen it too, from across the road. You're closer."],
    choices: [
      { label: "Pick it up and return it", tone: "kind", traits: { truth: 2 }, outcomes: [{ text: "You pick it up and wave {name} over. \"Let's find the owner.\"", rep: 1, link: { send: "p_wallet_h", hours: 0.05 } }] },
      { label: "Pocket it quickly", tone: "mean", traits: { truth: -3 }, outcomes: [{ text: "Into your pocket before anyone blinks. Except {name} blinked.", get: 1, link: { send: "p_wallet_k", hours: 0.05 } }] },
    ],
  },
  // What {name} (who saw it first) did is hidden from you here: these two read the same.
  {
    id: "p_wallet_h",
    spots: "any",
    ...reply,
    area: "street",
    ask: MEDIUM,
    emoji: "👛",
    title: "The wallet you and {name} saw",
    text: ["The wallet on the pavement: {name} got to it first and is waving you over. What do you say?"],
    choices: [
      { label: "\"Let's find the owner\"", tone: "kind", traits: { truth: 2 }, outcomes: [{ text: "{name} grins: \"That's what I said!\" You find the owner together. She cries.", rep: 2, feel: 2, link: { send: "p_wallet_together", hours: 0.05 } }] },
      { label: "\"Let's split it\"", tone: "mean", traits: { truth: -2 }, outcomes: [{ text: "{name} looks at you strangely. \"I'm returning it.\" You feel very small.", rep: -1, feel: -1, link: { send: "p_wallet_tempted", hours: 0.05 } }] },
      { label: "Say nothing", tone: "calm", outcomes: [{ text: "{name} returns it alone. The owner thanks {name}, not you." }] },
    ],
  },
  {
    id: "p_wallet_k",
    spots: "any",
    ...reply,
    area: "street",
    ask: MEDIUM,
    emoji: "👛",
    title: "The wallet you and {name} saw",
    text: ["The wallet on the pavement: {name} got to it first and is waving you over. What do you say?"],
    choices: [
      { label: "\"Let's find the owner\"", tone: "kind", traits: { truth: 2 }, outcomes: [{ text: "{name} laughs. \"Owner? It's in my pocket.\" You argue all the way to the junction, and tell people after.", rep: 1, feel: -2, link: { send: "p_wallet_called_out", hours: 0.05 } }] },
      { label: "\"Let's split it\"", tone: "mean", traits: { truth: -2 }, outcomes: [{ text: "{name} counts out half, grinning. Partners in crime.", get: 0.5, feel: 1, link: { send: "p_wallet_shared", hours: 0.05 } }] },
      { label: "Say nothing", tone: "calm", outcomes: [{ text: "{name} walks off with it. You saw. You'll remember." , feel: -1 }] },
    ],
  },
  {
    id: "p_wallet_together",
    spots: "any",
    ...reply,
    area: "street",
    emoji: "🫶🏾",
    title: "{name} wanted to return it too",
    text: ["About the wallet: {name} said straight away, \"Let's find the owner.\" You did, together."],
    choices: [{ label: "Good person, that {name}", tone: "kind", outcomes: [{ text: "Some people you can trust with a wallet. Now you know one.", feel: 2, trust: 1 }] }],
  },
  {
    id: "p_wallet_tempted",
    spots: "any",
    ...reply,
    area: "street",
    emoji: "🤨",
    title: "{name} wanted to split it",
    text: ["About the wallet: when you said you'd return it, {name} asked to split it instead."],
    choices: [
      { label: "Let it go", tone: "kind", traits: { wrongs: 2 }, outcomes: [{ text: "Everybody is tempted once. They didn't push.", feel: 0 }] },
      { label: "Watch them from now on", tone: "calm", traits: { wrongs: -1 }, outcomes: [{ text: "Noted.", feel: -2 }] },
    ],
  },
  {
    id: "p_wallet_called_out",
    spots: "any",
    ...reply,
    area: "street",
    emoji: "📢",
    title: "{name} told people",
    text: ["About the wallet you pocketed: {name} wanted to find the owner, and has been telling people what you did."],
    choices: [
      { label: "Return it now", tone: "kind", traits: { truth: 2 }, outcomes: [{ text: "Late, but you find the owner. Some people forgive you.", pay: 1, rep: 1, feel: 0 }] },
      { label: "Deny it", tone: "mean", traits: { truth: -2 }, outcomes: [{ text: "Your word against {name}'s. Most people believe {name}.", rep: -3, feel: -2, effect: "talked_about" }] },
    ],
    ask: MEDIUM,
  },
  {
    id: "p_wallet_shared",
    spots: "any",
    ...reply,
    area: "street",
    ask: MEDIUM,
    emoji: "🤫",
    title: "{name} wanted half",
    text: ["About the wallet you pocketed: {name} saw, and wanted half. You gave it."],
    choices: [
      { label: "Fair's fair", tone: "calm", outcomes: [{ text: "Half each, and a secret between you.", pay: 0.5, feel: 1 }] },
      { label: "\"Finders keepers\"", tone: "mean", traits: { giving: -2 }, outcomes: [{ text: "You keep it all. {name} won't forget this one.", feel: -2 }] },
    ],
  },
];
