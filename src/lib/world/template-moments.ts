// Moments built from parts (docs/LIFE_WHEEL.md, phase 7): each has slots in its story, its answers
// and its outcomes ({who}, {need}, {twist}...), and every time it comes, one option is picked for
// each slot, so a moment reads hundreds of ways. A part can make the amount bigger or smaller
// (`ask`) and carry a `tag` that outcomes are likelier with (`likelier: [{ tag }]`): when the
// twist is that it looks like a scam, giving is likelier to turn out to have been a scam.
// `partVersions` in ./moments.ts counts the ways each reads; the tests check every one fills in.

import type { MomentDef, MomentPart } from "./moments.ts";

const SMALL: [number, number] = [800, 4_000];
const MEDIUM: [number, number] = [3_000, 20_000];

/** A twist that may or may not be there (the empty one keeps it plain). */
const plain: MomentPart = { text: "" };

export const TEMPLATE_MOMENTS: MomentDef[] = [
  {
    id: "t_asks_help",
    spots: ["street", "outdoors", "shop"],
    ask: SMALL,
    emoji: "🙏🏾",
    title: "Someone asks for help",
    parts: {
      who: [
        { text: "An old man in a faded agbada" },
        { text: "A young mother with twins on her back" },
        { text: "A boy in a torn school uniform" },
        { text: "A man who says he's a pastor" },
        { text: "A woman with a bandaged arm" },
        { text: "A blind singer with a small speaker" },
        { text: "A girl selling pure water" },
        { text: "A well-dressed man, sweating" },
      ],
      need: [
        { text: "asks for {ask} for transport back to the village" },
        { text: "needs {ask} for medicine, holding out a crumpled prescription", ask: 1.5 },
        { text: "says their phone was stolen and asks for {ask} to get home" },
        { text: "needs {ask} today or they'll lose their market stall", ask: 2 },
        { text: "just wants {ask} for something to eat", ask: 0.5 },
        { text: "asks for {ask} to pay a hospital deposit for a child", ask: 2.5 },
      ],
      twist: [
        plain,
        { text: " Two people nearby mutter that they heard the same story yesterday.", tag: "scam" },
        { text: " Your phone buzzes: your own rent is due tomorrow.", tag: "tight" },
        { text: " A small crowd has stopped to see what you'll do.", tag: "crowd" },
        { text: " There's something about their eyes that tells you it's true.", tag: "true" },
      ],
    },
    text: ["{who} {need}.{twist}", "{who} stops you and {need}.{twist}"],
    choices: [
      {
        label: "Give {ask}",
        tone: "kind",
        outcomes: [
          { text: "They hold your hand in both of theirs. \"God will reward you.\"", pay: 1, rep: 2 },
          { chance: 0.25, text: "An hour later you see them two bus stops down, telling the same story to someone else.", pay: 1, likelier: [{ tag: "scam" }] },
          { chance: 0.3, text: "The crowd claps. Someone films it.", pay: 1, rep: 3, likelier: [{ tag: "crowd" }] },
        ],
      },
      {
        label: "Give half",
        tone: "calm",
        outcomes: [
          { text: "\"Half is not small. Thank you.\"", pay: 0.5, rep: 1 },
          { chance: 0.3, text: "Half was all you could spare this week, and you both know it.", pay: 0.5, likelier: [{ tag: "tight" }] },
        ],
      },
      {
        label: "Pay for what they need yourself",
        tone: "bold",
        traits: { giving: 1, truth: 1, daring: -1 },
        outcomes: [
          { text: "You go with them and pay directly. It was real. They can't stop thanking you.", pay: 1, rep: 3, likelier: [{ tag: "true" }] },
          { chance: 0.5, text: "\"Ehn... it's fine, don't worry.\" They walk off quickly. You'll never know.", likelier: [{ tag: "scam" }] },
        ],
      },
      {
        label: "Walk on",
        tone: "calm",
        outcomes: [
          { text: "You keep walking. You think about it for the rest of the day." },
          { chance: 0.3, text: "Someone in the crowd tuts loudly as you pass.", rep: -1, likelier: [{ tag: "crowd" }] },
        ],
      },
    ],
  },
  {
    id: "t_market",
    spots: ["shop"],
    ask: MEDIUM,
    emoji: "🧺",
    title: "At the market",
    parts: {
      trader: [
        { text: "Iya Basira, the pepper seller," },
        { text: "A Hausa tomato trader" },
        { text: "A fabric seller with gold teeth" },
        { text: "The phone-accessories boy" },
        { text: "An electronics dealer in a shiny suit" },
        { text: "A woman selling crayfish by the bag" },
        { text: "An old man selling yams" },
      ],
      item: [
        { text: "a bag of rice", ask: 2 },
        { text: "a new phone screen" },
        { text: "six yards of lace", ask: 1.5 },
        { text: "a basket of tomatoes", ask: 0.4 },
        { text: "a pair of \"original\" sneakers" },
        { text: "a big tuber of yam", ask: 0.3 },
      ],
      twist: [
        { text: "It's twice what your neighbour paid last week.", tag: "dear" },
        { text: "Their child is sick at home; they really need the sale.", tag: "need" },
        { text: "The trader next door is waving at you: \"Come, I'll do it cheaper!\"", tag: "rival" },
        { text: "It looks a little different from the one on display.", tag: "fake" },
        { text: "It's exactly what you came for, at a fair price.", tag: "fair" },
      ],
    },
    text: ["{trader} wants {ask} for {item}. {twist}", "{trader} holds up {item} as you pass deep in the market: {ask}. {twist}"],
    choices: [
      { label: "Pay the price", tone: "calm", outcomes: [{ text: "You pay. They throw in a little extra: jara.", pay: 1, rep: 1 }, { chance: 0.3, text: "You pay. Later you find out you paid far too much.", pay: 1, likelier: [{ tag: "dear" }] }, { chance: 0.3, text: "At home, it isn't what you thought.", pay: 1, likelier: [{ tag: "fake" }] }] },
      {
        label: "Haggle hard",
        tone: "bold",
        traits: { giving: -2, daring: 1 },
        outcomes: [
          { text: "Ten minutes of drama and laughing. You meet in the middle.", pay: 0.7 },
          { chance: 0.4, text: "You win, but the trader's face tells you how badly they needed it.", pay: 0.5, rep: -1, likelier: [{ tag: "need" }] },
        ],
      },
      { label: "Go to the cheaper trader", tone: "calm", traits: { giving: -1, people: -1 }, outcomes: [{ text: "Cheaper, and almost as good. The first trader shouts something after you.", pay: 0.6 }, { chance: 0.4, text: "Cheaper, and you can see why.", pay: 0.6, likelier: [{ tag: "rival" }] }] },
      { label: "Check it carefully first", tone: "calm", traits: { daring: -2, truth: 1 }, outcomes: [{ text: "You turn it over twice. It's good. You pay, satisfied.", pay: 1 }, { chance: 0.5, text: "You find the flaw. They swap it for a good one without a word.", pay: 1, rep: 1, likelier: [{ tag: "fake" }] }] },
    ],
  },
  {
    id: "t_neighbour",
    spots: ["home"],
    emoji: "🏠",
    title: "A favour from upstairs",
    parts: {
      who: [
        { text: "The new tenant upstairs" },
        { text: "Mama Tobi from downstairs" },
        { text: "The retired soldier next door" },
        { text: "The student couple on the ground floor" },
        { text: "The landlord's nephew" },
        { text: "The quiet nurse across the hall" },
      ],
      want: [
        { text: "wants to borrow your generator tonight" },
        { text: "asks you to sign a letter complaining about the landlord" },
        { text: "wants you to watch their children for two hours" },
        { text: "asks to share your internet for a week" },
        { text: "wants to park in your space while their car is fixed" },
        { text: "asks you to keep a parcel for them, \"and don't open it\"" },
      ],
      twist: [
        plain,
        { text: " The last thing they borrowed came back broken.", tag: "broke" },
        { text: " They helped you carry everything up when you moved in.", tag: "owed" },
        { text: " The whole building will hear who said yes.", tag: "watched" },
      ],
    },
    text: ["{who} {want}.{twist}", "A knock at your door. {who} {want}.{twist}"],
    choices: [
      { label: "Yes, of course", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "They're so grateful. Next week, a plate of jollof appears at your door.", rep: 2 }, { chance: 0.3, text: "It comes back broken, again.", rep: 1, effect: "bad_day", likelier: [{ tag: "broke" }] }, { chance: 0.3, text: "Fair is fair. You owed them, and now you're square.", rep: 2, likelier: [{ tag: "owed" }] }] },
      { label: "Yes, but just this once", tone: "calm", outcomes: [{ text: "\"Just once,\" you say. You both know it won't be.", rep: 1 }] },
      { label: "Make an excuse", tone: "calm", traits: { truth: -1, people: -1 }, outcomes: [{ text: "\"Ah, it's not working today.\" They nod. They know.", rep: -1 }, { chance: 0.3, text: "By evening the whole building has heard you said no.", rep: -2, likelier: [{ tag: "watched" }] }] },
      { label: "Say no, honestly", tone: "bold", traits: { truth: 2, people: -1 }, outcomes: [{ text: "\"I'm sorry, I'd rather not.\" Awkward, but clean.", rep: 0 }] },
    ],
  },
  {
    id: "t_office",
    spots: ["work"],
    emoji: "💼",
    title: "A colleague's favour",
    parts: {
      who: [
        { text: "Chinedu from accounts" },
        { text: "Bisola, the new hire" },
        { text: "Mr Okon, who's been here twenty years" },
        { text: "Halima from the front desk" },
        { text: "Tayo, your lunch friend" },
        { text: "Kunle from IT" },
        { text: "Grace, who sits next to you" },
      ],
      want: [
        { text: "asks you to cover their shift so they can go to a job interview" },
        { text: "wants you to sign them in; they're stuck in traffic" },
        { text: "asks you to keep quiet about a mistake that cost the company money" },
        { text: "is being blamed for something you did" },
        { text: "wants you to back them up in a fight with the manager" },
        { text: "asks you to share your bonus with the team who did the work" },
        { text: "wants you to recommend their cousin for a job here" },
      ],
      twist: [
        plain,
        { text: " The manager is watching your screen today.", tag: "risky" },
        { text: " They covered for you last month.", tag: "owed" },
        { text: " Everyone says they're about to be promoted over you.", tag: "rival" },
      ],
    },
    text: ["{who} {want}.{twist}", "Five minutes before the end of the day, {who} {want}.{twist}"],
    choices: [
      { label: "Help them", tone: "kind", traits: { people: 2, truth: -1 }, outcomes: [{ text: "You do it. They squeeze your arm and say nothing; they don't need to.", rep: 1 }, { chance: 0.35, text: "The manager notices. You both get a warning.", rep: -1, effect: "bad_day", likelier: [{ tag: "risky" }] }] },
      { label: "Tell the truth", tone: "bold", traits: { truth: 3, people: -1 }, outcomes: [{ text: "You tell it straight. Some respect you for it; one person doesn't.", rep: 1, trust: 1 }, { chance: 0.4, text: "Straight, even though it helps you get ahead of them. People wonder why.", rep: 0, likelier: [{ tag: "rival" }] }] },
      { label: "Stay out of it", tone: "calm", traits: { daring: -2 }, outcomes: [{ text: "Not your business. It sorts itself out, mostly.", rep: 0 }, { chance: 0.4, text: "They helped you once. You didn't help them. They noticed.", rep: -1, likelier: [{ tag: "owed" }] }] },
    ],
  },
  {
    id: "t_deal",
    spots: ["street", "food", "work"],
    ask: [20_000, 80_000],
    emoji: "📈",
    title: "An offer",
    parts: {
      who: [
        { text: "A smooth-talking man in a very clean suit" },
        { text: "Your old schoolmate, suddenly rich" },
        { text: "A woman with a clipboard and a big smile" },
        { text: "Your cousin's husband" },
        { text: "A boy with a laptop bag and three phones" },
      ],
      deal: [
        { text: "an investment that \"doubles in a month, guaranteed\"" },
        { text: "a cheap plot of land in Ibeju-Lekki, \"before prices go up\"" },
        { text: "a slot in a savings club (ajo) where you collect first", tag: "ajo" },
        { text: "a phone at half price, \"no questions\"" },
        { text: "a share in a new crypto coin" },
      ],
      twist: [
        plain,
        { text: " Your friend lost money to something just like this.", tag: "warned" },
        { text: " It might, just possibly, be real.", tag: "real" },
        { text: " They know your name and where you work.", tag: "pushy" },
      ],
    },
    text: ["{who} offers you {deal}: {ask} to join.{twist}", "{who} leans in over lunch and offers you {deal}. It's {ask} to join.{twist}"],
    choices: [
      {
        label: "Put money in",
        tone: "bold",
        traits: { daring: 2, truth: -1 },
        outcomes: [
          { text: "A month later, the number stops answering.", pay: 1, effect: "bad_day" },
          { chance: 0.35, text: "It actually pays out. You feel clever and a little lucky.", pay: 1, get: 1.6, likelier: [{ tag: "real" }, { tag: "ajo" }] },
        ],
      },
      { label: "Ask for papers and a week to think", tone: "calm", traits: { daring: -2, truth: 1 }, outcomes: [{ text: "The papers never come. Interesting.", rep: 0 }, { chance: 0.4, text: "The papers come, and they're real. You still say no.", rep: 0, likelier: [{ tag: "real" }] }] },
      { label: "Say no, firmly", tone: "calm", traits: { daring: -1 }, outcomes: [{ text: "\"Your loss,\" they say. Probably not.", rep: 0 }, { chance: 0.4, text: "They keep calling for a week.", likelier: [{ tag: "pushy" }], effect: "bad_day" }] },
      { label: "Warn people about them", tone: "bold", traits: { truth: 2, people: 2 }, outcomes: [{ text: "You post it in the area group. Two people thank you privately.", rep: 2 }, { chance: 0.3, text: "Turns out it was real. People laugh at your warning.", rep: -1, likelier: [{ tag: "real" }] }] },
    ],
  },
  {
    id: "t_night",
    spots: ["night", "food"],
    ask: [10_000, 60_000],
    emoji: "🥂",
    title: "A night out",
    parts: {
      who: [
        { text: "Your loudest friend" },
        { text: "A stranger who says it's their birthday" },
        { text: "Someone who swears they're a famous singer's cousin" },
        { text: "Your boss, off duty and in a good mood" },
        { text: "An old flame you haven't seen in years" },
      ],
      offer: [
        { text: "insists you pay for the table: {ask}" },
        { text: "invites you to an after-party in Lekki that starts at 3am" },
        { text: "wants you to dance for their camera" },
        { text: "asks you to drive them home; they've had a lot", tag: "drunk" },
        { text: "wants you to spray {ask} on the birthday celebrant" },
      ],
      twist: [
        plain,
        { text: " You have an early start tomorrow.", tag: "early" },
        { text: " Half the club is watching.", tag: "watched" },
        { text: " Your phone is on 4%.", tag: "battery" },
      ],
    },
    text: ["{who} {offer}.{twist}", "It's past midnight. {who} {offer}.{twist}"],
    choices: [
      { label: "Go big", tone: "bold", traits: { giving: 2, daring: 2 }, outcomes: [{ text: "You go all in. It's the best night in months.", pay: 1, rep: 3 }, { chance: 0.4, text: "The best night in months, and the worst morning.", pay: 1, rep: 2, effect: "bad_day", likelier: [{ tag: "early" }] }, { chance: 0.3, text: "Everyone saw it. You're the talk of the club.", pay: 1, rep: 3, effect: "talked_about", likelier: [{ tag: "watched" }] }] },
      { label: "Do the sensible thing", tone: "calm", traits: { daring: -2 }, outcomes: [{ text: "You get them a taxi and go home. Boring. Right.", rep: 1 }, { chance: 0.5, text: "You make sure they get home safe. They text you a thank-you at noon.", rep: 2, likelier: [{ tag: "drunk" }] }] },
      { label: "Slip away quietly", tone: "calm", traits: { people: -1 }, outcomes: [{ text: "Irish exit. Nobody notices until it's too late.", rep: 0 }, { chance: 0.4, text: "Your phone dies on the way. That's a long walk.", effect: "bad_day", likelier: [{ tag: "battery" }] }] },
    ],
  },
  {
    id: "t_family_call",
    spots: "any",
    ask: [10_000, 50_000],
    emoji: "📞",
    title: "A call from family",
    parts: {
      who: [
        { text: "Your mother" },
        { text: "Your elder brother" },
        { text: "Your aunty in London" },
        { text: "Your grandmother, on a cousin's phone" },
        { text: "Your little sister" },
      ],
      news: [
        { text: "want you home for a family meeting this weekend" },
        { text: "need {ask} for your cousin's hospital bill", ask: 1.5 },
        { text: "have found you a very nice person to marry", tag: "match" },
        { text: "want you to be godparent to the new baby" },
        { text: "need {ask} from you for the village's new road" },
      ],
      twist: [
        plain,
        { text: " You've said no the last two times.", tag: "again" },
        { text: " Your cousins are all saying yes.", tag: "pressure" },
        { text: " You were just about to call them.", tag: "warm" },
      ],
    },
    text: ["{who} is on the phone: \"We {news}.\"{twist}", "A missed call, then another. {who} is on the phone: \"We {news}.\"{twist}"],
    choices: [
      { label: "Say yes", tone: "kind", traits: { people: 2, ways: 2 }, outcomes: [{ text: "\"I knew you would.\" You can hear them smiling.", pay: 0.6, rep: 2 }, { chance: 0.4, text: "After saying no twice, this yes means a lot to them.", pay: 0.6, rep: 3, likelier: [{ tag: "again" }] }] },
      { label: "Say yes, in your own way", tone: "calm", traits: { ways: -1, people: 1 }, outcomes: [{ text: "Not exactly what they asked, but close. They'll take it.", pay: 0.3, rep: 1 }] },
      { label: "Say no, kindly", tone: "calm", traits: { ways: -2, people: -1 }, outcomes: [{ text: "\"I understand,\" they say, and you can tell they don't.", rep: -1 }, { chance: 0.4, text: "Everyone else said yes. You'll hear about it at Christmas.", rep: -2, likelier: [{ tag: "pressure" }] }, { chance: 0.4, text: "Actually, you'd rather choose who you marry. They laugh, eventually.", rep: 0, likelier: [{ tag: "match" }] }] },
    ],
  },
  {
    id: "t_trouble",
    spots: ["street", "outdoors"],
    emoji: "⚠️",
    title: "Trouble ahead",
    parts: {
      what: [
        { text: "A car is stuck in a flooded road with a family inside" },
        { text: "Two men are about to fight over a parking space" },
        { text: "A woman's bag has just been snatched" },
        { text: "A small boy is stuck up a mango tree" },
        { text: "An old man has fallen by the gutter" },
        { text: "A keke has knocked over a fruit seller's tray" },
      ],
      twist: [
        plain,
        { text: " You're already late for something important.", tag: "late" },
        { text: " Three people are filming instead of helping.", tag: "filmed" },
        { text: " Something about it feels like a setup.", tag: "setup" },
        { text: " A policeman is standing right there, doing nothing." },
        { text: " Someone in the crowd shouts your name: they know you.", tag: "filmed" },
      ],
      where: [
        { text: "At the junction" },
        { text: "Outside the bank" },
        { text: "By the market gate" },
        { text: "On your way home" },
        { text: "Right in front of the church" },
        { text: "Under the bridge" },
      ],
    },
    text: ["{where}: {what}.{twist}", "You turn the corner and stop. {what}.{twist}"],
    choices: [
      { label: "Jump in and help", tone: "bold", traits: { daring: 2, people: 2 }, outcomes: [{ text: "You're in the middle of it before you think. It works out. People cheer.", rep: 3 }, { chance: 0.3, text: "It goes viral, and you're the hero of the video.", rep: 4, effect: "talked_about", likelier: [{ tag: "filmed" }] }, { chance: 0.25, text: "It was a setup. Your phone is gone when you look down.", rep: 1, effect: "bad_day", likelier: [{ tag: "setup" }] }] },
      { label: "Call for help and stay with them", tone: "kind", traits: { daring: -1, people: 1 }, outcomes: [{ text: "You shout, call, and stay till help comes. It's enough.", rep: 2 }, { chance: 0.4, text: "You're very late. Worth it, probably.", rep: 2, effect: "bad_day", likelier: [{ tag: "late" }] }] },
      { label: "Keep walking", tone: "calm", traits: { people: -2, daring: -1 }, outcomes: [{ text: "Someone else will help. Someone always does. Probably.", rep: -1 }, { chance: 0.3, text: "You're in the background of someone's video, walking past.", rep: -3, likelier: [{ tag: "filmed" }] }] },
    ],
  },
];
