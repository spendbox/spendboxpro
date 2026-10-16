// What you own adds to your story (docs/LIFE_WHEEL.md): every thing in the shop has a moment that
// only comes to people who own it (`item`), so a gold chain, a generator or a G-Wagon each bring
// their own situations: people notice, people ask, things break, things get stolen, things open
// doors. Owning things also gives you more ways to answer other moments (./thing-answers.ts).

import type { MomentChoice, MomentDef, MomentSpot } from "./moments.ts";

const SMALL: [number, number] = [2_000, 10_000];
const MEDIUM: [number, number] = [10_000, 50_000];
const BIG: [number, number] = [50_000, 250_000];

/** A moment about one of your things. */
function thing(kinds: string[], id: string, spots: MomentSpot[] | "any", emoji: string, title: string, text: string, choices: MomentChoice[], ask?: [number, number]): MomentDef {
  return { id: `th_${id}`, item: kinds, spots, emoji, title, text: [text], choices, ...(ask ? { ask } : {}) };
}

export const THING_MOMENTS: MomentDef[] = [
  // ---------------------------------------------------------------- jewellery
  thing(["beads"], "beads", ["worship", "street", "food"], "📿", "Your coral beads", "At a wedding, an old chief stops and stares at your coral beads. \"Those are real. Where did you get them?\" He offers {ask} for them, right there.", [
    { label: "Sell them to him", tone: "bold", traits: { giving: -1, ways: -1 }, outcomes: [{ text: "He pays without haggling and wears them on the spot.", get: 1 }] },
    { label: "Tell him their story", tone: "kind", traits: { ways: 2, people: 1 }, outcomes: [{ text: "He listens, nods, and introduces you to everyone at his table as \"a person who knows tradition\".", rep: 2 }] },
    { label: "Smile and say they're not for sale", tone: "calm", outcomes: [{ text: "\"Wise.\" He respects that." , rep: 1 }] },
  ], BIG),
  thing(["gold_chain"], "gold_chain", ["street", "night"], "⛓️", "Your chain is showing", "Your gold chain catches the light at the bus stop. Two boys on an okada slow down, looking at it a little too long.", [
    { label: "Tuck it into your shirt", tone: "calm", traits: { daring: -2 }, outcomes: [{ text: "They ride on. Smart." }] },
    { label: "Stare them down", tone: "bold", traits: { daring: 2 }, outcomes: [{ chance: 0.6, text: "They look away and ride off. Your chain and your pride intact.", rep: 1 }, { chance: 0.4, text: "They circle back. You get into the nearest shop just in time.", effect: "bad_day" }] },
    { label: "Walk into the crowd", tone: "calm", outcomes: [{ text: "Safety in numbers. They lose interest." }] },
  ]),
  thing(["wristwatch", "luxury_watch"], "watch", ["work", "food", "street"], "⌚", "\"What time is it?\"", "A stranger asks you the time, then admires your watch. \"Nice one. Original?\" His eyes are on your wrist, not your face.", [
    { label: "\"A gift from my father\"", tone: "kind", traits: { ways: 1 }, outcomes: [{ text: "He softens. \"Take care of it.\" He walks on." }] },
    { label: "Cover it with your sleeve", tone: "calm", traits: { daring: -1 }, outcomes: [{ text: "You tell him the time and leave quickly." }] },
    { label: "Tell him the price", tone: "bold", traits: { truth: 1, daring: 1 }, outcomes: [{ chance: 0.6, text: "He whistles. Word gets round that you're doing well.", rep: 1 }, { chance: 0.4, text: "Word gets round, to the wrong people.", effect: "under_watch" }] },
  ]),
  thing(["cartier_love", "gold_earrings", "signet_ring"], "jewel_borrow", ["home", "worship", "food"], "💍", "Can I borrow it?", "Your cousin is getting engaged and wants to borrow your best jewellery for the introduction. \"Just for one day. I'll guard it with my life.\"", [
    { label: "Lend it", tone: "kind", traits: { people: 2, giving: 1 }, outcomes: [{ text: "She shines all day. It comes back polished, with a thank-you card.", rep: 2 }, { chance: 0.2, text: "It comes back... eventually. A week late, and slightly scratched.", rep: 1, effect: "bad_day" }] },
    { label: "Go with her and wear it yourself", tone: "calm", outcomes: [{ text: "You go to the introduction. Somehow everyone notices you more than her.", rep: 1 }] },
    { label: "No", tone: "calm", traits: { people: -2 }, outcomes: [{ text: "\"OK.\" The family hears about it.", rep: -1 }] },
  ]),
  thing(["rolex_submariner", "rolex_daytona", "rolex_day_date", "ap_royal_oak", "patek_nautilus", "richard_mille", "patek_grandmaster"], "grail_watch", ["food", "night", "work", "street"], "💎", "Everyone noticed", "Your watch walks into the room before you do. A man in a white kaftan leans over: \"I'll give you {ask} more than you paid. Cash. Today.\"", [
    { label: "Take the deal", tone: "bold", traits: { giving: -2, daring: 1 }, outcomes: [{ text: "A bag of cash, a handshake, and a bare wrist.", get: 1 }] },
    { label: "\"It's not for sale\"", tone: "calm", outcomes: [{ text: "He nods slowly. \"Everything is for sale.\" He gives you his card anyway.", rep: 2 }] },
    { label: "Ask what he does", tone: "bold", traits: { people: 1, truth: 1 }, outcomes: [{ text: "He imports generators and knows everyone in Lagos. You leave with a new contact.", effect: "owed_favour" }] },
  ], BIG),
  thing(["diamond_necklace"], "diamonds", ["night", "food", "worship"], "✨", "Diamonds at the gala", "At a charity gala, the host announces that your diamond necklace is \"the most beautiful thing in the room\" and asks you to auction a dance for charity.", [
    { label: "Do it, laughing", tone: "bold", traits: { daring: 2, people: 1 }, outcomes: [{ text: "The bidding goes wild. The charity raises a fortune. You're in the papers.", rep: 4, effect: "talked_about" }] },
    { label: "Donate instead", tone: "kind", traits: { giving: 2 }, outcomes: [{ text: "You write a cheque instead. The host is delighted.", pay: 1, rep: 3 }] },
    { label: "Smile and decline", tone: "calm", outcomes: [{ text: "Gracious. The host moves on, a little disappointed." }] },
  ], BIG),
  // ---------------------------------------------------------------- clothing
  thing(["ankara"], "ankara", ["work", "street", "food"], "🧵", "Your Ankara", "Someone at work says your Ankara is \"too loud for the office\". Half the floor is watching.", [
    { label: "\"Culture is never too loud\"", tone: "bold", traits: { ways: 2, daring: 1 }, outcomes: [{ text: "Applause from the back. Next Friday, half the office wears Ankara.", rep: 2 }] },
    { label: "Laugh it off", tone: "calm", outcomes: [{ text: "You laugh. You wear it again next week anyway." }] },
    { label: "Change into something plain", tone: "calm", traits: { ways: -1, daring: -2 }, outcomes: [{ text: "Grey shirt. Grey mood." }] },
  ]),
  thing(["agbada", "aso_oke", "gele"], "owambe_wear", ["worship", "food", "street"], "🎉", "Dressed for the owambe", "You arrive at the owambe in your best traditional outfit. A photographer from a society blog asks to take your picture.", [
    { label: "Pose properly", tone: "bold", traits: { daring: 1, ways: 1 }, outcomes: [{ text: "You're on the blog the next morning: \"Best dressed\".", rep: 3, effect: "talked_about" }] },
    { label: "Pull your friends into the photo", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "Eight of you, matching. It's everyone's profile picture by evening.", rep: 2 }] },
    { label: "Say no thank you", tone: "calm", traits: { daring: -1 }, outcomes: [{ text: "You dance instead. Better." }] },
  ]),
  thing(["sneakers"], "sneakers", ["street", "sport", "night"], "👟", "\"Where did you get them?\"", "A teenager stops you: your sneakers are the ones he's dreamed of. \"Please, I'll buy them from you. I have {ask}.\" It's far less than they're worth.", [
    { label: "Sell them for what he has", tone: "kind", traits: { giving: 2 }, outcomes: [{ text: "He nearly cries. You walk home in socks, smiling.", get: 1, rep: 2 }] },
    { label: "Tell him where to buy them", tone: "calm", outcomes: [{ text: "He writes the shop down. \"One day.\"" }] },
    { label: "Laugh and walk on", tone: "mean", outcomes: [{ text: "He watches you go." , rep: -1 }] },
  ], SMALL),
  thing(["suit"], "suit", ["work", "street"], "🕴🏾", "Mistaken for the boss", "In your tailored suit, the security at a big bank's head office waves you straight in, thinking you're someone important. There's a board meeting upstairs.", [
    { label: "Play along for a bit", tone: "bold", traits: { truth: -2, daring: 2 }, outcomes: [{ chance: 0.5, text: "You sit in on the meeting, nod twice, and leave with three business cards.", rep: 1, effect: "owed_favour" }, { chance: 0.5, text: "Someone asks your name. Security walks you out.", rep: -2, effect: "talked_about" }] },
    { label: "Correct them politely", tone: "calm", traits: { truth: 2 }, outcomes: [{ text: "They laugh. The guard says the suit fooled him.", rep: 1 }] },
  ]),
  thing(["sunglasses"], "sunglasses", ["street", "outdoors"], "🕶️", "Big man shades", "With your designer sunglasses on, a hawker refuses to sell you pure water for less than five times the price. \"Oga, you no be small person.\"", [
    { label: "Pay it, you're feeling generous", tone: "kind", outcomes: [{ text: "He grins. It's a good day for him.", pay: 0.2 }] },
    { label: "Take the glasses off and bargain", tone: "bold", traits: { giving: -1 }, outcomes: [{ text: "Normal price. Everyone laughs, including him." }] },
  ], SMALL),
  thing(["hermes_birkin"], "birkin", ["food", "night", "shop"], "👜", "The bag", "At a restaurant on the Island, a woman at the next table asks if your bag is real. \"Because I have a man who makes them for a fraction...\"", [
    { label: "\"Every stitch\"", tone: "bold", traits: { truth: 1 }, outcomes: [{ text: "She goes quiet. Her friends look at you differently.", rep: 2 }] },
    { label: "Ask for the man's number", tone: "mean", traits: { truth: -1, giving: -1 }, outcomes: [{ text: "You leave with a business plan you probably shouldn't have.", effect: "owed_favour" }] },
    { label: "Change the subject", tone: "calm", outcomes: [{ text: "Some things don't need explaining." }] },
  ]),
  // ---------------------------------------------------------------- books
  thing(["novel", "business_book", "textbook", "cookbook"], "books", ["home", "street", "work"], "📚", "Can I borrow your book?", "Your neighbour's son has seen your books. He's fourteen, doesn't have any of his own, and asks very politely if he can borrow one.", [
    { label: "Give it to him to keep", tone: "kind", traits: { giving: 2 }, outcomes: [{ text: "A month later he comes back to tell you how it ended.", rep: 2 }] },
    { label: "Lend it", tone: "calm", outcomes: [{ text: "It comes back with a bus ticket as a bookmark and a thank-you note.", rep: 1 }] },
    { label: "Start a little street library", tone: "bold", traits: { people: 2, ways: -1 }, outcomes: [{ text: "A shelf by your gate. By Sunday, five children are reading there.", rep: 3 }] },
  ]),
  // ---------------------------------------------------------------- gadgets
  thing(["smartphone", "tablet"], "phone", ["street", "shop", "food"], "📱", "Your phone in the danfo", "Your phone buzzes in the packed danfo. As you take it out, you feel a hand at your other pocket.", [
    { label: "Grab the hand", tone: "bold", traits: { daring: 2 }, outcomes: [{ chance: 0.6, text: "You catch him. The whole bus turns on him.", rep: 1 }, { chance: 0.4, text: "He's gone at the next stop, with your wallet.", pay: 1 }] },
    { label: "Put the phone away, check your pockets", tone: "calm", traits: { daring: -1 }, outcomes: [{ text: "Everything's there. You keep a hand on it till you get off." }] },
  ], SMALL),
  thing(["laptop"], "laptop", ["food", "work", "home"], "💻", "Fix my computer?", "Everyone knows you have a laptop now. Your aunty's friend brings hers, \"just slow\", and wants it fixed for her daughter's exams.", [
    { label: "Spend the evening fixing it", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "Four hours, sixty viruses. The daughter passes. You're the family IT department now.", rep: 2 }] },
    { label: "Take it to a repair shop for her", tone: "calm", outcomes: [{ text: "A small bill, a working laptop, everyone's happy.", pay: 1, rep: 1 }] },
    { label: "\"I only use mine for work\"", tone: "calm", traits: { people: -1 }, outcomes: [{ text: "She takes it elsewhere." }] },
  ], SMALL),
  thing(["generator", "inverter", "solar"], "light", ["home"], "💡", "The only light on the street", "NEPA has taken light for the third night. Yours is the only house with power. Your neighbours are standing outside in the dark, looking at your window.", [
    { label: "Run an extension and let them charge their phones", tone: "kind", traits: { people: 2, giving: 1 }, outcomes: [{ text: "Twenty phones on a power strip by your gate. You're the street's hero.", rep: 3 }] },
    { label: "Charge a small fee", tone: "bold", traits: { giving: -1, daring: 1 }, outcomes: [{ text: "₦200 a phone. Fair, some say. Others say less kind things.", get: 0.5, rep: -1 }] },
    { label: "Close the curtains", tone: "calm", traits: { people: -2 }, outcomes: [{ text: "Your light, your business. The street remembers.", rep: -1 }] },
  ], SMALL),
  thing(["tv", "console"], "screen", ["home"], "📺", "Match night", "Nigeria are playing tonight. Your neighbours' TV is broken and they've heard you have a good one.", [
    { label: "Open your living room to everyone", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "Twenty people, one TV, one goal. The noise when Nigeria score!", rep: 3, effect: "blessed" }] },
    { label: "Invite just your close friends", tone: "calm", outcomes: [{ text: "A small, good night.", rep: 1 }] },
    { label: "Watch alone", tone: "calm", traits: { people: -1 }, outcomes: [{ text: "You can hear them listening on the radio next door." }] },
  ]),
  thing(["speaker", "earbuds"], "speaker", ["home", "outdoors", "night"], "🔊", "Bring the music", "Your friends are planning a beach day. Someone says: \"Bring the speaker, nobody else has one like it.\"", [
    { label: "Bring it and DJ", tone: "bold", traits: { daring: 1, people: 2 }, outcomes: [{ text: "Afrobeats till sunset. Strangers join the dance.", rep: 2 }] },
    { label: "Lend it", tone: "kind", outcomes: [{ text: "It comes back sandy, with stories.", rep: 1 }] },
    { label: "Keep it at home", tone: "calm", outcomes: [{ text: "Someone brings a phone instead. It's not the same." }] },
  ]),
  thing(["drone", "camera"], "lens", ["outdoors", "street", "worship"], "📸", "Film our wedding?", "A couple at your church have heard about your camera. They can't afford a photographer for their wedding. \"Could you...?\"", [
    { label: "Do it for free", tone: "kind", traits: { giving: 2, people: 1 }, outcomes: [{ text: "Your photos are framed in their living room for the rest of their lives.", rep: 3 }] },
    { label: "Do it for a small fee", tone: "calm", outcomes: [{ text: "A fair price, a good day, three new bookings from the guests.", get: 1, rep: 1 }] },
    { label: "Say you're busy", tone: "calm", outcomes: [{ text: "Their cousin takes the photos on a phone." }] },
  ], SMALL),
  // ---------------------------------------------------------------- home
  thing(["fan", "air_conditioner"], "cool", ["home"], "🌬️", "The heatwave", "The heat is unbearable. Mama Tobi from downstairs is fanning herself with a newspaper, her grandson asleep on her lap, sweating.", [
    { label: "Invite them into your cool room", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "The baby sleeps for four hours. Mama Tobi brings you moi-moi the next day.", rep: 2 }] },
    { label: "Lend them your fan", tone: "kind", outcomes: [{ text: "She blesses you twice.", rep: 1 }] },
    { label: "Stay cool, quietly", tone: "calm", outcomes: [{ text: "You can hear the baby crying through the floor." }] },
  ]),
  thing(["bed", "sofa"], "guest", ["home"], "🛋️", "A guest from the village", "Your uncle's son has arrived from the village for \"a few days\" to look for work. He's eyeing your comfortable sofa.", [
    { label: "Let him stay as long as he needs", tone: "kind", traits: { people: 2, ways: 2 }, outcomes: [{ text: "Three months. He finds a job. He never forgets.", rep: 2, effect: "owed_favour" }] },
    { label: "Two weeks, then he finds a place", tone: "calm", outcomes: [{ text: "Fair. He's out in sixteen days. Close enough.", rep: 1 }] },
    { label: "Pay for a cheap hotel instead", tone: "calm", traits: { people: -1 }, outcomes: [{ text: "Your uncle is offended on his behalf.", pay: 1, rep: -1 }] },
  ], SMALL),
  thing(["fridge", "gas_cooker", "blender"], "kitchen", ["home"], "🍲", "Cooking for the street", "There's a death in the family two doors down. The women of the street are cooking for the mourners, and your kitchen is the best equipped.", [
    { label: "Open your kitchen to them", tone: "kind", traits: { people: 2, ways: 1 }, outcomes: [{ text: "Your kitchen smells of jollof for two days. The family thanks you by name at the service.", rep: 3 }] },
    { label: "Cook a pot yourself and send it", tone: "kind", outcomes: [{ text: "Your pot comes back clean. That's the highest praise.", pay: 0.5, rep: 2 }] },
    { label: "Send money instead", tone: "calm", outcomes: [{ text: "Useful, but cold.", pay: 1 }] },
  ], SMALL),
  // ---------------------------------------------------------------- art
  thing(["painting", "adire", "talking_drum"], "art_visitor", ["home"], "🎨", "A collector at your door", "A friend brings a visitor from abroad to see the art in your home. She falls in love with one piece. \"Name a price.\"", [
    { label: "Name a big price", tone: "bold", traits: { giving: -1, daring: 1 }, outcomes: [{ chance: 0.5, text: "She pays it without blinking.", get: 1 }, { chance: 0.5, text: "She laughs. \"Too much.\" No sale." }] },
    { label: "Introduce her to the artist instead", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "She commissions three pieces from the artist. He calls you, overjoyed.", rep: 3 }] },
    { label: "\"It's not for sale\"", tone: "calm", outcomes: [{ text: "Some things stay on your wall." }] },
  ], BIG),
  thing(["sculpture", "terracotta", "enwonwu_painting"], "museum", ["home", "street"], "🏛️", "The museum calls", "The national museum asks if they can borrow your piece for an exhibition. Thousands will see it. It will be gone for six months.", [
    { label: "Lend it", tone: "kind", traits: { people: 2, ways: 2 }, outcomes: [{ text: "Your name is on the little card beside it: \"From the collection of...\"", rep: 4, effect: "talked_about" }] },
    { label: "Lend it, with a fee", tone: "calm", traits: { giving: -1 }, outcomes: [{ text: "They pay for the loan. Less glory, more money.", get: 1, rep: 1 }] },
    { label: "Keep it at home", tone: "calm", outcomes: [{ text: "It stays where it is. Your guests still gasp." }] },
  ], MEDIUM),
  // ---------------------------------------------------------------- fitness
  thing(["dumbbells", "treadmill", "boxing_gloves"], "fit", ["home", "sport"], "💪🏾", "The training pays off", "All those mornings with your gear at home: today the man at the gym who always shows off challenges you in front of everyone.", [
    { label: "Accept", tone: "bold", traits: { daring: 2 }, outcomes: [{ chance: 0.65, text: "You win, clearly. The gym goes wild.", rep: 3 }, { chance: 0.35, text: "He wins, just. He shakes your hand: \"You're strong.\"", rep: 1 }] },
    { label: "Offer to train together instead", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "Rivals become training partners.", rep: 2 }] },
    { label: "Ignore him", tone: "calm", outcomes: [{ text: "You know what you can do." }] },
  ]),
  thing(["bicycle", "football"], "play", ["outdoors", "street"], "⚽", "The children on your street", "The children on your street are kicking a crushed bottle around. They see your football.", [
    { label: "Give them the ball", tone: "kind", traits: { giving: 2 }, outcomes: [{ text: "The ball lasts a week of glory. The street is louder and happier.", rep: 2 }] },
    { label: "Play with them", tone: "bold", traits: { people: 2 }, outcomes: [{ text: "You score once and get tackled by a seven-year-old. Best afternoon in ages.", rep: 2, effect: "blessed" }] },
    { label: "Keep it for yourself", tone: "calm", outcomes: [{ text: "They go back to the bottle." }] },
  ]),
  // ---------------------------------------------------------------- cars
  thing(["cat:car"], "car_lift", ["street", "work", "home"], "🚗", "\"You're going my way?\"", "Your colleague's daughter missed the school bus. Your car is right there, and her school is the other way.", [
    { label: "Drive her", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "You're late for work, and her mother thanks you every day for a month.", rep: 2 }] },
    { label: "Pay for a taxi for her", tone: "calm", outcomes: [{ text: "She gets there. You get there.", pay: 1, rep: 1 }] },
    { label: "Say you can't", tone: "calm", outcomes: [{ text: "She takes a keke. It works out." }] },
  ], SMALL),
  thing(["car_keke", "car_danfo", "car_bike"], "work_ride", ["street", "home"], "🛺", "Put it to work?", "A young man asks to rent your vehicle to work in the day: \"I'll bring you {ask} every week, and fix anything that breaks.\"", [
    { label: "Rent it to him", tone: "bold", traits: { daring: 1, people: 1 }, outcomes: [{ chance: 0.6, text: "He pays every Friday, on time. A little income, a lot of trust.", get: 1, rep: 1 }, { chance: 0.4, text: "He pays twice, then disappears for a week. It comes back with a dent.", effect: "bad_day" }] },
    { label: "Ask for a guarantor first", tone: "calm", traits: { daring: -1, truth: 1 }, outcomes: [{ text: "His pastor stands for him. It works out well.", get: 0.8 }] },
    { label: "Keep it for yourself", tone: "calm", outcomes: [{ text: "Yours, and only yours." }] },
  ], SMALL),
  thing(["car_corolla", "car_accord", "car_camry", "car_sienna"], "car_scratch", ["street", "shop", "food"], "😤", "Who scratched it?", "You come back to find a long scratch down the side of your car. A boy nearby says he saw who did it, for {ask}.", [
    { label: "Pay him to tell you", tone: "bold", outcomes: [{ chance: 0.5, text: "It was the driver who parked next to you. He pays for the repair, embarrassed.", pay: 1, get: 2 }, { chance: 0.5, text: "He points at a car that's long gone. Your money's gone too.", pay: 1 }] },
    { label: "Let it go", tone: "calm", traits: { wrongs: 2 }, outcomes: [{ text: "It's Lagos. Cars get scratched." }] },
  ], SMALL),
  thing(["car_lexus", "car_hilux", "car_gwagon"], "big_car", ["street", "shop"], "🚙", "Big car problems", "At a police checkpoint, the officer sees your big car and decides you must be very rich. \"Your papers are... incomplete.\"", [
    { label: "Show every paper, slowly", tone: "calm", traits: { truth: 2, daring: -1 }, outcomes: [{ text: "Everything is complete. He sighs and waves you on.", rep: 1 }] },
    { label: "\"Settle\" him", tone: "mean", traits: { truth: -2 }, outcomes: [{ text: "He smiles. You'll be stopped again at the next one.", pay: 1, rep: -1 }] },
    { label: "Call your lawyer on speaker", tone: "bold", traits: { daring: 2 }, outcomes: [{ text: "He hands back your papers before the lawyer finishes \"Hello\".", rep: 1 }] },
  ], MEDIUM),
  thing(["car_bentayga", "car_urus", "car_cullinan"], "supercar", ["street", "night", "food"], "🏎️", "A crowd round your car", "Outside the club, a crowd has gathered round your car, taking selfies with it. One of them is leaning on the bonnet.", [
    { label: "Let them, and take a photo with them", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "Fifty people tag you. You're the most famous car in Lekki this week.", rep: 3, effect: "talked_about" }] },
    { label: "Ask them to step away", tone: "calm", outcomes: [{ text: "They do, mostly. One grumbles about \"big men\"." }] },
    { label: "Drive off and spray them with dust", tone: "mean", traits: { people: -2 }, outcomes: [{ text: "Someone films that instead. It doesn't look good.", rep: -3, effect: "talked_about" }] },
  ]),
];
