// Big and life-changing moments (docs/LIFE_WHEEL.md): turning points that come about twice a week
// at most (big) or a few times a year (life-changing, rare). Each sets two good things against each
// other, so there's no answer that's simply right, and each has a tail: a follow-up days later
// that depends on what you chose. They happen anywhere: wherever you are when your phone rings.

import type { MomentDef } from "./moments.ts";

const BIG: [number, number] = [20_000, 60_000];
const HUGE: [number, number] = [100_000, 300_000];

export const BIG_MOMENTS: MomentDef[] = [
  // ---------------------------------------------------------------- family
  {
    id: "cousin_exam",
    spots: "any",
    size: "big",
    area: "family",
    weight: 3,
    ask: BIG,
    emoji: "📚",
    title: "Your cousin's exam",
    text: [
      "Aunty calls, whispering. {name}'s WAEC is tomorrow, and \"someone\" can get the questions for {ask}. \"You're the only one with money. Help your cousin.\"",
      "Your cousin {name} sends a voice note at midnight: exam tomorrow, a man is selling the questions for {ask}. \"Please. Don't tell my mum I asked.\"",
    ],
    choices: [
      { label: "Pay for the questions", tone: "kind", traits: { people: 2, truth: -2, ways: 1 }, outcomes: [{ text: "You send it. Aunty prays for you for ten minutes.", pay: 1, rep: 1, follow: "cousin_results_paid" }] },
      {
        label: "Refuse, and pay a lesson teacher instead",
        tone: "calm",
        traits: { truth: 2, giving: 1, daring: -1 },
        outcomes: [{ text: "You pay for a teacher for the night. Aunty goes quiet on the phone. {name} sends: \"OK. I'll try.\"", pay: 0.6, follow: "cousin_results_tutor" }],
      },
      {
        label: "Report the man selling questions",
        tone: "bold",
        traits: { truth: 2, wrongs: -2, people: -1 },
        outcomes: [
          { text: "You report him. The school changes the paper. Half the family isn't speaking to you.", rep: 2, follow: "cousin_results_tutor" },
          { chance: 0.4, text: "You report him, and somehow Aunty finds out it was you. Christmas will be cold.", rep: 1, effect: "talked_about", follow: "cousin_results_tutor" },
        ],
      },
      { label: "Stay out of it", tone: "calm", traits: { daring: -2, people: -1 }, outcomes: [{ text: "You let the call ring out. You'll hear how it went at Christmas, one way or another." }] },
    ],
  },
  {
    id: "cousin_results_paid",
    spots: "any",
    followOnly: true,
    area: "family",
    ask: BIG,
    emoji: "📜",
    title: "The results are out",
    text: ["{name}'s results are out. The questions you paid for..."],
    choices: [
      {
        label: "Open the message",
        tone: "calm",
        outcomes: [
          { chance: 0.45, text: "...were real. {name} passed everything. Aunty tells the whole church you're the family's pillar. You know what it was.", rep: 2 },
          { chance: 0.35, text: "...were fake. {name} failed, and the man has vanished with your money.", rep: -1 },
          { chance: 0.2, text: "...were real, and the exam board caught the whole centre. {name}'s results are cancelled. Somebody says your name.", rep: -4, effect: "talked_about" },
        ],
      },
    ],
  },
  {
    id: "cousin_results_tutor",
    spots: "any",
    followOnly: true,
    area: "family",
    emoji: "📜",
    title: "The results are out",
    text: ["{name}'s results are out. They passed four, failed two, and they're calling you first."],
    choices: [
      { label: "\"I'm proud of you\"", tone: "kind", traits: { wrongs: 1, people: 1 }, outcomes: [{ text: "{name} cries. \"I did it myself.\" Aunty sends a thank-you, finally.", rep: 3 }] },
      { label: "Pay for the resit", tone: "kind", traits: { giving: 2 }, outcomes: [{ text: "You pay for the two resits. This time there's no man with questions.", rep: 2 }] },
      { label: "Tell them to try harder", tone: "calm", traits: { wrongs: -1, ways: 1 }, outcomes: [{ text: "\"Yes, sir.\" \"Yes, ma.\" They will. It stings a bit.", rep: 1 }] },
    ],
  },
  {
    id: "sister_suitor",
    spots: "any",
    size: "big",
    area: "love",
    weight: 3,
    emoji: "💍",
    title: "The family meeting",
    text: [
      "Your sister wants to marry {name}. Your parents say no: wrong family, wrong job, wrong everything. Everyone is looking at you.",
      "Family meeting, Sunday afternoon. Your sister has brought {name} home. Your father won't shake his hand, and they want you to decide who's right.",
    ],
    choices: [
      { label: "Stand with your sister", tone: "bold", traits: { people: -1, ways: -2, daring: 1 }, outcomes: [{ text: "You say it out loud: it's her life. Your father leaves the room. Your sister holds your hand under the table.", rep: 1, follow: "sister_wedding" }] },
      { label: "Side with your parents", tone: "calm", traits: { ways: 2, people: 1 }, outcomes: [{ text: "You say what your parents want to hear. Your sister doesn't look at you again that day.", rep: 1, follow: "sister_wedding" }] },
      {
        label: "Take {name} out alone first",
        tone: "calm",
        traits: { daring: -1, truth: 2 },
        outcomes: [
          { text: "Over suya, {name} talks about your sister for an hour. You come back and say: he's alright.", follow: "sister_wedding" },
          { chance: 0.35, text: "Over suya, {name} asks how much your father earns. Twice. You come back with doubts.", follow: "sister_wedding" },
        ],
      },
      { label: "Refuse to choose", tone: "calm", traits: { daring: -2 }, outcomes: [{ text: "\"It's not my place.\" Nobody is happy, but nobody is angry at you either." }] },
    ],
  },
  {
    id: "sister_wedding",
    spots: "any",
    followOnly: true,
    area: "love",
    ask: BIG,
    emoji: "💒",
    title: "Your sister's news",
    text: ["Your sister calls, out of breath. She and {name} are getting married, with or without everyone's blessing, and they're short {ask} for the hall."],
    choices: [
      { label: "Pay for the hall", tone: "kind", traits: { giving: 2, ways: -1 }, outcomes: [{ text: "The hall is booked. At the wedding, your father comes after all, and stands near you.", pay: 1, rep: 3 }] },
      { label: "Bring your parents round first", tone: "bold", traits: { people: 2, ways: 1 }, outcomes: [{ chance: 0.5, text: "It takes three visits and one shouting match. Your father gives his blessing, and pays half.", pay: 0.5, rep: 3 }, { chance: 0.5, text: "Your father won't move. The wedding is small, and sad in places.", rep: 1 }] },
      { label: "Wish them well, from a distance", tone: "calm", traits: { daring: -1, people: -1 }, outcomes: [{ text: "You send a gift and a message. In the photos, there's a space where you'd be." }] },
    ],
  },
  // ---------------------------------------------------------------- work and money
  {
    id: "boss_offer",
    spots: "any",
    size: "big",
    area: "work",
    weight: 3,
    emoji: "💼",
    title: "Your boss's offer",
    text: [
      "Your boss closes the door. \"{name}'s job is yours from Monday, with a big raise. {name} doesn't know they're being let go yet. Keep it quiet.\"",
      "\"I want you as the new team lead.\" Your boss smiles. \"{name} is out; we'll tell them Friday. Not a word till then.\"",
    ],
    choices: [
      { label: "Take it and say nothing", tone: "calm", traits: { people: -2, truth: -1 }, outcomes: [{ text: "Monday, you move into {name}'s chair. {name}'s plant is still on the desk.", rep: 1, follow: "colleague_found_out" }] },
      {
        label: "Warn {name} tonight",
        tone: "kind",
        traits: { people: 2, truth: 1, daring: 1 },
        outcomes: [
          { text: "{name} finds another job before Friday and leaves with their head up. Your boss suspects you, but the job is still yours.", rep: 2 },
          { chance: 0.35, text: "{name} storms into the boss's office. Your boss knows who talked. The offer is gone.", rep: 1, effect: "bad_day" },
        ],
      },
      { label: "Turn it down", tone: "calm", traits: { daring: -2, truth: 1 }, outcomes: [{ text: "\"Not like this.\" Your boss looks at you differently, not entirely kindly.", rep: 1 }] },
      {
        label: "Take it, if {name} stays as your deputy",
        tone: "bold",
        traits: { people: 1, daring: 2 },
        outcomes: [
          { chance: 0.5, text: "Your boss sighs and agrees. {name} never learns how close it was. You do.", rep: 2, likelier: [{ trait: "daring", side: 1 }] },
          { chance: 0.5, text: "\"Don't negotiate with me.\" Your boss gives the job to someone else.", rep: 0 },
        ],
      },
    ],
  },
  {
    id: "colleague_found_out",
    spots: "any",
    followOnly: true,
    area: "work",
    emoji: "☕",
    title: "{name} at the bus stop",
    text: ["You run into {name} at the bus stop. \"You knew, didn't you? Before I did.\""],
    choices: [
      { label: "Tell the truth", tone: "bold", traits: { truth: 2 }, outcomes: [{ text: "\"Yes. I'm sorry.\" {name} nods slowly. \"At least you said it.\"", rep: 1 }, { chance: 0.4, text: "\"Yes.\" {name} walks off. The whole office hears about it by evening.", rep: -2, effect: "talked_about" }] },
      { label: "Deny it", tone: "calm", traits: { truth: -2 }, outcomes: [{ text: "\"I swear, I found out Monday.\" {name} doesn't believe you, and you both know it.", rep: -1 }] },
      { label: "Offer to help them find work", tone: "kind", traits: { people: 2, giving: 1 }, outcomes: [{ text: "You send {name} three contacts that night. One of them works out.", rep: 2, effect: "owed_favour" }] },
    ],
  },
  {
    id: "guarantor",
    spots: "any",
    size: "big",
    area: "money",
    weight: 3,
    ask: BIG,
    emoji: "🖊️",
    title: "Stand for me",
    text: [
      "Your friend {name} needs a guarantor for a {ask} bank loan to open a shop. \"If I don't pay, you pay. But I'll pay. You know me.\"",
      "{name} slides the form across the table. The guarantor line is empty. \"{ask}, two years. I just need your name.\"",
    ],
    choices: [
      { label: "Sign it", tone: "kind", traits: { people: 2, daring: 1, giving: 1 }, outcomes: [{ text: "You sign. {name} hugs you so hard your pen falls.", rep: 1, follow: "guarantor_due" }] },
      { label: "Say no", tone: "calm", traits: { giving: -2, daring: -1 }, outcomes: [{ text: "\"I can't, I'm sorry.\" {name} says it's fine. It isn't, quite.", rep: -1 }] },
      { label: "Lend a small part yourself instead", tone: "calm", traits: { giving: 1, daring: -1 }, outcomes: [{ text: "You give {name} a quarter of it, no paper. \"Pay me when you can.\"", pay: 0.25, rep: 1, follow: "loan_back" }, { chance: 0.4, text: "You give {name} a quarter, no paper. You don't hear about it again.", pay: 0.25, follow: "loan_ghost" }] },
      { label: "Sign, if they show you the plan", tone: "bold", traits: { truth: 1, daring: -1, people: 1 }, outcomes: [{ text: "The plan is good. Better than you expected. You sign.", rep: 1, follow: "guarantor_due" }] },
    ],
  },
  {
    id: "guarantor_due",
    spots: "any",
    followOnly: true,
    area: "money",
    ask: BIG,
    emoji: "🏦",
    title: "A letter from the bank",
    text: ["A letter from the bank with your name on it. {name}'s loan..."],
    choices: [
      {
        label: "Open it",
        tone: "calm",
        outcomes: [
          { chance: 0.55, text: "...is paid early. Inside is a card from {name}: \"First customer was my mother. Second is you, free, for life.\"", rep: 2, effect: "owed_favour", likelier: [{ effect: "lucky" }] },
          { chance: 0.45, text: "...is three months behind. The bank wants {ask} from you by the end of the week.", pay: 1 },
        ],
      },
    ],
  },
  {
    id: "japa_offer",
    spots: "any",
    size: "big",
    area: "work",
    weight: 2,
    emoji: "✈️",
    title: "An offer abroad",
    text: [
      "An email: a two-year job abroad, five times your pay. You'd leave in a month. Your mother has been ill since Easter.",
      "\"Japa!\" your friend {name} shouts down the phone. A company abroad wants you, with a visa, in a month. Your mother hasn't been well.",
    ],
    choices: [
      { label: "Go", tone: "bold", traits: { daring: 2, people: -1, ways: -1 }, outcomes: [{ text: "You say yes. Your mother says she's proud of you, and then goes to her room for a long time.", follow: "japa_letter" }] },
      { label: "Stay for your mother", tone: "kind", traits: { people: 2, ways: 2, daring: -1 }, outcomes: [{ text: "You turn it down. Your mother says you shouldn't have. She makes your favourite soup that night.", rep: 2 }] },
      { label: "Ask if it can be done from here", tone: "calm", traits: { ways: -1, daring: -1 }, outcomes: [{ chance: 0.35, text: "They say yes, for less pay. More than you get now, and you can stay.", rep: 1 }, { chance: 0.65, text: "\"We need you here.\" The offer goes to someone else." }] },
      { label: "Go, and send half home", tone: "bold", traits: { daring: 1, giving: 2, people: 1 }, outcomes: [{ text: "You go. The first payment home buys your mother's medicine for a year.", rep: 2, follow: "japa_letter" }] },
    ],
  },
  {
    id: "japa_letter",
    spots: "any",
    followOnly: true,
    area: "family",
    emoji: "📞",
    title: "A call from home",
    text: ["Your mother's voice on the line, smaller than you remember. \"When are you coming home?\""],
    choices: [
      { label: "\"Soon, Mummy\"", tone: "kind", traits: { people: 1 }, outcomes: [{ text: "You don't know when. She knows you don't know. She says she'll wait.", rep: 1 }] },
      { label: "Fly her out to visit", tone: "bold", traits: { giving: 2, daring: 1 }, outcomes: [{ text: "Two weeks later she's beside you in the cold, laughing at your coat.", rep: 2 }] },
      { label: "Come back for good", tone: "bold", traits: { ways: 2, people: 2 }, outcomes: [{ text: "You resign and fly home. Everyone says you're mad. Your mother says nothing and just holds you.", rep: 3 }] },
    ],
  },
  // ---------------------------------------------------------------- the street
  {
    id: "hit_and_run",
    spots: "any",
    size: "big",
    area: "street",
    weight: 2,
    ask: BIG,
    emoji: "🚨",
    title: "You saw it",
    text: [
      "A black jeep clips an okada and drives on. You saw the plate. That night a man comes to your door with {ask} in an envelope. \"Oga says you saw nothing.\"",
      "You saw the jeep hit the okada man. Now the jeep's driver, a rich man's son, is offering you {ask} to forget it.",
    ],
    choices: [
      { label: "Take the envelope", tone: "mean", traits: { truth: -2, giving: -1, people: -1 }, outcomes: [{ text: "You take it. The okada man is in hospital with a broken leg. You keep thinking about it.", get: 1, rep: -2 }] },
      {
        label: "Go to the police",
        tone: "bold",
        traits: { truth: 2, daring: 2, wrongs: -1 },
        outcomes: [
          { text: "You give a statement. The family of the okada man finds you to thank you. The police know your face now.", rep: 3, effect: "under_watch", follow: "witness_court" },
          { chance: 0.4, text: "The statement goes into a drawer. Nothing happens, except the jeep parks outside your house once.", rep: 1, effect: "bad_day" },
        ],
      },
      { label: "Find the okada man's family", tone: "kind", traits: { people: 2, truth: 1, daring: -1 }, outcomes: [{ text: "You give them the plate number. What they do with it is theirs. His wife grips your hands.", rep: 3, follow: "witness_court" }] },
      { label: "Refuse the money, say nothing", tone: "calm", traits: { daring: -2, truth: 1 }, outcomes: [{ text: "You close the door on the envelope. You won't be bought, but you won't be a hero either." }] },
    ],
  },
  {
    id: "witness_court",
    spots: "any",
    followOnly: true,
    area: "street",
    ask: BIG,
    emoji: "⚖️",
    title: "The hearing",
    text: ["The okada man's case is in court tomorrow. Without your word, it will fall apart. The rich man's lawyer calls: {ask} if you're \"too ill\" to come."],
    choices: [
      { label: "Go and speak", tone: "bold", traits: { truth: 2, daring: 2 }, outcomes: [{ chance: 0.6, text: "The judge believes you. The okada man gets paid for his leg. Outside, strangers shake your hand.", rep: 5, likelier: [{ trait: "truth", side: 1 }] }, { chance: 0.4, text: "You speak, but money wins today. The okada man thanks you anyway.", rep: 3 }] },
      { label: "Be \"too ill\"", tone: "mean", traits: { truth: -2, daring: -1 }, outcomes: [{ text: "You stay home and take the money. The case is thrown out by lunchtime.", get: 1, rep: -4 }] },
      { label: "Send a written statement", tone: "calm", traits: { daring: -2, truth: 1 }, outcomes: [{ text: "The judge reads it, but a paper can't be questioned. The case drags on.", rep: 1 }] },
    ],
  },
  // ---------------------------------------------------------------- life-changing
  {
    id: "grandpa_land",
    spots: "any",
    size: "life",
    rarity: "rare",
    area: "family",
    ask: HUGE,
    emoji: "🏡",
    title: "Grandpa's land",
    text: [
      "Grandpa's will is read. The family land in the village is yours to decide. A developer offers {ask} for your share. Your uncles want to sell; your grandmother doesn't.",
    ],
    choices: [
      { label: "Keep it in the family", tone: "calm", traits: { ways: 2, people: 2, giving: -1 }, outcomes: [{ text: "The land stays. Your uncles argue for a month. Your grandmother sends you kola nuts and a blessing.", rep: 4, effect: "blessed", follow: "land_later" }] },
      { label: "Sell and share it with everyone", tone: "kind", traits: { giving: 2, ways: -2, people: 1 }, outcomes: [{ text: "You sell and split it so every cousin gets something. You keep a small part.", get: 0.3, rep: 4 }] },
      { label: "Sell and keep your share", tone: "bold", traits: { people: -2, ways: -2, giving: -1 }, outcomes: [{ text: "You sell. The money is real. So is your grandmother's silence.", get: 1, rep: -2 }] },
      { label: "Build a family house on it", tone: "bold", traits: { ways: 1, people: 2, daring: 2 }, outcomes: [{ text: "You put money in to start a house where everyone can come at Christmas. The first block goes down.", pay: 0.2, rep: 5, follow: "land_later" }] },
    ],
  },
  {
    id: "land_later",
    spots: "any",
    followOnly: true,
    area: "family",
    ask: HUGE,
    emoji: "🌳",
    title: "Back at the land",
    text: ["News from the village: the road is being tarred right past Grandpa's land. Your cousins want to build shops on it. The developer is back, with double."],
    choices: [
      { label: "Let your cousins build", tone: "kind", traits: { people: 2, giving: 1 }, outcomes: [{ text: "The shops go up. Your cousins send you a share every month, and the family is together again.", rep: 4 }] },
      { label: "Take the developer's double", tone: "bold", traits: { people: -1, ways: -2 }, outcomes: [{ text: "You sell, for twice what you were offered. Some say you were wise. Some say worse.", get: 0.5, rep: -1 }] },
      { label: "Plant trees and leave it", tone: "calm", traits: { ways: 2, daring: -1 }, outcomes: [{ text: "You plant a row of mango trees where Grandpa used to sit. Some things aren't for sale.", rep: 3, effect: "blessed" }] },
    ],
  },
  {
    id: "big_win",
    spots: "any",
    size: "life",
    rarity: "legendary",
    area: "money",
    ask: HUGE,
    emoji: "🎰",
    title: "Your numbers came in",
    text: ["You check the old ticket twice, then three times. Your numbers came in. {ask}. Nobody knows yet."],
    choices: [
      { label: "Tell nobody", tone: "calm", traits: { giving: -2, daring: -1, people: -1 }, outcomes: [{ text: "You collect it quietly. Life is easier now, and lonelier in a way you can't explain.", get: 1 }] },
      { label: "Throw a party for the whole street", tone: "bold", traits: { giving: 2, daring: 2, people: 2 }, outcomes: [{ text: "Jollof, a DJ, a canopy across the road. Everyone you've ever met turns up, and some you haven't.", get: 0.6, rep: 6, effect: "talked_about" }] },
      { label: "Clear your family's debts", tone: "kind", traits: { giving: 2, people: 2, ways: 1 }, outcomes: [{ text: "Your father's loan, your sister's fees, your aunty's shop rent. Gone. Your mother can't speak.", get: 0.4, rep: 5, effect: "blessed" }] },
      { label: "Invest it all", tone: "bold", traits: { giving: -1, ways: -2, daring: 1 }, outcomes: [{ chance: 0.6, text: "Your adviser was good. It grows quietly.", get: 1 }, { chance: 0.4, text: "Your adviser was not good. Half of it is gone in a month.", get: 0.5, effect: "bad_day" }] },
    ],
  },
];
