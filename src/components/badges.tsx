"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Sheet } from "@/app/play/sheet";

// Badges players earn in a round, drawn as shiny medals, a pop-up that explains each one,
// and a share card they can post.

export type BadgeGroup = "Hiding" | "Hunting" | "Drones" | "Powers" | "Levels" | "Milestones" | "Social" | "Rare" | "Legendary";
/** How hard a badge is, from bronze (easiest) to legendary (the hardest in the game). */
export type BadgeRim = "bronze" | "silver" | "gold" | "diamond" | "legendary";
export type BadgeInfo = { title: string; blurb: string; icon: string; from: string; to: string; rim: BadgeRim; group: BadgeGroup };

/** The order the groups are shown in. */
export const BADGE_GROUPS: BadgeGroup[] = ["Hiding", "Hunting", "Drones", "Powers", "Levels", "Milestones", "Social", "Rare", "Legendary"];

const def = (group: BadgeGroup, rim: BadgeRim, icon: string, title: string, blurb: string, from: string, to: string): BadgeInfo => ({
  title,
  blurb,
  icon,
  from,
  to,
  rim,
  group,
});

// All 100 badges. The keys match the database (game-db/008_badge_collection.sql and
// game-db/011_badges_hard.sql). Bronze is the easiest, then silver, gold, diamond, and legendary.
export const BADGE_INFO: Record<string, BadgeInfo> = {
  // Hiding
  survivor: def("Hiding", "silver", "🛡️", "Survivor", "Stay hidden till the very end.", "#34d399", "#047857"),
  ghost: def("Hiding", "gold", "👻", "Ghost", "Survive without moving once. Nerves of steel.", "#a5b4fc", "#4338ca"),
  escape_artist: def("Hiding", "silver", "🏃", "Escape Artist", "Move 3+ times and still get away.", "#fda4af", "#be123c"),
  last_standing: def("Hiding", "gold", "👑", "Last One Standing", "Be the only hider nobody could find.", "#fde68a", "#b45309"),
  crowd_dodger: def("Hiding", "silver", "🫥", "Crowd Dodger", "Survive a round with 5+ hunters on the prowl.", "#99f6e4", "#0e7490"),
  against_odds: def("Hiding", "gold", "🍀", "Against the Odds", "Survive when 3 out of 4 hiders got found.", "#bef264", "#3f6212"),
  shield_saved: def("Hiding", "bronze", "🔰", "Saved by the Shield", "Have your shield block a find.", "#bae6fd", "#0369a1"),
  hot_streak: def("Hiding", "gold", "🔥", "Hot Streak", "Stay hidden 3 hiding rounds in a row.", "#fdba74", "#c2410c"),
  last_second: def("Hiding", "silver", "⏱️", "Last-Second Dash", "Move in the final minute and get away.", "#fcd34d", "#9a3412"),
  untouchable: def("Hiding", "diamond", "🌀", "Untouchable", "Stay hidden 5 hiding rounds in a row (and again every 5 after that).", "#c4b5fd", "#5b21b6"),
  radar_proof: def("Hiding", "gold", "📵", "Radar Proof", "Get swept by drones 3+ times in one round and still get away.", "#a7f3d0", "#047857"),
  slippery: def("Hiding", "gold", "🐍", "Slippery Customer", "Walk into a drone trap AND get swept in the same round, and still get away.", "#d9f99d", "#4d7c0f"),
  needle_haystack: def("Hiding", "diamond", "🪡", "Needle in a Haystack", "Survive a round with 50+ hunters on the prowl.", "#fef3c7", "#92400e"),
  plain_sight: def("Hiding", "gold", "🕶️", "Hidden in Plain Sight", "Survive a round where 3 out of every 4 spots in the city got searched.", "#e2e8f0", "#1e293b"),
  statue: def("Hiding", "diamond", "🗿", "Statue", "Survive a round with 20+ hunters without moving once and without a shield.", "#e7e5e4", "#44403c"),
  last_legend: def("Hiding", "diamond", "👤", "Last Legend", "Be the only one of 10+ hiders left standing at the end.", "#fde68a", "#9a3412"),
  // Hunting
  bot_hunter: def("Hunting", "silver", "🤖", "Bot Hunter", "Track down the bot.", "#93c5fd", "#1d4ed8"),
  hat_trick: def("Hunting", "gold", "🎯", "Hat-trick", "Catch 3 or more hiders in one round.", "#fca5a5", "#b91c1c"),
  first_blood: def("Hunting", "bronze", "⚡", "First Catch", "Make the first catch of the round.", "#fcd34d", "#c2410c"),
  sharpshooter: def("Hunting", "gold", "🔍", "Sharpshooter", "Find someone with your very first search.", "#5eead4", "#0f766e"),
  double_trouble: def("Hunting", "gold", "✌️", "Double Trouble", "Find 2 hiders with one search.", "#f0abfc", "#a21caf"),
  freebie_find: def("Hunting", "bronze", "🎁", "Freebie Find", "Find someone with your free search.", "#fecdd3", "#e11d48"),
  the_closer: def("Hunting", "silver", "🚪", "The Closer", "Find the last hider and end the round.", "#cbd5e1", "#334155"),
  comeback_kid: def("Hunting", "silver", "💪", "Comeback Kid", "Miss 5 searches, then find someone.", "#fdba74", "#9a3412"),
  quick_draw: def("Hunting", "silver", "🤠", "Quick Draw", "Find someone in the first minute of the hunt.", "#fde68a", "#a16207"),
  clean_sweep: def("Hunting", "gold", "🧹", "Clean Sweep", "Find every hider in a round yourself.", "#c7d2fe", "#3730a3"),
  hunting_party: def("Hunting", "diamond", "🏹", "Hunting Party", "Catch 5 or more hiders in one round.", "#fecaca", "#991b1b"),
  bot_nemesis: def("Hunting", "diamond", "👾", "Bot Nemesis", "Be the one who finds the bot 3 rounds in a row.", "#a5b4fc", "#312e81"),
  buzzer_beater: def("Hunting", "gold", "🚨", "Buzzer Beater", "Catch someone in the last 60 seconds of the round.", "#fed7aa", "#c2410c"),
  giant_slayer: def("Hunting", "gold", "🗡️", "Giant Slayer", "Catch a player who is level 10 or higher.", "#cbd5e1", "#475569"),
  titan_slayer: def("Hunting", "diamond", "⚔️", "Titan Slayer", "Catch a player who is level 25 or higher.", "#fca5a5", "#7f1d1d"),
  perfect_aim: def("Hunting", "diamond", "💯", "Perfect Aim", "Make 3+ searches in a round and find someone with every single one.", "#fecdd3", "#9f1239"),
  bounty_hunter: def("Hunting", "gold", "🤑", "Bounty Hunter", "Earn 1,000 coins in level bonuses by catching high-level players.", "#fde047", "#713f12"),
  // Drones
  trapper: def("Drones", "bronze", "📡", "Trapper", "Catch someone sneaking into your drone trap.", "#c4b5fd", "#6d28d9"),
  trap_master: def("Drones", "gold", "🕸️", "Trap Master", "Have your traps go off 3 times in one round.", "#ddd6fe", "#5b21b6"),
  drone_pilot: def("Drones", "bronze", "🚁", "Drone Pilot", "Fly 5 drone sweeps in one round.", "#a5f3fc", "#0e7490"),
  drone_ace: def("Drones", "gold", "🛸", "Drone Ace", "Spot someone with 3 sweeps in one round.", "#86efac", "#15803d"),
  drone_combo: def("Drones", "silver", "🎮", "Combo!", "Spot someone with a drone, then find them.", "#f9a8d4", "#be185d"),
  close_shave: def("Drones", "silver", "😅", "Close Shave", "Get swept by a drone and still get away.", "#fef08a", "#ca8a04"),
  drone_dodger: def("Drones", "gold", "🦊", "Drone Dodger", "Walk into a drone trap and still get away.", "#fed7aa", "#c2410c"),
  eye_in_sky: def("Drones", "gold", "👁️", "Eye in the Sky", "Spot someone with 5 sweeps in one round.", "#bae6fd", "#0c4a6e"),
  spider_web: def("Drones", "diamond", "🕷️", "Spider's Web", "Have your drone traps go off 5 times in one round.", "#e9d5ff", "#3b0764"),
  // Powers (decoys, shields, respawns, big searches)
  gotcha: def("Powers", "silver", "🎭", "Gotcha!", "Place a decoy that fools a hunter.", "#fbcfe8", "#9d174d"),
  master_disguise: def("Powers", "gold", "🥸", "Master of Disguise", "Your decoy fools 2+ different hunters in one round (searched or swept).", "#f5d0fe", "#701a75"),
  smoke_mirrors: def("Powers", "gold", "🪞", "Smoke & Mirrors", "Your decoy fools a hunter AND you survive the round.", "#ddd6fe", "#4c1d95"),
  turtle: def("Powers", "gold", "🐢", "Turtle", "Your shield saves you, you never move, and you survive.", "#bbf7d0", "#166534"),
  phoenix: def("Powers", "diamond", "🦅", "Phoenix", "Get caught, pay to respawn, then survive the round.", "#fdba74", "#9a3412"),
  wide_net: def("Powers", "gold", "🥅", "Wide Net", "Catch 2+ hiders with one big search.", "#99f6e4", "#134e4a"),
  illusionist: def("Powers", "diamond", "🎩", "Illusionist", "Fool hunters with your decoys 10 times in total.", "#c7d2fe", "#1e1b4b"),
  // Levels (won once)
  level_5: def("Levels", "silver", "⭐", "Level 5", "Reach level 5. Shields unlocked!", "#fef08a", "#a16207"),
  level_10: def("Levels", "gold", "🌟", "Level 10", "Reach level 10. Big searches unlocked!", "#fde68a", "#b45309"),
  level_20: def("Levels", "diamond", "💫", "Level 20", "Reach level 20. Respawns unlocked!", "#bfdbfe", "#1e3a8a"),
  level_30: def("Levels", "diamond", "🚀", "Level 30", "Reach level 30.", "#fbcfe8", "#831843"),
  // Milestones (won once)
  rounds_5: def("Milestones", "bronze", "🎟️", "Regular", "Play 5 rounds.", "#e9d5ff", "#7e22ce"),
  rounds_25: def("Milestones", "silver", "🏙️", "City Veteran", "Play 25 rounds.", "#c4b5fd", "#4c1d95"),
  rounds_50: def("Milestones", "silver", "🎫", "Half Century", "Play 50 rounds.", "#fde68a", "#854d0e"),
  rounds_100: def("Milestones", "gold", "🏆", "Legend", "Play 100 rounds.", "#fde047", "#854d0e"),
  rounds_250: def("Milestones", "diamond", "🌆", "City Icon", "Play 250 rounds.", "#fbcfe8", "#701a75"),
  catches_10: def("Milestones", "bronze", "🐾", "Tracker", "Find 10 hiders in total.", "#fecaca", "#991b1b"),
  catches_50: def("Milestones", "gold", "🐕", "Bloodhound", "Find 50 hiders in total.", "#fca5a5", "#7f1d1d"),
  catches_100: def("Milestones", "diamond", "🐺", "Apex Hunter", "Find 100 hiders in total.", "#cbd5e1", "#1e293b"),
  survive_5: def("Milestones", "bronze", "🙈", "Hard to Find", "Survive 5 rounds in total.", "#a7f3d0", "#065f46"),
  survive_25: def("Milestones", "gold", "🫧", "Invisible", "Survive 25 rounds in total.", "#e0f2fe", "#0c4a6e"),
  survive_50: def("Milestones", "gold", "🦎", "Chameleon", "Survive 50 rounds in total.", "#bbf7d0", "#14532d"),
  survive_100: def("Milestones", "diamond", "🌫️", "Vanishing Act", "Survive 100 rounds in total.", "#e2e8f0", "#334155"),
  coins_1k: def("Milestones", "silver", "🪙", "Coin Collector", "Win 1,000 coins in total.", "#fef3c7", "#b45309"),
  coins_5k: def("Milestones", "silver", "💵", "Money Maker", "Win 5,000 coins in total.", "#bbf7d0", "#166534"),
  coins_10k: def("Milestones", "gold", "💎", "Tycoon", "Win 10,000 coins in total.", "#a5f3fc", "#155e75"),
  coins_25k: def("Milestones", "diamond", "🏦", "Mogul", "Win 25,000 coins in total.", "#fde68a", "#78350f"),
  streak_3: def("Milestones", "bronze", "📅", "Three in a Row", "Play on 3 days in a row.", "#bfdbfe", "#1e40af"),
  streak_7: def("Milestones", "gold", "🗓️", "Week Warrior", "Play every day for a week.", "#93c5fd", "#1e3a8a"),
  streak_14: def("Milestones", "diamond", "📆", "Fortnight Fanatic", "Play every day for 14 days in a row.", "#c7d2fe", "#312e81"),
  bot_buster: def("Milestones", "silver", "🦾", "Bot Buster", "Find the bot 5 times.", "#bfdbfe", "#1e3a8a"),
  bot_terminator: def("Milestones", "diamond", "⚙️", "Bot Terminator", "Find the bot 25 times.", "#cbd5e1", "#0f172a"),
  shield_master: def("Milestones", "gold", "🏰", "Shield Master", "Get saved by your shield 3 times.", "#7dd3fc", "#075985"),
  // Social
  chatterbox: def("Social", "bronze", "💬", "Chatterbox", "Send 10 chat messages in one round.", "#fbcfe8", "#be185d"),
  on_air: def("Social", "bronze", "🎙️", "On Air", "Send a voice note.", "#fda4af", "#9f1239"),
  whisper: def("Social", "bronze", "🤫", "Secret Whisper", "Send someone a private message.", "#e9d5ff", "#6b21a8"),
  party_time: def("Social", "silver", "🎉", "Party Time", "Play in a round with 20+ players.", "#f5d0fe", "#86198f"),
  festival: def("Social", "gold", "🎪", "Festival", "Play in a round with 100+ players.", "#fecaca", "#9f1239"),
  // Rare
  welcome: def("Rare", "bronze", "🗝️", "Welcome to the City", "Play your very first round.", "#fde68a", "#92400e"),
  big_win: def("Rare", "gold", "💰", "Big Win", "Win 300+ coins in one round.", "#fde047", "#a16207"),
  jackpot: def("Rare", "diamond", "💸", "Jackpot", "Win 1,000+ coins in one round.", "#bbf7d0", "#14532d"),
  high_roller: def("Rare", "gold", "🎰", "High Roller", "Play a round with a 1,000+ coin pool.", "#fcd34d", "#7c2d12"),
  whale: def("Rare", "diamond", "🐋", "Whale", "Play a round with a 10,000+ coin pool.", "#bae6fd", "#1e3a8a"),
  weekly_champ: def("Rare", "diamond", "🥇", "Champion of the Week", "Be top of the weekly leaderboard (with 5+ winners that week) when a round ends.", "#fde68a", "#a16207"),
  night_owl: def("Rare", "silver", "🦉", "Night Owl", "Play a round that ends between midnight and 5am (UTC).", "#818cf8", "#1e1b4b"),
  early_bird: def("Rare", "bronze", "🐦", "Early Bird", "Play a round that ends between 5 and 8am (UTC).", "#fef9c3", "#d97706"),
  weekend_warrior: def("Rare", "bronze", "🛹", "Weekend Warrior", "Play a round on a Saturday or Sunday.", "#99f6e4", "#115e59"),
  balloon_popper: def("Rare", "silver", "🎈", "Balloon Popper", "Pop 10 coin balloons.", "#fecaca", "#dc2626"),
  // Legendary: the hardest badges in the game
  phantom: def("Legendary", "legendary", "🌌", "Phantom", "Stay hidden 10 hiding rounds in a row.", "#a78bfa", "#1e1b4b"),
  unstoppable: def("Legendary", "legendary", "☄️", "Unstoppable", "Catch 10 or more hiders in one round.", "#fb923c", "#7f1d1d"),
  exterminator: def("Legendary", "legendary", "🌪️", "Exterminator", "Find every single hider yourself in a round with 5+ hiders.", "#5eead4", "#134e4a"),
  immortal: def("Legendary", "legendary", "♾️", "Immortal", "Respawn and then survive, 5 times in total.", "#f9a8d4", "#500724"),
  level_50: def("Legendary", "legendary", "🔱", "Level 50", "Reach level 50. Catching you is worth a fortune.", "#fde047", "#713f12"),
  coins_100k: def("Legendary", "legendary", "💠", "Coin Royalty", "Win 100,000 coins in total.", "#67e8f9", "#164e63"),
  rounds_500: def("Legendary", "legendary", "🏛️", "Living Legend", "Play 500 rounds.", "#fcd34d", "#451a03"),
  streak_30: def("Legendary", "legendary", "🌙", "Month of Madness", "Play every day for 30 days in a row.", "#818cf8", "#0f172a"),
  catches_500: def("Legendary", "legendary", "🦁", "King of the Hunt", "Find 500 hiders in total.", "#fdba74", "#7c2d12"),
  collector_80: def("Legendary", "legendary", "🧿", "Hall of Fame", "Collect 80 different badges.", "#93c5fd", "#172554"),
};

