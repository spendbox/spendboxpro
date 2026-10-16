// Moments for where you are and who you are (docs/LIFE_WHEEL.md, phase 7). Lekki and Ajegunle feel
// different: a moment with `areas` only comes in those parts of the city (matched by name, as the
// map calls them), twice as often there. And people get different moments as they change: the rich
// get fundraisers and long-lost cousins, the famous get journalists, the stingy stop being asked,
// car owners meet mechanics and parking touts, newcomers get shown the ropes (`fits`).

import type { MomentDef } from "./moments.ts";

const SMALL: [number, number] = [1_000, 5_000];
const MEDIUM: [number, number] = [5_000, 25_000];
const BIG: [number, number] = [50_000, 200_000];

export const LOCAL_MOMENTS: MomentDef[] = [
  // ---------------------------------------------------------------- the areas
  {
    id: "a_lekki_toll",
    areas: ["Lekki", "Ajah"],
    spots: ["street"],
    ask: SMALL,
    emoji: "🚧",
    title: "At the toll gate",
    text: ["The Lekki toll gate. The car in front can't pay and the queue behind is honking like the world is ending. The driver looks back at you, desperate."],
    choices: [
      { label: "Pay their toll", tone: "kind", traits: { giving: 2 }, outcomes: [{ text: "The barrier lifts. The driver sticks a hand out of the window: thank you.", pay: 1, rep: 2 }] },
      { label: "Honk too", tone: "mean", traits: { people: -2 }, outcomes: [{ text: "You join the orchestra. It doesn't help anyone.", rep: -1 }] },
      { label: "Wait patiently", tone: "calm", outcomes: [{ text: "Eventually someone else pays. Lagos." }] },
    ],
  },
  {
    id: "a_yaba_tech",
    areas: ["Yaba"],
    spots: ["street", "food", "work"],
    ask: MEDIUM,
    emoji: "💻",
    title: "Yabacon Valley",
    text: ["In a Yaba café, a student with three laptops pitches you his app: \"Uber for okada, but legal.\" He needs {ask} to launch."],
    choices: [
      { label: "Back him", tone: "bold", traits: { daring: 2, ways: -2 }, outcomes: [{ chance: 0.3, text: "Six months later he raises from abroad and sends you a share.", pay: 1, get: 3 }, { chance: 0.7, text: "The app launches, crashes and quietly dies. He sends a heartfelt apology.", pay: 1 }] },
      { label: "Give him advice instead", tone: "calm", traits: { truth: 1 }, outcomes: [{ text: "An hour of hard questions. He thanks you and changes half his plan.", rep: 1 }] },
      { label: "Pass", tone: "calm", outcomes: [{ text: "\"Your loss,\" he says, smiling. Maybe." }] },
    ],
  },
  {
    id: "a_ajegunle_football",
    areas: ["Ajegunle", "Mushin", "Ojo"],
    spots: ["street", "outdoors"],
    ask: SMALL,
    emoji: "⚽",
    title: "AJ City football",
    text: ["On a sandy pitch between houses, a skinny boy is dribbling past everyone. His coach says scouts are coming, but he needs boots: {ask}."],
    choices: [
      { label: "Buy the boots", tone: "kind", traits: { giving: 2 }, outcomes: [{ text: "He scores twice in his new boots. The coach writes your name in his book.", pay: 1, rep: 2 }] },
      { label: "Stay and watch the match", tone: "calm", outcomes: [{ text: "Best football you've seen all year, for free.", rep: 1 }] },
      { label: "Film him for social media", tone: "bold", traits: { ways: -2 }, outcomes: [{ chance: 0.3, text: "It goes viral. A club in Lagos calls the coach.", rep: 3, effect: "talked_about" }, { chance: 0.7, text: "Forty views. Still, he's good.", rep: 0 }] },
    ],
  },
  {
    id: "a_ikeja_village",
    areas: ["Ikeja", "Computer Village"],
    spots: ["shop", "street"],
    ask: MEDIUM,
    emoji: "📱",
    title: "Computer Village",
    text: ["Computer Village. A boy promises your cracked screen \"original, sealed\" for {ask}. Another shop swears his are the real ones."],
    choices: [
      { label: "Go with the first boy", tone: "bold", outcomes: [{ chance: 0.5, text: "It's original. Your phone looks brand new.", pay: 1 }, { chance: 0.5, text: "It's not. The touch stops working in a week.", pay: 1, effect: "bad_day" }] },
      { label: "Pay more for the shop with a receipt", tone: "calm", traits: { daring: -2 }, outcomes: [{ text: "Dearer, but real, with a warranty.", pay: 1.4 }] },
      { label: "Fix it yourself from a video", tone: "bold", traits: { daring: 2, ways: -1 }, outcomes: [{ chance: 0.4, text: "It works! You feel like an engineer.", pay: 0.4 }, { chance: 0.6, text: "Now you have a cracked screen and a missing screw.", pay: 0.4, effect: "bad_day" }] },
    ],
  },
  {
    id: "a_vi_banker",
    areas: ["Victoria Island", "Ikoyi"],
    spots: ["food", "work", "street"],
    ask: BIG,
    emoji: "🏦",
    title: "Lunch on the Island",
    text: ["Lunch on the Island. A banker at the next table, loud on the phone, mentions a company about to announce big news. You know the name."],
    choices: [
      { label: "Buy shares quickly", tone: "mean", traits: { truth: -2, daring: 2 }, outcomes: [{ chance: 0.6, text: "The news breaks at four. Your shares jump. Nobody knows why you knew.", get: 1, unseen: true }, { chance: 0.4, text: "The news is bad. Your shares fall.", pay: 0.5 }] },
      { label: "Pretend you didn't hear", tone: "calm", traits: { truth: 2 }, outcomes: [{ text: "You finish your salad. Some things aren't yours to use." }] },
      { label: "Tell him to lower his voice", tone: "bold", traits: { truth: 1, daring: 1 }, outcomes: [{ text: "He goes red, then thanks you. He gives you his card.", rep: 2, effect: "owed_favour" }] },
    ],
  },
  {
    id: "a_surulere",
    areas: ["Surulere"],
    spots: ["street", "outdoors"],
    emoji: "🎬",
    title: "Nollywood on your street",
    text: ["A Nollywood crew is shooting on your street in Surulere. The director needs an extra for a market scene: \"You! You have the face.\""],
    choices: [
      { label: "Do it", tone: "bold", traits: { daring: 2 }, outcomes: [{ text: "Three hours, one line (\"Ah! Thief!\"), and a lot of jollof. You're in a film.", rep: 2, effect: "talked_about" }] },
      { label: "Ask what it pays", tone: "calm", traits: { giving: -1 }, outcomes: [{ text: "\"Exposure.\" You laugh and go home." }] },
      { label: "Suggest your neighbour's son instead", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "He's a natural. His mother thanks you for a week.", rep: 2 }] },
    ],
  },
  {
    id: "a_oshodi",
    areas: ["Oshodi", "Agege", "Mushin"],
    spots: ["street", "shop"],
    ask: SMALL,
    emoji: "🚌",
    title: "Oshodi madness",
    text: ["Oshodi: a thousand buses and one of them is yours. A conductor grabs your bag to \"help\" you onto the wrong bus."],
    choices: [
      { label: "Grab it back", tone: "bold", traits: { daring: 2 }, outcomes: [{ text: "Tug of war. You win. The crowd laughs.", rep: 1 }] },
      { label: "Get on, sort it out later", tone: "calm", outcomes: [{ text: "Wrong bus. You're in Ikorodu. It's a long way back.", pay: 1, effect: "bad_day" }] },
      { label: "Shout \"Ole!\"", tone: "bold", outcomes: [{ text: "Everyone turns. He drops the bag and vanishes into the crowd.", rep: 1 }] },
    ],
  },
  {
    id: "a_ikorodu_traffic",
    areas: ["Ikorodu", "Apapa"],
    spots: ["street"],
    ask: SMALL,
    emoji: "🚛",
    title: "Trailer traffic",
    text: ["The trailers have blocked the road again. You've been here an hour. A boy offers to guide your car through a back route for {ask}."],
    choices: [
      { label: "Follow the boy", tone: "bold", traits: { daring: 2 }, outcomes: [{ chance: 0.6, text: "Through a market, behind a church, out ahead of everyone. Genius.", pay: 1 }, { chance: 0.4, text: "The back route is blocked too. He's gone with your money.", pay: 1, effect: "bad_day" }] },
      { label: "Wait it out", tone: "calm", traits: { daring: -2 }, outcomes: [{ text: "Two more hours. You learn every word of the radio's adverts." }] },
      { label: "Get out and help direct traffic", tone: "kind", traits: { people: 2, daring: 1 }, outcomes: [{ text: "You and two others untangle the junction. People clap from their cars.", rep: 3 }] },
    ],
  },
  {
    id: "a_makoko",
    areas: ["Makoko", "Ebute", "Lagos Island"],
    spots: ["street", "outdoors"],
    ask: MEDIUM,
    emoji: "🛶",
    title: "On the water",
    text: ["A fisherman from the stilt houses on the lagoon offers to show you his community by canoe. Afterwards, the school there asks for {ask} for new benches."],
    choices: [
      { label: "Pay for the benches", tone: "kind", traits: { giving: 2, people: 2 }, outcomes: [{ text: "The children sing you a song from the water. You'll never forget it.", pay: 1, rep: 3 }] },
      { label: "Pay the fisherman generously", tone: "calm", outcomes: [{ text: "He grins and shows you the best fishing spot in Lagos.", pay: 0.3, rep: 1 }] },
      { label: "Take photos and go", tone: "calm", traits: { people: -1 }, outcomes: [{ text: "Beautiful photos. You feel a bit like a tourist." }] },
    ],
  },
  // ---------------------------------------------------------------- who you are
  {
    id: "f_rich_cousin",
    fits: ["rich"],
    spots: "any",
    ask: BIG,
    emoji: "👨🏾‍🦳",
    title: "A long-lost cousin",
    text: ["A man calls, very warm: he's your long-lost cousin from your father's side. He's heard you're doing well. He has a business idea, and needs {ask}."],
    choices: [
      { label: "Ask your father about him", tone: "calm", traits: { truth: 1, daring: -1 }, outcomes: [{ text: "Your father has never heard of him. The number is blocked by evening.", rep: 0 }] },
      { label: "Send something, just in case", tone: "kind", traits: { giving: 1, daring: -1 }, outcomes: [{ text: "He thanks you and calls back next week for more.", pay: 0.2 }] },
      { label: "Hang up", tone: "calm", outcomes: [{ text: "Cousins appear when the money does." }] },
    ],
  },
  {
    id: "f_rich_fundraiser",
    fits: ["rich"],
    spots: ["worship", "work", "food"],
    ask: BIG,
    emoji: "🎤",
    title: "Called up at the fundraiser",
    text: ["At a launch, the MC announces your name: \"And now, our big man of the day, our chief launcher!\" Everyone turns. The expected figure is {ask}."],
    choices: [
      { label: "Launch big", tone: "bold", traits: { giving: 2, daring: 2 }, outcomes: [{ text: "The hall roars. Your name is on the plaque.", pay: 1, rep: 5 }] },
      { label: "Give what you'd planned", tone: "calm", traits: { giving: -1, truth: 1 }, outcomes: [{ text: "A modest amount. The MC's smile freezes for a second.", pay: 0.3, rep: 0 }] },
      { label: "Give it quietly after", tone: "kind", traits: { giving: 2, daring: -2 }, outcomes: [{ text: "Nobody sees. The project gets built anyway.", pay: 1, unseen: true, rep: 3 }] },
    ],
  },
  {
    id: "f_famous_journalist",
    fits: ["famous"],
    spots: ["street", "food", "night"],
    emoji: "🎙️",
    title: "A journalist calls",
    text: ["A journalist from a big blog wants an interview: \"People want to know the real you.\" She's also heard a rumour she'd like you to \"clear up\"."],
    choices: [
      { label: "Do the interview, honestly", tone: "bold", traits: { truth: 2, daring: 2 }, outcomes: [{ text: "Honest, a bit raw. The comments are mostly kind.", rep: 3, effect: "talked_about" }] },
      { label: "Only talk about the good things", tone: "calm", traits: { truth: -1 }, outcomes: [{ text: "A glossy piece. Nobody believes all of it.", rep: 1 }] },
      { label: "Decline", tone: "calm", traits: { daring: -2 }, outcomes: [{ text: "She writes it anyway, with \"declined to comment\".", rep: -1 }] },
    ],
  },
  {
    id: "f_stingy",
    fits: ["stingy"],
    spots: ["street", "home", "work"],
    emoji: "🪙",
    title: "They've stopped asking",
    text: ["The beggars at the junction don't look up when you pass any more. Yesterday you heard someone call you \"Mr Closefist\"."],
    choices: [
      { label: "Laugh it off", tone: "calm", traits: { giving: -1 }, outcomes: [{ text: "Your money, your business. Your savings agree." }] },
      { label: "Surprise them tomorrow", tone: "kind", traits: { giving: 3 }, outcomes: [{ text: "You hand out money all along the junction. Jaws drop.", rep: 3 }] },
      { label: "Find out who said it", tone: "mean", traits: { wrongs: -2 }, outcomes: [{ text: "You find out. It doesn't make you feel better.", rep: -1 }] },
    ],
  },
  {
    id: "f_car_tout",
    fits: ["car"],
    spots: ["street", "shop", "food"],
    ask: SMALL,
    emoji: "🅿️",
    title: "The parking tout",
    text: ["You park outside a shop. A man in an orange bib appears from nowhere: \"Oga, I'll watch it for you. {ask}.\" He's not with anybody official."],
    choices: [
      { label: "Pay him", tone: "calm", outcomes: [{ text: "Your car is exactly where you left it, polished, somehow.", pay: 1 }] },
      { label: "Refuse", tone: "bold", traits: { daring: 2, giving: -1 }, outcomes: [{ chance: 0.6, text: "Nothing happens. This time.", rep: 0 }, { chance: 0.4, text: "Your side mirror is gone when you get back.", effect: "bad_day" }] },
      { label: "Pay him to wash it too", tone: "kind", traits: { giving: 1 }, outcomes: [{ text: "He's delighted. You have a parking tout friend now.", pay: 2, rep: 1 }] },
    ],
  },
  {
    id: "f_car_mechanic",
    fits: ["car"],
    spots: ["street"],
    ask: MEDIUM,
    emoji: "🔧",
    title: "Your mechanic's diagnosis",
    text: ["Your car is making a noise. The mechanic listens for two seconds: \"The whole gearbox has to change. {ask}.\""],
    choices: [
      { label: "Pay him", tone: "calm", traits: { daring: -1 }, outcomes: [{ text: "He changes it. The noise is still there.", pay: 1, effect: "bad_day" }] },
      { label: "Get a second opinion", tone: "bold", traits: { truth: 1 }, outcomes: [{ text: "Another mechanic tightens one bolt. Noise gone. ₦500.", pay: 0.05 }] },
      { label: "Ignore the noise", tone: "calm", traits: { daring: 2 }, outcomes: [{ chance: 0.5, text: "It goes away by itself. Cars are mysterious." }, { chance: 0.5, text: "It doesn't go away. It gets louder, on the bridge.", effect: "bad_day" }] },
    ],
  },
  {
    id: "f_newcomer",
    fits: ["newcomer"],
    spots: ["street", "home", "shop"],
    ask: SMALL,
    emoji: "🧭",
    title: "New in town",
    text: ["You're new around here and it shows. An older woman selling akara stops you. \"You're the new one. Let me tell you who to trust on this street.\""],
    choices: [
      { label: "Buy akara and listen", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "Twenty minutes of gossip and the best akara in Lagos. You know everyone now.", pay: 1, rep: 2 }] },
      { label: "Thank her and go", tone: "calm", outcomes: [{ text: "\"OK, my dear. You'll learn.\"" }] },
      { label: "Ask her who not to trust", tone: "bold", traits: { daring: 1 }, outcomes: [{ text: "She lowers her voice and names three people. One of them is your landlord.", rep: 1 }] },
    ],
  },
];
