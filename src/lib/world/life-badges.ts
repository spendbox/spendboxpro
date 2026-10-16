// Life badges, as people see them (docs/LIFE_WHEEL.md, phase 4): the name, the local name where a
// city has its own word for it, and what it's for. How each is earned is in ./standing.ts; this is
// kept apart so a player's card can show badges without loading every moment.

export type BadgeKind = "character" | "mixed" | "story" | "people" | "career" | "fate";

export type BadgeInfo = {
  id: string;
  emoji: string;
  /** Its name everywhere. */
  name: string;
  /** Its name in a city that has its own word for it. */
  local?: Record<string, string>;
  kind: BadgeKind;
  /** What it's for, shown once you have it. */
  about: string;
  /** Character and mixed badges fade if you stop being that way; the rest are yours for good. */
  fades: boolean;
};

export const BADGE_INFO: BadgeInfo[] = [
  { id: "open_hand", emoji: "🤲🏾", name: "Open Hand", kind: "character", fades: true, about: "Generous, again and again, even when it cost you." },
  { id: "money_wise", emoji: "🏦", name: "Money Wise", local: { lagos: "Owo Mi" }, kind: "character", fades: true, about: "Prudent: you don't let money slip away." },
  { id: "lion_heart", emoji: "🦁", name: "Lion Heart", kind: "character", fades: true, about: "Bold when others step back." },
  { id: "wise_owl", emoji: "🦉", name: "Wise Owl", kind: "character", fades: true, about: "Careful: you think before you jump." },
  { id: "person_of_honour", emoji: "🕊️", name: "Person of Honour", local: { lagos: "Omoluabi" }, kind: "character", fades: true, about: "Honest when it cost you." },
  { id: "street_scholar", emoji: "🧠", name: "Street Scholar", kind: "character", fades: true, about: "Street-smart: you always find a way." },
  { id: "pillar", emoji: "🏘️", name: "Pillar of the Street", kind: "character", fades: true, about: "Community first." },
  { id: "self_made", emoji: "🧗🏾", name: "Self-Made", kind: "character", fades: true, about: "You build your own way." },
  { id: "big_heart", emoji: "💛", name: "Big Heart", kind: "character", fades: true, about: "You give second chances." },
  { id: "the_judge", emoji: "⚖️", name: "The Judge", kind: "character", fades: true, about: "People answer to you for what they do." },
  { id: "custodian", emoji: "🥁", name: "Custodian", kind: "character", fades: true, about: "Keeper of the old ways." },
  { id: "trailblazer", emoji: "🚀", name: "Trailblazer", kind: "character", fades: true, about: "New ideas, new ways." },
  { id: "robin_hood", emoji: "🏹", name: "Robin Hood", kind: "mixed", fades: true, about: "Generous and street-smart." },
  { id: "the_elder", emoji: "🧓🏾", name: "The Elder", local: { lagos: "Baba / Mama Agba" }, kind: "mixed", fades: true, about: "Careful, community-minded and traditional." },
  { id: "hustler", emoji: "💼", name: "Hustler", kind: "mixed", fades: true, about: "Bold, street-smart and self-made." },
  { id: "peacemaker", emoji: "☮️", name: "Peacemaker", kind: "mixed", fades: true, about: "Forgiving and community-minded." },
  { id: "father_christmas", emoji: "🎅🏾", name: "Father Christmas", kind: "mixed", fades: true, about: "Generous and bold: you spray money." },
  { id: "vault", emoji: "🗝️", name: "Vault", kind: "mixed", fades: true, about: "Prudent and careful: nobody gets your money." },
  { id: "mamas_favourite", emoji: "🍊", name: "Mama's Favourite", kind: "story", fades: false, about: "Mama Nkechi would do anything for you." },
  { id: "bellos_nightmare", emoji: "🚨", name: "Bello's Nightmare", kind: "story", fades: false, about: "You stood up to Officer Bello, and kept standing." },
  { id: "street_whisperer", emoji: "🧢", name: "Street Whisperer", local: { lagos: "Agbero Whisperer" }, kind: "story", fades: false, about: "The street's tough guys respect you." },
  { id: "kunles_partner", emoji: "🚐", name: "On the Bus", kind: "story", fades: false, about: "There's a danfo in Lagos with your name on it." },
  { id: "kept_my_word", emoji: "🤝🏾", name: "Kept My Word", kind: "story", fades: false, about: "People trust you completely." },
  { id: "prodigal", emoji: "🏠", name: "Prodigal", kind: "story", fades: false, about: "You went far, and came home." },
  { id: "wahala_magnet", emoji: "🌪️", name: "Wahala Magnet", kind: "story", fades: false, about: "Wherever there's drama, there you are." },
  { id: "good_neighbour", emoji: "🚪", name: "Good Neighbour", kind: "people", fades: false, about: "Your neighbour would trust you with her keys, and her cat." },
  { id: "family_pillar", emoji: "🌳", name: "Family Pillar", kind: "people", fades: false, about: "The family turns to you first." },
  { id: "well_known", emoji: "📣", name: "Talk of the Town", kind: "people", fades: false, about: "Half the city knows your name." },
  { id: "main_character", emoji: "🎬", name: "Main Character", kind: "people", fades: false, about: "You're in other people's stories, again and again." },
  { id: "ride_or_die", emoji: "🛡️", name: "Ride or Die", kind: "people", fades: false, about: "When it mattered, you stood by your people." },
  { id: "founder", emoji: "🌱", name: "Founder", kind: "career", fades: false, about: "You started something of your own." },
  { id: "first_profit", emoji: "💵", name: "First Profit", kind: "career", fades: false, about: "Your business paid you." },
  { id: "the_boss", emoji: "👥", name: "The Boss", kind: "career", fades: false, about: "Ten people work for you." },
  { id: "brand_name", emoji: "🏷️", name: "Brand Name", kind: "career", fades: false, about: "Your business is known across the city." },
  { id: "mogul", emoji: "🏙️", name: "Mogul", kind: "career", fades: false, about: "You built an empire." },
  { id: "comeback_kid", emoji: "🔁", name: "Comeback Kid", kind: "career", fades: false, about: "Your business failed, and you started again." },
  { id: "touched_by_fate", emoji: "✨", name: "Touched by Fate", kind: "fate", fades: false, about: "Something happened to you that happens to almost nobody." },
];

export const LIFE_BADGE_BY_ID = new Map(BADGE_INFO.map((b) => [b.id, b]));

/** A badge's name where you are: the local one when the city has one. */
export const badgeName = (b: BadgeInfo, region: string) => b.local?.[region] ?? b.name;