/** Badges you can only win once (the rest can be won again in any round). */
const ONCE = new Set([
  "rounds_5", "rounds_25", "rounds_50", "rounds_100", "rounds_250", "rounds_500",
  "catches_10", "catches_50", "catches_100", "catches_500", "survive_5", "survive_25", "survive_50", "survive_100",
  "coins_1k", "coins_5k", "coins_10k", "coins_25k", "coins_100k", "streak_3", "streak_7", "streak_14", "streak_30",
  "bot_buster", "bot_terminator", "shield_master", "welcome", "balloon_popper", "bounty_hunter", "illusionist", "immortal",
  "level_5", "level_10", "level_20", "level_30", "level_50", "collector_80",
]);

const RIMS: Record<BadgeRim, string[]> = {
  bronze: ["#ffd9b3", "#d08a4f", "#8a4b1f"],
  silver: ["#ffffff", "#d0d5dd", "#8a94a6"],
  gold: ["#fff3b0", "#f5c542", "#b8860b"],
  diamond: ["#ffffff", "#9be7ff", "#3a7bd5"],
  legendary: ["#ffe27a", "#ff6ad5", "#7b5cff"],
};

/** What each rim means, for the pop-up and the share card. */
export const RARITY: Record<BadgeRim, { label: string; note: string; color: string }> = {
  bronze: { label: "Bronze", note: "Common: a nice start", color: "#b0662f" },
  silver: { label: "Silver", note: "Uncommon: takes a bit of skill", color: "#6b7686" },
  gold: { label: "Gold", note: "Rare: properly tricky", color: "#b8860b" },
  diamond: { label: "Diamond", note: "Epic: very few players get this", color: "#2f78c9" },
  legendary: { label: "Legendary", note: "The hardest in the game. Only the best ever see one", color: "#9b3fd6" },
};

