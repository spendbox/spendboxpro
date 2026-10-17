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
  // ---------------------------------------------------------------- from the market
  thing(["rice_bag", "palm_oil", "yam_tubers", "tomato_basket", "stockfish"], "foodstuff", ["home", "street"], "🍚", "A full kitchen", "Word has gone round the compound that your kitchen is full: rice, oil, yam, the lot. A neighbour knocks. Her children haven't eaten since morning.", [
    { label: "Fill a bag for her", tone: "kind", traits: { giving: 2, people: 1 }, outcomes: [{ text: "She prays for you all the way down the stairs. The compound remembers.", rep: 2, effect: "blessed" }] },
    { label: "Cook a big pot and call everyone", tone: "bold", traits: { people: 2 }, outcomes: [{ text: "Jollof for the whole compound. Someone brings drinks, someone brings music.", rep: 3 }] },
    { label: "\"Sorry, it's all counted\"", tone: "calm", traits: { giving: -1 }, outcomes: [{ text: "She nods and goes. The door stays shut a little longer next time you need something." }] },
  ]),
  thing(["pot_set", "mortar"], "pounding", ["home"], "🥣", "Pounded yam day", "Your aunt is visiting and has seen your mortar and big pots. \"Today we pound yam. Properly. No machine.\"", [
    { label: "Take the pestle yourself", tone: "bold", traits: { ways: 2 }, outcomes: [{ text: "Your arms burn. The yam is perfect. She tells everyone you were raised well.", rep: 1 }] },
    { label: "Call the neighbour's boys to help", tone: "kind", traits: { people: 1 }, outcomes: [{ text: "Six hands, one rhythm, a song. Everyone eats.", rep: 1 }] },
    { label: "Order poundo from the shop instead", tone: "calm", traits: { ways: -2 }, outcomes: [{ text: "She takes one look and says nothing. Loudly." }] },
  ]),
  thing(["lace_fabric", "okrika"], "tailor", ["street", "shop", "worship"], "🪡", "The tailor's promise", "Your tailor swore your outfit would be ready \"latest Friday\". It's Saturday morning, the party starts at noon, and his shop is shut.", [
    { label: "Find his house", tone: "bold", traits: { daring: 2 }, outcomes: [{ text: "He's sewing the last hem in his sitting room. You arrive at the party fashionably late, and fabulous.", rep: 1 }] },
    { label: "Wear something old, with style", tone: "calm", outcomes: [{ text: "Nobody notices. Or they're too polite to say." }] },
    { label: "Post about him online", tone: "mean", traits: { people: -1 }, outcomes: [{ text: "Two hundred people share their own stories about him. He calls you, crying.", effect: "talked_about" }] },
  ]),
  thing(["phone_charger"], "charger", ["street", "work", "food"], "🔌", "\"Abeg, help me charge\"", "Your phone charger is the only one in the room that fits. Five people want to use it, one after the other.", [
    { label: "Share it round", tone: "kind", traits: { people: 2, giving: 1 }, outcomes: [{ text: "Everyone's phone lives. You're the hero of the afternoon.", rep: 1 }] },
    { label: "Charge for the charging", tone: "bold", traits: { giving: -1 }, outcomes: [{ text: "Business is business. A small, unexpected profit.", get: 1 }] },
  ], SMALL),
  // ---------------------------------------------------------------- from the museum
  thing(["art_onabolu", "art_okeke", "art_twins", "art_emokpae", "art_grillo", "art_ife_cast", "art_enwonwu_tutu"], "masterpiece", ["home", "food", "night"], "🖼️", "A museum calls", "The National Museum wants to borrow your masterpiece for a big exhibition of Nigerian modern art. Collectors from London and New York will be there.", [
    { label: "Lend it, with your name on the card", tone: "bold", traits: { ways: 2, daring: 1 }, outcomes: [{ text: "\"From the collection of...\" Your name on the wall of the National Museum. People talk about it for weeks.", rep: 5, effect: "talked_about" }] },
    { label: "Lend it without your name", tone: "kind", traits: { giving: 2 }, outcomes: [{ text: "Thousands of schoolchildren see it. Nobody knows it's yours, and that's fine.", rep: 2, effect: "blessed" }] },
    { label: "Keep it at home", tone: "calm", traits: { giving: -1 }, outcomes: [{ text: "It stays on your wall, where only your guests see it." }] },
  ]),
  // ---------------------------------------------------------------- more of your things
  thing(["fridge"], "fridge", ["home"], "🧊", "\"Abeg, keep my meat\"", "NEPA has been off for two days and your fridge is the only cold one in the compound (somehow). Your neighbour is at the door with a bag of meat for her daughter's birthday party. \"Just till Saturday.\"", [
    { label: "Make room for it", tone: "kind", traits: { people: 2, giving: 1 }, outcomes: [{ text: "Saturday comes, the meat is perfect, and you're the first person served at the party.", rep: 2 }] },
    { label: "Make room, but only for hers", tone: "calm", outcomes: [{ text: "Then the woman upstairs brings fish. Then her sister brings chicken. You draw the line at the goat head.", rep: 1 }] },
    { label: "Say it's already full", tone: "calm", traits: { truth: -1, people: -1 }, outcomes: [{ text: "She looks past you at your nearly empty fridge. She goes.", rep: -1 }] },
  ]),
  thing(["gas_cooker"], "gas", ["home"], "🔥", "The gas has finished", "Your gas has finished halfway through cooking stew, at 9pm, with guests coming tomorrow. The gas man down the road says he'll come and refill it tonight, for {ask} \"night rate\".", [
    { label: "Pay the night rate", tone: "calm", traits: { daring: -1 }, outcomes: [{ text: "He arrives with the cylinder on his head. The stew is finished by eleven.", pay: 1 }] },
    { label: "Borrow your neighbour's cylinder", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "She lends it gladly, and you bring her a plate of the stew. Fair trade.", rep: 1 }] },
    { label: "Finish it on charcoal", tone: "bold", traits: { ways: 2 }, outcomes: [{ text: "Smoky, slow, and somehow the best stew you've ever made. Your guests ask for the recipe.", rep: 1 }] },
  ], SMALL),
  thing(["sneakers"], "sneaker_step", ["street", "night", "food"], "👟", "Somebody stepped on them", "In the crowd outside the show, a man steps square on your white designer sneakers and leaves a muddy footprint. He looks down. \"Ah, sorry. Are they original?\"", [
    { label: "Laugh and wipe them", tone: "kind", traits: { wrongs: 2 }, outcomes: [{ text: "\"Original, yes. Clean, not any more.\" He laughs and buys you a drink.", rep: 1 }] },
    { label: "Make him clean them", tone: "bold", traits: { wrongs: -2, daring: 1 }, outcomes: [{ chance: 0.5, text: "He kneels with a handkerchief, and the crowd cheers him on. Spotless.", rep: 1 }, { chance: 0.5, text: "\"For ordinary shoe?\" A crowd gathers. You walk away, footprint and all.", rep: -1 }] },
    { label: "Ask him the same about his", tone: "bold", traits: { daring: 1 }, outcomes: [{ text: "He looks at his own fake sneakers, then at you, and you both burst out laughing.", rep: 1 }] },
  ]),
  thing(["drone"], "drone_fence", ["home", "outdoors"], "🛸", "\"Are you spying on us?\"", "You flew your drone over the street for a nice video. Now your neighbour is at your gate, furious: his wife saw \"a camera in the sky\" over their compound.", [
    { label: "Show him the video", tone: "calm", traits: { truth: 2 }, outcomes: [{ text: "He watches. His compound looks lovely from above. He asks for a copy.", rep: 1 }] },
    { label: "Offer to film his daughter's wedding", tone: "kind", traits: { people: 2, giving: 1 }, outcomes: [{ text: "Anger turns into a deal. The wedding video goes round the whole family, with your name at the end.", rep: 3 }] },
    { label: "Tell him the sky is free", tone: "mean", traits: { wrongs: -1, people: -2 }, outcomes: [{ text: "He reports you to the estate. There's a meeting. There's a rule now.", rep: -2 }] },
  ]),
  thing(["football"], "ball_fence", ["street", "outdoors", "home"], "⚽", "Over the wall", "The boys on your street were playing with your football and it's gone over the wall of the big house at the end. The gateman says the madam of the house \"doesn't return balls\".", [
    { label: "Knock and ask the madam yourself", tone: "bold", traits: { daring: 2, people: 1 }, outcomes: [{ chance: 0.6, text: "The madam turns out to be lovely. She returns the ball and two old ones she'd collected. The boys go mad.", rep: 3 }, { chance: 0.4, text: "She keeps it, on principle. She gives you a lecture about her flowers.", rep: 1 }] },
    { label: "Buy the boys a new ball", tone: "kind", traits: { giving: 2 }, outcomes: [{ text: "A brand new ball. The boys promise to play facing the other way. They don't.", pay: 1, rep: 2 }] },
    { label: "Tell them to play somewhere else", tone: "calm", traits: { people: -1 }, outcomes: [{ text: "They drift off, kicking a tin can instead." }] },
  ], SMALL),
  thing(["bicycle"], "bicycle", ["street", "home"], "🚲", "Can I borrow your bicycle?", "The neighbour's son wants to borrow your bicycle to go and write an exam across town. \"I'll bring it back by four, I swear.\"", [
    { label: "Lend it", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "Four o'clock: the bicycle, and a boy who says the paper was easy.", rep: 2 }, { chance: 0.3, text: "Six o'clock: the bicycle, with a flat tyre and a very sorry boy.", rep: 1 }] },
    { label: "Give him transport money instead", tone: "calm", traits: { giving: 1 }, outcomes: [{ text: "\"Take a bus. Focus on the exam.\" He goes.", pay: 1, rep: 1 }] },
    { label: "Ride him there yourself", tone: "bold", traits: { daring: 2, people: 1 }, outcomes: [{ text: "Him on the back, you pedalling through traffic. He arrives on time. Your legs never forgive you.", rep: 3 }] },
  ], SMALL),
  thing(["car_bike"], "bike_hail", ["street"], "🏍️", "\"Okada! Okada!\"", "You're on your motorbike at the junction and a woman with a big bag waves at you: \"Ojuelegba, how much?\" She thinks you're an okada. She's offering {ask}.", [
    { label: "Take her, why not", tone: "bold", traits: { people: 1, daring: 1 }, outcomes: [{ text: "Ojuelegba, ten minutes. She pays and asks for your number for tomorrow.", get: 1 }] },
    { label: "Take her for free", tone: "kind", traits: { giving: 2, people: 1 }, outcomes: [{ text: "\"You no be okada?\" She's so embarrassed she prays for you all the way there.", rep: 2 }] },
    { label: "\"I'm not an okada, ma\"", tone: "calm", outcomes: [{ text: "\"Ah, sorry o.\" She waves down a real one." }] },
  ], SMALL),
  thing(["car_danfo"], "danfo_driver", ["street", "home"], "🚐", "Your driver calls", "Your danfo's driver calls from the garage. The agberos at the park now want {ask} a day from every bus, \"new levy\", or your bus doesn't load.", [
    { label: "Pay the levy", tone: "calm", traits: { daring: -1 }, outcomes: [{ text: "The bus loads. The levy will rise again next month.", pay: 1 }] },
    { label: "Go to the park yourself", tone: "bold", traits: { daring: 2, people: 1 }, outcomes: [{ chance: 0.5, text: "You meet the chairman, share a bottle of malt, agree on half. Your driver is impressed.", pay: 0.5, rep: 2 }, { chance: 0.5, text: "The chairman keeps you waiting for two hours, then says the levy is the levy.", pay: 1 }] },
    { label: "Move to another park", tone: "calm", traits: { truth: 1 }, outcomes: [{ text: "A smaller park, fewer passengers, no levy. Your driver complains, but it works.", rep: 0 }] },
  ], SMALL),
  thing(["car_sienna"], "sienna_church", ["worship", "home"], "🚐", "The choir needs your Sienna", "The choir is going to a competition in Ibadan on Saturday and the church bus has broken down. The choir mistress looks at your Sienna, then at you, with great hope.", [
    { label: "Drive them there yourself", tone: "kind", traits: { people: 2, ways: 1 }, outcomes: [{ text: "Seven singers, three hours, every hymn ever written. They win second place and dedicate it to you.", rep: 3 }] },
    { label: "Lend it with fuel money", tone: "kind", traits: { giving: 2 }, outcomes: [{ text: "It comes back washed, full of fuel, and smelling of jollof.", pay: 1, rep: 2 }] },
    { label: "\"It's having problems too\"", tone: "calm", traits: { truth: -2 }, outcomes: [{ text: "They take two buses. On Sunday, someone sees your Sienna outside the mall.", rep: -2 }] },
  ], MEDIUM),
  thing(["console"], "console_match", ["home"], "🎮", "FIFA for money", "The boys from the next street have heard you have a console. Their champion wants a FIFA match in your parlour, {ask} on the line, and the whole street wants to watch.", [
    { label: "Play him", tone: "bold", traits: { daring: 2 }, outcomes: [{ chance: 0.5, text: "Last-minute header! The parlour explodes. You are the street's champion now.", get: 1, rep: 2 }, { chance: 0.5, text: "He beats you 4-0 and celebrates on your sofa.", pay: 1 }] },
    { label: "Make it a tournament", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "Sixteen players, one bracket, a carton of malt. Best Saturday on the street in years.", pay: 0.3, rep: 3 }] },
    { label: "Not in your parlour", tone: "calm", traits: { people: -1 }, outcomes: [{ text: "They play at the viewing centre instead. You can hear the shouting from home." }] },
  ], SMALL),
  thing(["sunglasses"], "shades_star", ["street", "food", "night"], "🕶️", "\"Are you not that actor?\"", "In your designer sunglasses, two girls at the next table are sure you're a Nollywood star. \"Please, just one picture, we loved you in that film!\"", [
    { label: "Play along for one picture", tone: "bold", traits: { truth: -1, daring: 1 }, outcomes: [{ text: "One picture, two autographs. You don't even know which film. They're thrilled.", rep: 1 }, { chance: 0.3, text: "The real actor comments on their post: \"Who is this?\" The internet loves it.", rep: 1, effect: "talked_about" }] },
    { label: "Take the glasses off and laugh", tone: "kind", traits: { truth: 2 }, outcomes: [{ text: "\"Ah! You look like him sha.\" They take a picture with you anyway.", rep: 1 }] },
    { label: "Keep eating, mysteriously", tone: "calm", outcomes: [{ text: "Silence is what a real star would do. They're even more convinced." }] },
  ]),
  thing(["okrika"], "okrika_pocket", ["home", "street"], "👖", "Something in the pocket", "Washing your new okrika jeans, you find something in the back pocket that the last owner, somewhere abroad, forgot: a folded foreign banknote worth about {ask}.", [
    { label: "Change it and enjoy it", tone: "bold", traits: { giving: -1 }, outcomes: [{ text: "The mallam at the bureau de change counts it twice. Okrika has never paid so well.", get: 1 }] },
    { label: "Give it to the woman who sold you the jeans", tone: "kind", traits: { truth: 2, giving: 2 }, outcomes: [{ text: "She stares at you, then at the money. \"Nobody has ever brought anything back.\" She gives you two shirts free.", rep: 2 }] },
    { label: "Keep it as a lucky charm", tone: "calm", traits: { ways: 1 }, outcomes: [{ text: "It goes in your wallet, behind your ID. Lucky things happen. Probably.", effect: "lucky" }] },
  ], SMALL),
  thing(["tv"], "tv_final", ["home"], "📺", "The final is tonight", "The cup final is tonight and NEPA has brought light. Somehow the whole compound knows you have the biggest TV, and they're already arranging plastic chairs in your parlour.", [
    { label: "Open the doors", tone: "kind", traits: { people: 2 }, outcomes: [{ text: "Thirty people, one TV, one goal in the last minute. The whole street hears your parlour scream.", rep: 3 }] },
    { label: "Put the TV outside for everyone", tone: "bold", traits: { people: 2, daring: 1 }, outcomes: [{ chance: 0.7, text: "A street cinema! Suya sellers arrive. It's a festival.", rep: 3 }, { chance: 0.3, text: "Rain at half-time. You and four men carry the TV in like a coffin.", rep: 2 }] },
    { label: "Lock the door and watch alone", tone: "calm", traits: { people: -2 }, outcomes: [{ text: "Perfect view, perfect quiet. And, through the door, thirty disappointed people.", rep: -1 }] },
  ]),
  thing(["air_conditioner"], "ac_visitors", ["home"], "❄️", "Suddenly so many visitors", "It's the hottest week of the year, and the children of the compound have discovered your air conditioner. Six of them are \"visiting\" your parlour, very politely, doing nothing at all except breathing cold air.", [
    { label: "Let them stay and do homework", tone: "kind", traits: { people: 2, giving: 1 }, outcomes: [{ text: "Your parlour becomes the coolest homework club in Lagos. The parents bring you food every week.", rep: 3 }] },
    { label: "One hour, then home", tone: "calm", outcomes: [{ text: "They agree to the hour. They argue about the minutes.", rep: 1 }] },
    { label: "Send them home", tone: "calm", traits: { people: -2 }, outcomes: [{ text: "Six sad faces go back out into the heat." }] },
  ]),
];
