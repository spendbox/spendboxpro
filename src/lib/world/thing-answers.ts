// What you own gives you more ways to answer (docs/LIFE_WHEEL.md): answers added to everyday
// moments that only show if you have the thing (`has`: a kind, or "cat:" and a category). A car
// means you can give the stranded student a lift; a generator means you can light up the street;
// a camera means you can catch the hit-and-run on film. These always show when you have the thing.

import type { MomentChoice } from "./moments.ts";

const CAR = ["cat:car"];
const POWER = ["generator", "inverter", "solar"];
const CAMERA = ["camera", "smartphone", "tablet", "drone"];
const FINE_WATCH = ["luxury_watch", "rolex_submariner", "rolex_daytona", "rolex_day_date", "ap_royal_oak", "patek_nautilus", "richard_mille", "patek_grandmaster"];
const TRADITIONAL = ["agbada", "aso_oke", "gele", "beads"];
const SPEAKER = ["speaker"];
const FIT = ["dumbbells", "treadmill", "boxing_gloves", "bicycle"];
const KITCHEN = ["gas_cooker", "blender", "fridge", "cookbook"];

export const THING_ANSWERS: Record<string, MomentChoice[]> = {
  nepa: [
    { label: "Start your generator and share the light", tone: "kind", has: POWER, traits: { people: 2, giving: 1 }, outcomes: [{ text: "You run a cable to the neighbours. The whole compound cheers when the light comes on.", rep: 3 }] },
  ],
  stranded_student: [
    { label: "Drive {name} back to campus", tone: "kind", has: CAR, traits: { people: 2 }, outcomes: [{ text: "Forty minutes in traffic, the whole life story. {name} waves from the gate.", rep: 3, follow: "student_thanks" }] },
  ],
  car_breakdown: [
    { label: "Tow {name}'s car with yours", tone: "bold", has: CAR, traits: { daring: 1, people: 2 }, outcomes: [{ text: "A rope, a prayer and your car. You get {name} to the mechanic.", rep: 3, effect: "owed_favour" }] },
  ],
  rain_umbrella: [
    { label: "Offer people a lift in your car", tone: "kind", has: CAR, traits: { people: 2 }, outcomes: [{ text: "Three strangers, dripping, very grateful. Your seats will dry.", rep: 2 }] },
  ],
  go_slow: [
    { label: "Turn your party speaker up", tone: "bold", has: SPEAKER, traits: { daring: 1, people: 1 }, outcomes: [{ text: "The go-slow becomes a street party. A traffic warden dances.", rep: 2, effect: "talked_about" }] },
  ],
  dance_battle: [
    { label: "Bring out your speaker and take over", tone: "bold", has: SPEAKER, traits: { daring: 2 }, outcomes: [{ text: "Your music, your floor. The crowd crowns you.", rep: 3 }] },
  ],
  birthday_table: [
    { label: "Take photos for them", tone: "kind", has: CAMERA, traits: { people: 2 }, outcomes: [{ text: "You send them the photos. They're the best ones from the night.", rep: 2 }] },
  ],
  street_photographer: [
    { label: "Take his photo instead, with your camera", tone: "bold", has: ["camera"], traits: { daring: 1, ways: -1 }, outcomes: [{ text: "He loves it. Photographers never get photographed.", rep: 2 }] },
  ],
  hit_and_run: [
    { label: "Give the police your video of it", tone: "bold", has: CAMERA, traits: { truth: 2, daring: 1 }, outcomes: [{ text: "Your video shows the plate clearly. The case is open by evening.", rep: 4, effect: "under_watch", follow: "witness_court" }] },
  ],
  fake_officer: [
    { label: "Start filming him", tone: "bold", has: CAMERA, traits: { truth: 1, daring: 2 }, outcomes: [{ text: "He sees the phone and remembers somewhere else to be.", rep: 2 }] },
  ],
  bouncer: [
    { label: "Let your watch do the talking", tone: "bold", has: FINE_WATCH, traits: { daring: 1, truth: -1 }, outcomes: [{ text: "His eyes go to your wrist, then the rope goes up. \"Welcome, boss.\"", rep: 1 }] },
  ],
  vip_table: [
    { label: "Order on your watch's reputation", tone: "bold", has: FINE_WATCH, outcomes: [{ text: "The manager comes over personally. The table is yours, no deposit.", rep: 2 }] },
  ],
  owambe: [
    { label: "Wear your finest traditional outfit", tone: "bold", has: TRADITIONAL, traits: { ways: 2 }, outcomes: [{ text: "The aunties approve. Loudly. You're in every photo.", rep: 3 }] },
  ],
  plank_challenge: [
    { label: "Take it on: you've been training at home", tone: "bold", has: FIT, traits: { daring: 1 }, outcomes: [{ chance: 0.75, text: "You hold it twice as long as anyone. The gym claps.", get: 1, rep: 2 }, { chance: 0.25, text: "Close, but not quite.", pay: 1 }] },
  ],
  stray_ball: [
    { label: "Give the kids your own football", tone: "kind", has: ["football"], traits: { giving: 2 }, outcomes: [{ text: "A real ball! They play till dark.", rep: 2 }] },
  ],
  kite_tangle: [
    { label: "Fly your drone up to free it", tone: "bold", has: ["drone"], traits: { daring: 1, ways: -2 }, outcomes: [{ chance: 0.7, text: "The drone nudges it free. The children think you're a magician.", rep: 3 }, { chance: 0.3, text: "The drone gets tangled too. Now there are two things in the tree.", effect: "bad_day" }] },
  ],
  neighbour_sugar: [
    { label: "Cook them a whole meal instead", tone: "kind", has: KITCHEN, traits: { giving: 2, people: 2 }, outcomes: [{ text: "Jollof, plantain, a cold drink. {name} tells everyone in the building.", rep: 3 }] },
  ],
  office_birthday: [
    { label: "Bake the cake yourself", tone: "kind", has: KITCHEN, traits: { people: 2 }, outcomes: [{ text: "A real cake, a bit lopsided. The best thing anyone's eaten at work.", rep: 3 }] },
  ],
  estate_dues: [
    { label: "Offer your solar kit for the street lights", tone: "kind", has: ["solar", "inverter"], traits: { giving: 2, people: 2 }, outcomes: [{ text: "Your panels light the first two poles. The association names the street corner after you, informally.", rep: 4 }] },
  ],
  s_flood: [
    { label: "Ferry people out in your big car", tone: "bold", has: ["car_hilux", "car_gwagon", "car_lexus", "car_bentayga", "car_cullinan", "car_urus"], traits: { daring: 2, people: 2 }, outcomes: [{ text: "Your big tyres go where the danfos can't. Six trips, twenty people dry.", rep: 4 }] },
  ],
  s_harmattan: [
    { label: "Let her sit in your air-conditioned room", tone: "kind", has: ["air_conditioner"], traits: { people: 2 }, outcomes: [{ text: "Cool, clean air. Her cough eases by evening.", rep: 2 }] },
  ],
  s_childrens_day: [
    { label: "Give him a lift to the march", tone: "kind", has: CAR, traits: { people: 2 }, outcomes: [{ text: "He arrives in style, shoe found, and tells all his friends.", rep: 2 }] },
  ],
  lost_child: [
    { label: "Drive round the area with the child", tone: "bold", has: CAR, traits: { daring: 1, people: 2 }, outcomes: [{ text: "Three streets later the child points: \"Mummy!\" Tears all round.", rep: 3 }] },
  ],
};