const shiny = (rim: BadgeRim) => rim === "diamond" || rim === "legendary";

// A four-pointed sparkle centred on (x, y).
const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r} Z`;

// The moving shine on diamond and legendary medals. Pure CSS, so it's cheap, and it stays
// still for people who've asked their phone for less motion.
const SHINE_CSS = `
@keyframes bdg-sweep { 0%, 55% { transform: translateX(-70px) } 100% { transform: translateX(150px) } }
@keyframes bdg-twinkle { 0%, 100% { opacity: .25 } 50% { opacity: 1 } }
.bdg-sweep { animation: bdg-sweep 3.4s ease-in-out infinite }
.bdg-twinkle { animation: bdg-twinkle 1.8s ease-in-out infinite }
@media (prefers-reduced-motion: reduce) { .bdg-sweep, .bdg-twinkle { animation: none } .bdg-sweep { opacity: 0 } }
`;

export function BadgeMedal({ badge, size = 72, dim }: { badge: string; size?: number; dim?: boolean }) {
  const b = BADGE_INFO[badge] ?? BADGE_INFO.survivor;
  const rim = RIMS[b.rim];
  const id = `bdg-${badge}`;
  const special = shiny(b.rim) && !dim;
  const hexOuter = "M60 6 L106 32 L106 86 L60 112 L14 86 L14 32 Z";
  const hexInner = "M60 15 L98 37 L98 81 L60 103 L22 81 L22 37 Z";
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={dim ? "opacity-30 grayscale" : undefined} aria-label={b.title}>
      {special && <style>{SHINE_CSS}</style>}
      <defs>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={rim[0]} />
          <stop offset="0.5" stopColor={rim[1]} />
          <stop offset="1" stopColor={rim[2]} />
        </linearGradient>
        <radialGradient id={`${id}-in`} cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor={b.from} />
          <stop offset="1" stopColor={b.to} />
        </radialGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {special && (
          <>
            <radialGradient id={`${id}-glow`}>
              <stop offset="0.55" stopColor={rim[1]} stopOpacity="0.7" />
              <stop offset="1" stopColor={rim[1]} stopOpacity="0" />
            </radialGradient>
            <clipPath id={`${id}-clip`}>
              <path d={hexOuter} />
            </clipPath>
          </>
        )}
      </defs>
      {/* A soft glow behind legendary medals */}
      {special && b.rim === "legendary" && <circle cx="60" cy="54" r="60" fill={`url(#${id}-glow)`} />}
      {/* Ribbon tails behind the medal */}
      <path d="M38 80 L28 117 L38 111 L45 119 L54 86 Z" fill={b.to} />
      <path d="M82 80 L92 117 L82 111 L75 119 L66 86 Z" fill={b.to} />
      <path d="M38 80 L28 117 L38 111 L41 101 Z" fill="#000" opacity="0.18" />
      <path d="M82 80 L92 117 L82 111 L79 101 Z" fill="#000" opacity="0.18" />
      <g transform="translate(6 1) scale(0.9)">
        <path d={hexOuter} fill={`url(#${id}-rim)`} />
        {/* Diamond and legendary rims get a cut-gem edge */}
        {shiny(b.rim) && <path d={hexInner} fill="none" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="2.5" transform="translate(-4.5 -4.6) scale(1.075)" />}
        <path d={hexInner} fill={`url(#${id}-in)`} />
        <path d="M60 15 L98 37 L98 58 Q60 46 22 58 L22 37 Z" fill={`url(#${id}-shine)`} />
        <text x="60" y="72" textAnchor="middle" fontSize="40">
          {b.icon}
        </text>
        {[0, 1, 2].map((k) => (
          <circle key={k} cx={44 + k * 16} cy="94" r="2.2" fill="#ffffff" opacity="0.8" />
        ))}
        {special && (
          <g clipPath={`url(#${id}-clip)`}>
            <path className="bdg-sweep" d="M10 -10 L30 -10 L4 130 L-16 130 Z" fill="#ffffff" opacity="0.45" transform="translate(-70 0)" />
          </g>
        )}
      </g>
      {(b.rim === "gold" || shiny(b.rim)) && (
        <g fill={b.rim === "gold" ? "#fff8d6" : "#ffffff"}>
          <path d={star(14, 16, 8)} className={special ? "bdg-twinkle" : undefined} />
          <path d={star(106, 26, 6)} opacity="0.9" />
          <path d={star(104, 6, 3.5)} opacity="0.75" className={special ? "bdg-twinkle" : undefined} style={special ? { animationDelay: "0.9s" } : undefined} />
          {b.rim === "legendary" && <path d={star(10, 62, 5)} className={special ? "bdg-twinkle" : undefined} style={special ? { animationDelay: "0.4s" } : undefined} />}
        </g>
      )}
    </svg>
  );
}

