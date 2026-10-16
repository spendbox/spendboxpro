// More answers for everyday moments (docs/LIFE_WHEEL.md): each moment keeps a pool of answers and
// shows at most four, in a shuffled order, so it plays differently the next time. These are added to
// the answers written with each moment (./moments.ts). None of them is simply right or wrong: each
// costs something and gives something, and some turn out better for people who are a certain way
// (`likelier`) or while something is on them (an effect).

import type { MomentChoice } from "./moments.ts";

export const MORE_ANSWERS: Record<string, MomentChoice[]> = {
  dropped_wallet: [
    {
      label: "Take it to the nearest police post",
      tone: "calm",
      traits: { truth: 2, daring: -1 },
      outcomes: [
        { text: "The officer counts it twice and writes your name in a book. You'll never know if {name} got it all back.", rep: 1 },
        { chance: 0.4, text: "A week later {name} finds you through the police. \"You're the one!\" They're crying.", rep: 3, get: 0.2 },
      ],
    },
    {
      label: "Keep the cash, post the ID card back",
      tone: "bold",
      traits: { truth: -2, giving: -1 },
      outcomes: [
        { text: "You keep the money and drop the card in a post box. Half honest is still half.", get: 1, rep: -1 },
        { chance: 0.3, text: "Someone at the bus stop saw you count it. \"Na so una dey do?\"", get: 1, rep: -4, effect: "talked_about" },
      ],
    },
  ],
  area_boys: [
    {
      label: "Make them laugh",
      tone: "bold",
      traits: { daring: 1, truth: -1, people: 1 },
      outcomes: [
        { text: "Your joke about their oga's belly lands. They let you pass and call you \"chairman\".", rep: 2, likelier: [{ trait: "truth", side: -1 }] },
        { chance: 0.6, text: "Nobody laughs. You pay, and pay for the joke too.", pay: 1.5 },
      ],
    },
    {
      label: "Call their oga by name",
      tone: "bold",
      traits: { truth: -2, people: 1 },
      outcomes: [
        { chance: 0.5, text: "\"You know Baba Sule?\" They step back fast. You're somebody now.", rep: 2, likelier: [{ trait: "people", side: 1 }] },
        { chance: 0.5, text: "\"Which Baba Sule?\" You've made it worse. It costs you double.", pay: 2, rep: -1, effect: "bad_day" },
      ],
    },
  ],
  pickpocket: [
    {
      label: "Let him go, then follow him",
      tone: "bold",
      traits: { daring: 2, wrongs: -1 },
      outcomes: [
        { chance: 0.4, text: "He leads you to where they share the day's takings. You get yours back, and a story.", rep: 2 },
        { chance: 0.6, text: "You lose him in the market, and your {ask} with him.", pay: 1 },
      ],
    },
    {
      label: "Grab him and let him explain",
      tone: "kind",
      traits: { wrongs: 2, giving: 1 },
      outcomes: [
        { text: "He's fifteen and hungry. You let him keep a little and tell him to go home.", pay: 0.2, rep: 2 },
        { chance: 0.35, text: "He's fifteen and hungry, he says. Then his friends appear. You walk away lighter.", pay: 1 },
      ],
    },
  ],
  stranded_student: [
    {
      label: "Ask to see their student ID first",
      tone: "calm",
      traits: { daring: -2, truth: 1 },
      outcomes: [
        { text: "They show it, a bit hurt. You give them the money and an awkward smile.", pay: 1, rep: 1 },
        { chance: 0.4, text: "\"I left it in the hostel.\" They walk off quickly. You'll never know.", rep: 0 },
      ],
    },
    {
      label: "Walk them to the bus and pay the driver",
      tone: "kind",
      traits: { giving: 1, daring: -1, people: 1 },
      outcomes: [{ text: "The driver promises to drop {name} at the gate. {name} waves from the window.", pay: 1, rep: 2, follow: "student_thanks" }],
    },
  ],
  prophet_seed: [
    {
      label: "Ask him to pray for free",
      tone: "calm",
      traits: { truth: 1, ways: -1 },
      outcomes: [
        { text: "He looks at you like you've insulted his ancestors, then prays anyway. Quickly.", rep: 0 },
        { chance: 0.4, text: "He prays so loudly the whole bus stop says amen. You feel strangely better.", rep: 1, effect: "blessed" },
      ],
    },
    {
      label: "Sow half and watch what happens",
      tone: "bold",
      traits: { ways: 2, daring: 1 },
      outcomes: [
        { text: "\"Half a seed is half a harvest,\" he says, and takes it.", pay: 0.5 },
        { chance: 0.3, text: "That evening, money you'd forgotten turns up. Coincidence, surely.", pay: 0.5, get: 1, effect: "lucky" },
      ],
    },
  ],
  baba_ijebu: [
    {
      label: "Stake on a friend's birthday",
      tone: "bold",
      traits: { daring: 1, people: 1, ways: 1 },
      outcomes: [
        { chance: 0.12, text: "It comes in! You call your friend first. They want a cut.", get: 4, likelier: [{ effect: "lucky" }] },
        { chance: 0.88, text: "Not today. Your friend says it's always been an unlucky number.", pay: 1 },
      ],
    },
  ],
  money_on_ground: [
    {
      label: "Ask the people around if it's theirs",
      tone: "calm",
      traits: { truth: 2, people: 1 },
      outcomes: [
        { text: "Four people say it's theirs. You keep it, and it feels worse than if you'd just picked it up.", get: 1, rep: -1 },
        { chance: 0.5, text: "An old man pats his pockets and nods. He's very grateful.", rep: 2 },
      ],
    },
  ],
  car_breakdown: [
    {
      label: "Call your mechanic for them",
      tone: "kind",
      traits: { people: 2, giving: 1 },
      outcomes: [
        { text: "Your mechanic comes in twenty minutes. {name} is saved; you've done him a favour too.", rep: 2, effect: "owed_favour" },
        { chance: 0.3, text: "Your mechanic charges {name} double \"for coming far\". They give you a look.", rep: -1 },
      ],
    },
    {
      label: "Film it for your status",
      tone: "mean",
      traits: { giving: -1, ways: -2 },
      outcomes: [
        { text: "It gets a few laughs online. {name} is not laughing.", rep: -2 },
        { chance: 0.3, text: "It goes round. Someone tags {name}, who tags you back, angry.", rep: -3, effect: "talked_about" },
      ],
    },
  ],
  fake_officer: [
    {
      label: "Ask to settle at the station",
      tone: "bold",
      traits: { truth: 2, daring: 1 },
      outcomes: [
        { chance: 0.6, text: "Suddenly he's very busy. \"Go, go, I'm letting you off.\"", rep: 2 },
        { chance: 0.4, text: "He drives you round for an hour before letting you go. Still free, but your day is gone.", effect: "bad_day" },
      ],
    },
    {
      label: "Bargain like it's the market",
      tone: "bold",
      traits: { truth: -2, daring: 1 },
      outcomes: [{ text: "From {ask} to a quarter. You both know what this was.", pay: 0.25, likelier: [{ trait: "truth", side: -1 }] }, { chance: 0.5, text: "He won't move. You pay most of it.", pay: 0.8 }],
    },
  ],
  neighbour_sugar: [
    {
      label: "Give it, and ask for something back",
      tone: "calm",
      traits: { giving: -1, people: 1 },
      outcomes: [{ text: "\"Next time, onions.\" {name} laughs. You've started a little trade.", rep: 1 }],
    },
  ],
  uncle_emergency: [
    {
      label: "Ask to speak to the doctor",
      tone: "calm",
      traits: { truth: 2, daring: -1 },
      outcomes: [
        { text: "There is a doctor. The bill is real. You pay it straight to the hospital.", pay: 0.8, rep: 2 },
        { chance: 0.45, text: "\"The doctor... has gone home.\" Uncle {name} hangs up. The family hears you didn't trust him.", rep: -1 },
      ],
    },
    {
      label: "Send it, but tell the family group",
      tone: "bold",
      traits: { giving: 1, truth: 2, people: 1 },
      outcomes: [{ text: "Now everyone knows you sent {ask}. Uncle {name} is quiet. Your mother is proud.", pay: 1, rep: 2 }, { chance: 0.3, text: "Your aunties take Uncle's side: \"Why disgrace him?\"", pay: 1, rep: -1 }],
    },
  ],
  football_window: [
    {
      label: "Make them fix it with you",
      tone: "calm",
      traits: { wrongs: -1, ways: 1, people: 1 },
      outcomes: [{ text: "One Saturday, five boys, one glazier, a lot of noise. The window's fixed and you know their names now.", pay: 0.5, rep: 2 }],
    },
  ],
  estate_dues: [
    {
      label: "Ask to see the accounts first",
      tone: "calm",
      traits: { truth: 2, daring: 1 },
      outcomes: [
        { text: "The chairman sweats. The accounts come out next week, and some money comes back.", rep: 2 },
        { chance: 0.4, text: "\"So you think we're thieves?\" The meeting turns on you. You pay to end it.", pay: 1, rep: -1 },
      ],
    },
    {
      label: "Offer to run the project",
      tone: "bold",
      traits: { people: 2, daring: 1 },
      outcomes: [{ text: "You're in charge of street lights now. Everyone will blame you if they don't work.", pay: 0.5, rep: 3 }],
    },
  ],
  wrong_bill: [
    {
      label: "Pay it, then tip the waiter less",
      tone: "calm",
      traits: { wrongs: -1, giving: -1 },
      outcomes: [{ text: "You pay what they asked and leave a small tip. The waiter knows exactly why.", pay: 0.8 }],
    },
  ],
  alone_diner: [
    {
      label: "Pay their bill quietly and leave",
      tone: "kind",
      traits: { giving: 2, daring: -1 },
      outcomes: [
        { text: "You're gone before they find out. Nobody saw. It still counts.", pay: 1.2 },
        { chance: 0.3, text: "The waiter tells them. They catch you at the door and won't let go of your hand.", pay: 1.2, rep: 2 },
      ],
    },
  ],
  bouncer: [
    {
      label: "Tell him who your father is",
      tone: "bold",
      traits: { truth: -2, ways: 1 },
      outcomes: [
        { chance: 0.4, text: "Your surname works. He even walks you to the bar.", rep: 1 },
        { chance: 0.6, text: "\"Is your father on the list?\" The queue behind you enjoys this.", rep: -2, effect: "talked_about" },
      ],
    },
  ],
  too_much_change: [
    {
      label: "Give it back, loudly",
      tone: "bold",
      traits: { truth: 2, daring: 1 },
      outcomes: [
        { text: "The whole queue claps. The cashier is grateful and a little embarrassed.", rep: 2 },
        { chance: 0.3, text: "The manager hears and gives the cashier a talking-to. She won't look at you.", rep: 1 },
      ],
    },
    {
      label: "Keep it, then donate it",
      tone: "calm",
      traits: { truth: -1, giving: 1 },
      outcomes: [{ text: "It goes in the next charity box you see. The cashier's till will be short tonight.", rep: 0 }],
    },
  ],
  sweets_child: [
    {
      label: "Buy for every child here",
      tone: "kind",
      traits: { giving: 2, daring: 1 },
      outcomes: [{ text: "Suddenly there are twelve children. You buy for all twelve.", pay: 4, rep: 3 }],
    },
  ],
  offering: [
    {
      label: "Give to the beggar outside instead",
      tone: "calm",
      traits: { giving: 1, ways: -2 },
      outcomes: [
        { text: "You pass the basket and give the woman at the gate {ask} after. Both feel right.", pay: 1, rep: 1 },
        { chance: 0.3, text: "An usher saw you pass the basket. Church people talk.", pay: 1, rep: -1, effect: "talked_about" },
      ],
    },
  ],
  colleague_loan: [
    {
      label: "Lend half, in writing",
      tone: "calm",
      traits: { truth: 1, daring: -1, giving: -1 },
      outcomes: [{ text: "{name} signs a little note, a bit stung. It's very official for friends.", pay: 0.5, follow: "loan_back" }, { chance: 0.3, text: "{name} signs the note. And still disappears.", pay: 0.5, follow: "loan_ghost" }],
    },
  ],
  office_birthday: [
    {
      label: "Organise the whole thing",
      tone: "bold",
      traits: { people: 2, daring: 1 },
      outcomes: [{ text: "Cake, card, a song. {name} cries. Your boss notices who did it.", pay: 2, rep: 3 }],
    },
  ],
  friend_borrow: [
    {
      label: "Send half and ask what it's for",
      tone: "calm",
      traits: { truth: 1, giving: -1 },
      outcomes: [
        { text: "It's school fees for their sister. You feel bad for asking and send the rest.", pay: 1, rep: 1, follow: "loan_back" },
        { chance: 0.4, text: "\"Forget it.\" They leave you on read. Maybe it wasn't fees.", rep: -1 },
      ],
    },
  ],
  lost_child: [
    {
      label: "Ask the market women to shout for the mother",
      tone: "bold",
      traits: { people: 2 },
      outcomes: [{ text: "Ten women shout at once. The mother hears it three streets away and comes running.", rep: 3 }],
    },
  ],
  loan_ghost: [
    {
      label: "Go to their house",
      tone: "bold",
      traits: { daring: 2, wrongs: -1 },
      outcomes: [
        { chance: 0.5, text: "Their mother answers. She pays you herself, ashamed. {name} won't forget this.", get: 1, rep: -1 },
        { chance: 0.5, text: "Nobody's home. The neighbours watch you leave.", rep: -1 },
      ],
    },
    {
      label: "Tell them you've forgiven it",
      tone: "kind",
      traits: { wrongs: 2, giving: 1 },
      outcomes: [
        { text: "You send one message: \"Forget it, we're fine.\" It's gone, but so is the weight.", rep: 1 },
        { chance: 0.35, text: "Two weeks later {name} turns up with all of it and more. \"I was ashamed.\"", get: 1.2, rep: 2 },
      ],
    },
  ],
};
