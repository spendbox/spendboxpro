// The city's surprises: 100 rare world events. The database schedules them (at least one an
// hour, see game-db/017_world_events.sql, which mirrors the keys, lengths, rewards and twists
// below); the 3D city draws them, and the news feed announces them. Keep the two in sync with
// `node scripts/world-events-sql.mjs` (prints the SQL rows from this list).
//
// - needs: where it happens (the city picks the nearest fitting spot to the scheduled tile).
// - minutes: how long it lasts.
// - reward: coins for the first `slots` players who tap it while it's on.
// - twist: changes the rules of the hunt while it lasts (the database enforces those).
// - radius: for twists that cover an area (in tiles around the spot).
// - news: the headline; {place} becomes the address or landmark.

export type EventCategory = "emergency" | "weather" | "party" | "transport" | "city" | "mystery" | "twist";

export type EventNeed =
  | "any"
  | "hospital"
  | "tower"
  | "office"
  | "market"
  | "stadium"
  | "water"
  | "river"
  | "park"
  | "plaza"
  | "station"
  | "airport"
  | "port"
  | "campus"
  | "museum"
  | "hotel"
  | "mall"
  | "construction"
  | "power"
  | "outskirts"
  | "road"
  | "bridge"
  | "police"
  | "oilrig"
  | "house"
  | "sky";

export type WorldEventKind = {
  n: number;
  key: string;
  title: string;
  news: string;
  category: EventCategory;
  needs: EventNeed;
  minutes: number;
  reward?: { coins: number; slots: number };
  twist?: true;
  radius?: number;
};

const E = (
  n: number,
  key: string,
  title: string,
  news: string,
  category: EventCategory,
  needs: EventNeed,
  minutes: number,
  extra: Partial<WorldEventKind> = {},
): WorldEventKind => ({ n, key, title, news, category, needs, minutes, ...extra });