/** Draws a square share card for a badge (badge, player, city) and shares or saves it. */
export async function shareBadge(badge: string, player: string, city?: string) {
  const b = BADGE_INFO[badge] ?? BADGE_INFO.survivor;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1080;
  const c = canvas.getContext("2d")!;
  const bg = c.createLinearGradient(0, 0, 1080, 1080);
  bg.addColorStop(0, "#18202b");
  bg.addColorStop(1, b.to);
  c.fillStyle = bg;
  c.fillRect(0, 0, 1080, 1080);
  const cx = 540;
  const cy = 440;
  const rim = RIMS[b.rim];
  // A coloured glow behind diamond and legendary medals
  if (shiny(b.rim)) {
    const glow = c.createRadialGradient(cx, cy, 120, cx, cy, 470);
    glow.addColorStop(0, `${rim[1]}cc`);
    glow.addColorStop(1, `${rim[1]}00`);
    c.fillStyle = glow;
    c.fillRect(0, 0, 1080, 1080);
  }
  // Light rays behind the medal
  c.save();
  c.translate(cx, cy);
  const rays = b.rim === "legendary" ? 24 : 16;
  for (let k = 0; k < rays; k++) {
    c.rotate((Math.PI * 2) / rays);
    c.fillStyle = `rgba(255,255,255,${k % 2 ? 0.05 : shiny(b.rim) ? 0.13 : 0.09})`;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(-60, -620);
    c.lineTo(60, -620);
    c.fill();
  }
  c.restore();
  // Ribbon tails
  const tail = (dir: 1 | -1) => {
    c.fillStyle = b.to;
    c.beginPath();
    c.moveTo(cx - dir * 120, cy + 120);
    c.lineTo(cx - dir * 190, cy + 330);
    c.lineTo(cx - dir * 120, cy + 290);
    c.lineTo(cx - dir * 75, cy + 345);
    c.lineTo(cx - dir * 20, cy + 160);
    c.closePath();
    c.fill();
    c.fillStyle = "rgba(0,0,0,0.2)";
    c.beginPath();
    c.moveTo(cx - dir * 120, cy + 120);
    c.lineTo(cx - dir * 190, cy + 330);
    c.lineTo(cx - dir * 120, cy + 290);
    c.closePath();
    c.fill();
  };
  tail(1);
  tail(-1);
  // Medal
  const hex = (r: number) => {
    c.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 3;
      c[k ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    c.closePath();
  };
  const rg = c.createLinearGradient(cx - 230, cy - 230, cx + 230, cy + 230);
  rg.addColorStop(0, rim[0]);
  rg.addColorStop(0.5, rim[1]);
  rg.addColorStop(1, rim[2]);
  c.fillStyle = rg;
  hex(235);
  c.fill();
  if (shiny(b.rim)) {
    // Cut-gem edge
    c.strokeStyle = "rgba(255,255,255,0.85)";
    c.lineWidth = 8;
    hex(214);
    c.stroke();
  }
  const ig = c.createRadialGradient(cx - 60, cy - 90, 20, cx, cy, 240);
  ig.addColorStop(0, b.from);
  ig.addColorStop(1, b.to);
  c.fillStyle = ig;
  hex(198);
  c.fill();
  if (shiny(b.rim)) {
    // A frozen version of the moving shine
    c.save();
    hex(198);
    c.clip();
    c.fillStyle = "rgba(255,255,255,0.28)";
    c.beginPath();
    c.moveTo(cx - 40, cy - 260);
    c.lineTo(cx + 40, cy - 260);
    c.lineTo(cx - 120, cy + 260);
    c.lineTo(cx - 200, cy + 260);
    c.closePath();
    c.fill();
    c.restore();
  }
  c.font = "180px system-ui, Apple Color Emoji, Segoe UI Emoji, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(b.icon, cx, cy + 10);
  // Sparkles for gold and up
  if (b.rim === "gold" || shiny(b.rim)) {
    c.fillStyle = b.rim === "gold" ? "#fff8d6" : "#ffffff";
    const spots = [
      [300, 230, 46],
      [790, 290, 34],
      [770, 190, 20],
      [280, 610, 22],
    ];
    if (shiny(b.rim)) spots.push([820, 600, 30], [230, 400, 18], [860, 430, 14]);
    for (const [x, y, r] of spots) c.fill(new Path2D(star(x, y, r)));
  }
  // Rarity and group
  c.font = "800 34px system-ui, sans-serif";
  if (b.rim === "legendary") {
    const lg = c.createLinearGradient(240, 0, 840, 0);
    lg.addColorStop(0, rim[0]);
    lg.addColorStop(0.5, rim[1]);
    lg.addColorStop(1, "#a78bfa");
    c.fillStyle = lg;
  } else {
    c.fillStyle = b.rim === "diamond" ? "#bfeaff" : rim[1];
  }
  c.fillText(`${b.rim === "legendary" ? "★ LEGENDARY ★" : `${b.rim.toUpperCase()} BADGE`} · ${b.group.toUpperCase()}`, 540, 92);
  // Words
  c.fillStyle = "#ffffff";
  let size = 84;
  do c.font = `800 ${size}px system-ui, sans-serif`;
  while (c.measureText(b.title).width > 980 && (size -= 4) > 40);
  c.fillText(b.title, 540, 830);
  c.font = "500 38px system-ui, sans-serif";
  c.fillStyle = "rgba(255,255,255,0.85)";
  const words = b.blurb.split(" ");
  const lines = [""];
  for (const w of words) {
    const next = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w;
    if (c.measureText(next).width > 960 && lines[lines.length - 1]) lines.push(w);
    else lines[lines.length - 1] = next;
  }
  lines.slice(0, 2).forEach((line, k) => c.fillText(line, 540, (lines.length > 1 ? 880 : 895) + k * 44));
  c.font = "700 40px system-ui, sans-serif";
  c.fillStyle = "#ffc53d";
  c.fillText(`${player}${city ? ` · ${city}` : ""}`, 540, 975);
  c.font = "600 32px system-ui, sans-serif";
  c.fillStyle = "rgba(255,255,255,0.7)";
  c.fillText("Hide & Seek", 540, 1030);

  const blob: Blob = await new Promise((resolve) => canvas.toBlob((bl) => resolve(bl!), "image/png"));
  const file = new File([blob], `hide-and-seek-${badge}.png`, { type: "image/png" });
  const text = `I just earned the ${b.title} badge in Hide & Seek! Come find me 👀 ${location.origin}`;
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, title: `${b.title} badge` });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share({ text, title: `${b.title} badge`, url: location.origin });
      return "shared";
    }
  } catch {
    return "cancelled";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  return "saved";
}

/** What we know about a badge you've earned (for the pop-up). */
export type EarnedBadge = { count: number; detail?: string | null; at?: string | null; firstAt?: string | null };

const day = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

/**
 * The badge pop-up: the big medal, what it is, how to earn it, how rare it is, and (if you
 * have it) when you got it, how many times, and a Share button. Slides up from the bottom
 * on phones.
 */
export function BadgeSheet({
  badge,
  player,
  city,
  earned,
  onClose,
}: {
  badge: string;
  player: string;
  city?: string;
  /** Leave out (or null) for a badge you haven't got yet. */
  earned?: EarnedBadge | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const b = BADGE_INFO[badge] ?? BADGE_INFO.survivor;
  const rarity = RARITY[b.rim];
  const once = ONCE.has(badge);
  const last = day(earned?.at);
  const first = day(earned?.firstAt);
  const sheet = (
    <Sheet onClose={onClose}>
      <div className="relative">
        <button onClick={onClose} className="absolute -right-2 -top-2 rounded-full px-2 text-2xl text-muted" aria-label="Close">
          ×
        </button>
        <div
          className="-mx-5 -mt-5 flex justify-center rounded-t-3xl pb-2 pt-6"
          style={{ background: `radial-gradient(circle at 50% 60%, ${b.from}55, transparent 70%)` }}
        >
          <BadgeMedal badge={badge} size={150} dim={!earned} />
        </div>
        <div className="text-center">
          <span
            className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
            style={{
              background:
                b.rim === "legendary" ? `linear-gradient(90deg, ${RIMS.legendary.join(", ")})` : rarity.color,
            }}
          >
            {b.rim === "legendary" ? "★ Legendary ★" : `${rarity.label} badge`}
          </span>
          <span className="ml-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{b.group}</span>
          <h2 className="mt-1.5 font-display text-2xl font-extrabold">{b.title}</h2>
        </div>

        <div className="mt-3 space-y-2 text-sm">
          <div className="rounded-xl bg-panel-2 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">How to earn it</p>
            <p className="mt-0.5">{b.blurb}</p>
            <p className="mt-1 text-xs text-muted">{once
                ? "You can win this one once, and it's yours forever."
                : badge === "weekly_champ"
                  ? "You can win this again, at most once a week."
                  : "You can win this again in any round."}</p>
          </div>
          <div className="rounded-xl bg-panel-2 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Rarity</p>
            <p className="mt-0.5">
              <b style={{ color: rarity.color }}>{rarity.label}.</b> {rarity.note}.
            </p>
          </div>
          {earned ? (
            <div className="rounded-xl bg-me/10 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-me">You&apos;ve got it!</p>
              {earned.detail && <p className="mt-0.5">&ldquo;{earned.detail}&rdquo;</p>}
              <p className="mt-0.5 text-xs text-muted">
                {earned.count > 1 ? `Earned ${earned.count} times` : "Earned"}
                {earned.count > 1 && first && last && first !== last ? ` · first on ${first}, last on ${last}` : last ? ` on ${last}` : ""}
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-line px-3 py-2 text-center font-semibold text-muted">🔒 Not earned yet</p>
          )}
        </div>

        {earned && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setState(await shareBadge(badge, player, city));
              setBusy(false);
            }}
            className="mt-4 w-full rounded-xl bg-gold py-3 font-semibold text-ink disabled:opacity-60"
          >
            {busy ? "Making your card…" : state === "saved" ? "Saved! Share it anywhere" : state === "shared" ? "Shared! Share again" : "Share"}
          </button>
        )}
      </div>
    </Sheet>
  );
  // The pop-up is drawn on top of the whole page (the menu and results panels are frosted
  // glass, which would otherwise trap it inside them).
  return typeof document === "undefined" ? null : createPortal(sheet, document.body);
}