export const WORLD_EVENTS: WorldEventKind[] = [
  // ---------------------------------------------------------------- the first twenty
  E(1, "hospital_emergency", "Hospital emergency", "Ambulances are racing to {place}!", "emergency", "hospital", 4),
  E(2, "robbery", "Attempted robbery", "Police are chasing a getaway car near {place}!", "emergency", "road", 4),
  E(3, "power_outage", "Power outage", "The lights just went out around {place}.", "city", "any", 5),
  E(4, "building_fire", "Building fire", "Fire! Fire engines are rushing to {place}.", "emergency", "office", 5),
  E(5, "street_party", "Street party", "A street party has broken out at {place}!", "party", "plaza", 6),
  E(6, "fireworks", "Fireworks", "Fireworks are lighting up the sky over {place}!", "party", "stadium", 4),
  E(7, "flash_flood", "Flash flood", "Flash flood! Water is rising on the roads near {place}.", "weather", "road", 5),
  E(8, "water_main", "Burst water main", "A water main just burst at {place}. What a fountain!", "city", "road", 4),
  E(9, "runaway_cows", "Runaway cows", "A herd of cows is wandering through traffic at {place}.", "mystery", "road", 4),
  E(10, "zoo_escape", "Zoo escape", "An animal has escaped! Keepers are chasing it near {place}.", "mystery", "park", 4),
  E(11, "film_shoot", "Film shoot", "Lights, camera, action! A film is being shot at {place}.", "city", "plaza", 6),
  E(12, "ufo", "UFO sighting", "A glowing saucer is hovering over {place}!", "mystery", "sky", 3),
  E(13, "circus_parade", "Circus parade", "The circus is parading down {place}!", "party", "road", 5),
  E(14, "marathon", "City marathon", "Runners are streaming down {place}.", "party", "road", 6),
  E(15, "train_breakdown", "Train breakdown", "A train has broken down near {place}. Rescue engine on the way.", "transport", "station", 5),
  E(16, "rig_flare", "Oil rig flare-up", "A huge flame is roaring on the oil rig near {place}!", "emergency", "oilrig", 4),
  E(17, "lightning_strike", "Lightning strike", "Lightning just struck {place}!", "weather", "tower", 2),
  E(18, "bird_swarm", "Giant bird flock", "Thousands of birds are swirling over {place}.", "mystery", "sky", 3),
  E(19, "money_spill", "Money truck spill", "A money truck spilled cash at {place}! Tap fast!", "city", "road", 3, { reward: { coins: 20, slots: 10 } }),
  E(20, "celebrity_visit", "Celebrity visit", "A celebrity motorcade has arrived at {place}!", "party", "hotel", 5),

  // ---------------------------------------------------------------- emergencies and crime
  E(21, "bank_alarm", "Bank alarm", "Alarms are ringing at the bank on {place}. Police are surrounding it.", "emergency", "office", 4),
  E(22, "car_chase", "Car chase", "A high-speed chase is tearing through {place}!", "emergency", "road", 3),
  E(23, "jewel_heist", "Jewellery heist", "Thieves are abseiling down {place}!", "emergency", "tower", 4),
  E(24, "gas_leak", "Gas leak", "Gas leak! The street at {place} is being evacuated.", "emergency", "road", 4),
  E(25, "scaffold_collapse", "Scaffolding collapse", "Scaffolding just came down at {place}. Nobody hurt!", "emergency", "construction", 4),
  E(26, "cat_rescue", "Cat up a tree", "Firefighters are rescuing a cat from a tree at {place}.", "city", "park", 3),
  E(27, "stuck_lift", "Stuck lift", "A lift is stuck in {place}. Engineers are on their way.", "city", "tower", 4),
  E(28, "bridge_inspection", "Bridge closed", "{place} is closed for an inspection.", "transport", "bridge", 5),
  E(29, "tyre_pileup", "Burst tyre", "A burst tyre caused a pile-up at {place}.", "transport", "road", 4),
  E(30, "rooftop_helicopter", "Rooftop helicopter", "A hospital helicopter is landing on {place}.", "emergency", "tower", 3),
  E(31, "prison_van", "Prison van breakdown", "A prison van broke down at {place}. The guards look nervous.", "emergency", "road", 4),
  E(32, "pickpocket_chase", "Pickpocket chase", "Stop, thief! A pickpocket is running through {place}.", "emergency", "market", 3),

  // ---------------------------------------------------------------- weather and nature
  E(33, "rainbow", "Rainbow", "A rainbow has appeared over {place}.", "weather", "river", 4),
  E(34, "hailstorm", "Hailstorm", "Hailstorm! People are running for cover at {place}.", "weather", "any", 3),
  E(35, "harmattan", "Harmattan haze", "A harmattan haze is turning the city golden.", "weather", "any", 6),
  E(36, "power_plant_lightning", "Power plant strike", "Lightning hit the power station near {place}!", "weather", "power", 3),
  E(37, "eclipse", "Solar eclipse", "Solar eclipse! The city is going dark for a minute.", "weather", "sky", 3),
  E(38, "shooting_stars", "Shooting stars", "Shooting stars are streaking across the sky. Make a wish!", "weather", "sky", 4),
  E(39, "sea_fog", "Sea fog", "A thick fog is rolling in from the water near {place}.", "weather", "water", 5),
  E(40, "heatwave", "Heatwave", "Heatwave! Ice-cream queues and sprinklers at {place}.", "weather", "park", 5),
  E(41, "tornado", "Tornado", "A tornado is spinning on the outskirts near {place}!", "weather", "outskirts", 3),
  E(42, "butterflies", "Butterfly swarm", "A swarm of butterflies is drifting through {place}.", "mystery", "park", 4),
  E(43, "whale_sighting", "Whale sighting", "A whale has been spotted off {place}!", "mystery", "water", 4),
  E(44, "market_monkeys", "Market monkeys", "Monkeys are raiding the fruit stalls at {place}!", "mystery", "market", 4),

  // ---------------------------------------------------------------- celebrations and culture
  E(45, "wedding_convoy", "Wedding convoy", "A wedding convoy is honking its way down {place}!", "party", "road", 4),
  E(46, "carnival", "Carnival", "Carnival dancers are filling {place}!", "party", "road", 6),
  E(47, "masquerade", "Masquerade festival", "Masquerades are parading through {place}!", "party", "road", 5),
  E(48, "owambe", "Owambe party", "An owambe party is spilling into the street at {place}!", "party", "plaza", 6),
  E(49, "stadium_concert", "Stadium concert", "A concert is rocking {place}!", "party", "stadium", 6),
  E(50, "new_year", "Countdown party", "The whole city is counting down at {place}!", "party", "plaza", 4),
  E(51, "rooftop_fashion", "Rooftop fashion show", "A fashion show is strutting on the roof of {place}.", "party", "tower", 5),
  E(52, "street_football", "Street football", "A street football match is blocking {place}!", "party", "road", 5),
  E(53, "graduation", "Graduation day", "Caps in the air! Graduation day at {place}.", "party", "campus", 5),
  E(54, "food_festival", "Food festival", "The food festival at {place} smells amazing.", "party", "plaza", 6),
  E(55, "drumming_circle", "Drumming circle", "Drummers have gathered at {place}.", "party", "plaza", 5),
  E(56, "tower_light_show", "Light show", "{place} is putting on a light show!", "party", "tower", 4),

  // ---------------------------------------------------------------- transport
  E(57, "air_show", "Air show", "Jets are flying in formation over {place}!", "transport", "sky", 3),
  E(58, "balloon_race", "Balloon race", "The hot-air balloon race has started over {place}!", "transport", "sky", 5),
  E(59, "cruise_ship", "Cruise ship", "A huge cruise ship is docking at {place}.", "transport", "port", 6),
  E(60, "stuck_cargo_ship", "Stuck cargo ship", "A cargo ship is stuck in the harbour near {place}.", "transport", "port", 6),
  E(61, "free_bus", "Free bus rides", "Free bus rides for the next few minutes!", "transport", "road", 5),
  E(62, "emergency_landing", "Emergency landing", "A plane is making an emergency landing at {place}!", "transport", "airport", 4),
  E(63, "train_delay", "Train delay", "Trains are delayed. A crowd is building at {place}.", "transport", "station", 5),
  E(64, "bike_race", "Bike race", "A bike race is zooming through {place}!", "transport", "road", 4),
  E(65, "taxi_strike", "Taxi strike", "Taxi strike! The roads around {place} are empty.", "transport", "road", 5),
  E(66, "royal_motorcade", "Royal motorcade", "A royal motorcade is passing {place}.", "transport", "road", 4),

  // ---------------------------------------------------------------- city life
  E(67, "market_day", "Market day", "It's market day at {place}. Extra stalls, extra crowds!", "city", "market", 6),
  E(68, "black_friday", "Big sale", "Huge sale! Queues are wrapping around {place}.", "city", "mall", 6),
  E(69, "water_tanker", "Water tanker", "A water tanker queue is forming at {place}.", "city", "house", 4),
  E(70, "ribbon_cutting", "Ribbon cutting", "A brand-new building is opening at {place}!", "city", "construction", 3),
  E(71, "demolition", "Demolition", "Stand back! An old building is coming down at {place}.", "city", "construction", 3),
  E(72, "street_mural", "Street art", "A mural just appeared overnight at {place}.", "city", "plaza", 6),
  E(73, "blackout_party", "Candlelight party", "A candlelight party is glowing at {place}.", "party", "house", 5),
  E(74, "lost_dog", "Lost dog", "A dog is lost near {place}! Find it for a reward.", "city", "park", 5, { reward: { coins: 15, slots: 5 } }),
  E(75, "lottery_winner", "Lottery winner", "Someone just won the lottery and is dancing at {place}!", "city", "plaza", 3),
  E(76, "flash_mob", "Flash mob", "A flash mob is dancing at {place}!", "party", "plaza", 3),

  // ---------------------------------------------------------------- mystery and fun
  E(77, "museum_ghost", "Museum ghost", "Visitors say they saw a ghost at {place}. A real one!", "mystery", "museum", 4),
  E(78, "haunted_house", "Haunted house", "The lights at {place} keep flickering. Haunted?", "mystery", "house", 5),
  E(79, "treasure_chest", "Treasure chest", "A treasure chest washed up near {place}! First to tap wins.", "mystery", "water", 4, { reward: { coins: 50, slots: 1 } }),
  E(80, "crop_circle", "Crop circle", "A mysterious crop circle appeared at {place}.", "mystery", "park", 6),
  E(81, "giant_duck", "Giant duck", "A giant inflatable duck is floating near {place}!", "mystery", "water", 6),
  E(82, "dino_balloon", "Dinosaur balloon", "A giant dinosaur balloon is marching down {place}!", "party", "road", 5),
  E(83, "time_capsule", "Time capsule", "Builders dug up a time capsule at {place}!", "mystery", "construction", 4, { reward: { coins: 10, slots: 5 } }),
  E(84, "meteor", "Meteor", "A meteor just landed on the outskirts near {place}!", "mystery", "outskirts", 4),
  E(85, "pirate_ship", "Pirate ship", "Arr! A pirate ship is sailing into {place}!", "mystery", "water", 5),
  E(86, "vanishing_act", "Vanishing act", "A magician just made {place} vanish!", "mystery", "tower", 2),
  E(87, "rooftop_proposal", "Rooftop proposal", "Someone just proposed on the roof of {place}! She said yes!", "party", "tower", 3),

  // ---------------------------------------------------------------- twists: the rules change for a while
  E(88, "fog_of_war", "Fog of war", "Fog of war! Hunters can't see recent searches for 2 minutes.", "twist", "any", 2, { twist: true }),
  E(89, "double_coins", "Double mint", "Double mint! Every catch pays twice for the next few minutes.", "twist", "any", 5, { twist: true }),
  E(90, "ghost_amnesty", "Ghost amnesty", "Ghost amnesty! Every ghost gets one free extra move.", "twist", "any", 4, { twist: true }),
  E(91, "drone_storm", "Drone storm", "Drone storm! Sweeps cost half for 3 minutes.", "twist", "any", 3, { twist: true }),
  E(92, "lucky_street", "Lucky street", "Lucky street! Searches around {place} are free for a while.", "twist", "road", 3, { twist: true, radius: 1 }),
  E(93, "bot_tantrum", "Bot tantrum", "The bot is throwing a tantrum and has moved somewhere new!", "twist", "any", 1, { twist: true }),
  E(94, "spotlight", "Spotlight", "Spotlight on {place}! Every move there lights up.", "twist", "any", 3, { twist: true, radius: 2 }),
  E(95, "golden_balloon", "Golden balloon", "A golden balloon worth 50 mint is floating over {place}!", "twist", "sky", 3, { twist: true, reward: { coins: 50, slots: 1 } }),
  E(96, "quiet_hour", "Quiet spell", "Shhh… a quiet spell. No news for 5 minutes.", "twist", "any", 5, { twist: true }),
  E(97, "bounty_board", "Bounty board", "Bounty! Whoever catches {name} gets 100 extra mint.", "twist", "any", 6, { twist: true }),
  E(98, "safe_house", "Safe house", "{place} is a safe house: nobody can be found there for 3 minutes.", "twist", "any", 3, { twist: true, radius: 1 }),
  E(99, "blackout_district", "Blackout district", "Blackout! Nobody can search around {place} for 2 minutes.", "twist", "any", 2, { twist: true, radius: 2 }),
  E(100, "final_countdown", "Final countdown", "Final countdown! The world ends in 5 minutes.", "twist", "any", 5, { twist: true }),
];

export const WORLD_EVENT_BY_KEY: Record<string, WorldEventKind> = Object.fromEntries(WORLD_EVENTS.map((e) => [e.key, e]));

/** A scheduled event as the game state carries it. */
export type WorldEvent = {
  id: number;
  key: string;
  /** Scheduled spot (the city moves it to the nearest place that fits). */
  tile: number;
  startsAt: string;
  endsAt: string;
  /** For bounty boards: who has the price on their head. */
  name?: string | null;
  /** Coins still up for grabs, and whether you already took yours. */
  slotsLeft?: number;
  claimed?: boolean;
};