/** A badge with its name. Tap it to open the pop-up (explanation, and Share if it's yours). */
export function BadgeTile({
  badge,
  player,
  city,
  detail,
  size = 64,
  count = 1,
  at,
  firstAt,
  locked,
  hint,
}: {
  badge: string;
  player: string;
  city?: string;
  detail?: string | null;
  size?: number;
  /** How many times you've earned it, and when (for the pop-up). */
  count?: number;
  at?: string | null;
  firstAt?: string | null;
  /** Not earned yet: drawn faded. */
  locked?: boolean;
  /** A small line under the name, e.g. "Tap to share". */
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const b = BADGE_INFO[badge] ?? BADGE_INFO.survivor;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex min-w-0 flex-col items-center gap-1 rounded-2xl p-2 text-center transition hover:bg-panel-2"
        title={detail ?? b.blurb}
        aria-label={`${b.title}${locked ? " (not earned yet)" : ""}: ${b.blurb}`}
      >
        <BadgeMedal badge={badge} size={size} dim={locked} />
        <span className={locked ? "text-[10px] leading-tight text-muted" : "text-xs font-semibold leading-tight"}>{b.title}</span>
        {hint && <span className="text-[10px] text-muted">{hint}</span>}
      </button>
      {open && (
        <BadgeSheet
          badge={badge}
          player={player}
          city={city}
          earned={locked ? null : { count, detail, at, firstAt }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
