"use client";

import { useState } from "react";

// Badges players earn in a round, drawn as shiny medals, and a share card they can post.

export type BadgeGroup = "Hiding" | "Seeking" | "Drones" | "Milestones" | "Social" | "Rare";
export type BadgeRim = "gold" | "silver" | "bronze";
export type BadgeInfo = { title: string; blurb: string; icon: string; from: string; to: string; rim: BadgeRim; group: BadgeGroup };

/** The order the groups are shown in. */
export const BADGE_GROUPS: BadgeGroup[] = ["Hiding", "Seeking", "Drones", "Milestones", "Social", "Rare"];

const def = (group: BadgeGroup, rim: BadgeRim, icon: string, title: string, blurb: string, from: string, to: string): BadgeInfo => ({
  title,
  blurb,
  icon,
  from,
  to,
  rim,
  group,
});

// All 50 badges. The keys match the database (game-db/008_badge_collection.sql). Gold = hardest.
export const BADGE_INFO: Record<string, BadgeInfo> = {
  // Hiding
  survivor: def("Hiding", "silver", "🛡️", "Survivor", "Stay hidden till the very end.", "#34d399", "#047857"),
  ghost: def("Hiding", "gold", "👻", "Ghost", "Survive without moving once. Nerves of steel.", "#a5b4fc", "#4338ca"),
  escape_artist: def("Hiding", "silver", "🏃", "Escape Artist", "Move 3+ times and still get away.", "#fda4af", "#be123c"),
  last_standing: def("Hiding", "gold", "👑", "Last One Standing", "Be the only hider nobody could find.", "#fde68a", "#b45309"),
  crowd_dodger: def("Hiding", "silver", "🫥", "Crowd Dodger", "Survive a round with 5+ seekers hunting.", "#99f6e4", "#0e7490"),
  against_odds: def("Hiding", "gold", "🍀", "Against the Odds", "Survive when 3 out of 4 hiders got found.", "#bef264", "#3f6212"),
  shield_saved: def("Hiding", "bronze", "🔰", "Saved by the Shield", "Have your shield block a find.", "#bae6fd", "#0369a1"),
  hot_streak: def("Hiding", "gold", "🔥", "Hot Streak", "Stay hidden 3 hiding rounds in a row.", "#fdba74", "#c2410c"),
  last_second: def("Hiding", "silver", "⏱️", "Last-Second Dash", "Move in the final minute and get away.", "#fcd34d", "#9a3412"),
  // Seeking
  bot_hunter: def("Seeking", "silver", "🤖", "Bot Hunter", "Track down the bot.", "#93c5fd", "#1d4ed8"),
  hat_trick: def("Seeking", "gold", "🎯", "Hat-trick", "Catch 3 or more hiders in one round.", "#fca5a5", "#b91c1c"),
  first_blood: def("Seeking", "bronze", "⚡", "First Catch", "Make the first catch of the round.", "#fcd34d", "#c2410c"),
  sharpshooter: def("Seeking", "gold", "🔍", "Sharpshooter", "Find someone with your very first search.", "#5eead4", "#0f766e"),
  double_trouble: def("Seeking", "gold", "✌️", "Double Trouble", "Find 2 hiders with one search.", "#f0abfc", "#a21caf"),
  freebie_find: def("Seeking", "bronze", "🎁", "Freebie Find", "Find someone with your free search.", "#fecdd3", "#e11d48"),
  the_closer: def("Seeking", "silver", "🚪", "The Closer", "Find the last hider and end the round.", "#cbd5e1", "#334155"),
  comeback_kid: def("Seeking", "silver", "💪", "Comeback Kid", "Miss 5 searches, then find someone.", "#fdba74", "#9a3412"),
  quick_draw: def("Seeking", "silver", "🤠", "Quick Draw", "Find someone in the first minute of seeking.", "#fde68a", "#a16207"),
  clean_sweep: def("Seeking", "gold", "🧹", "Clean Sweep", "Find every hider in a round yourself.", "#c7d2fe", "#3730a3"),
  // Drones
  trapper: def("Drones", "bronze", "📡", "Trapper", "Catch someone sneaking into your drone trap.", "#c4b5fd", "#6d28d9"),
  trap_master: def("Drones", "gold", "🕸️", "Trap Master", "Have your traps go off 3 times in one round.", "#ddd6fe", "#5b21b6"),
  drone_pilot: def("Drones", "bronze", "🚁", "Drone Pilot", "Fly 5 drone sweeps in one round.", "#a5f3fc", "#0e7490"),
  drone_ace: def("Drones", "gold", "🛸", "Drone Ace", "Spot someone with 3 sweeps in one round.", "#86efac", "#15803d"),
  drone_combo: def("Drones", "silver", "🎮", "Combo!", "Spot someone with a drone, then find them.", "#f9a8d4", "#be185d"),
  close_shave: def("Drones", "silver", "😅", "Close Shave", "Get swept by a drone and still get away.", "#fef08a", "#ca8a04"),
  drone_dodger: def("Drones", "gold", "🦊", "Drone Dodger", "Walk into a drone trap and still get away.", "#fed7aa", "#c2410c"),
  // Milestones (won once)
  rounds_5: def("Milestones", "bronze", "🎟️", "Regular", "Play 5 rounds.", "#e9d5ff", "#7e22ce"),
  rounds_25: def("Milestones", "silver", "🏙️", "City Veteran", "Play 25 rounds.", "#c4b5fd", "#4c1d95"),
  rounds_100: def("Milestones", "gold", "🏆", "Legend", "Play 100 rounds.", "#fde047", "#854d0e"),
  catches_10: def("Milestones", "bronze", "🐾", "Tracker", "Find 10 hiders in total.", "#fecaca", "#991b1b"),
  catches_50: def("Milestones", "gold", "🐕", "Bloodhound", "Find 50 hiders in total.", "#fca5a5", "#7f1d1d"),
  survive_5: def("Milestones", "bronze", "🙈", "Hard to Find", "Survive 5 rounds in total.", "#a7f3d0", "#065f46"),
  survive_25: def("Milestones", "gold", "🫧", "Invisible", "Survive 25 rounds in total.", "#e0f2fe", "#0c4a6e"),
  coins_1k: def("Milestones", "silver", "🪙", "Coin Collector", "Win 1,000 coins in total.", "#fef3c7", "#b45309"),
  coins_10k: def("Milestones", "gold", "💎", "Tycoon", "Win 10,000 coins in total.", "#a5f3fc", "#155e75"),
  streak_3: def("Milestones", "bronze", "📅", "Three in a Row", "Play on 3 days in a row.", "#bfdbfe", "#1e40af"),
  streak_7: def("Milestones", "gold", "🗓️", "Week Warrior", "Play every day for a week.", "#93c5fd", "#1e3a8a"),
  bot_buster: def("Milestones", "silver", "🦾", "Bot Buster", "Find the bot 5 times.", "#bfdbfe", "#1e3a8a"),
  shield_master: def("Milestones", "gold", "🏰", "Shield Master", "Get saved by your shield 3 times.", "#7dd3fc", "#075985"),
  // Social
  chatterbox: def("Social", "bronze", "💬", "Chatterbox", "Send 10 chat messages in one round.", "#fbcfe8", "#be185d"),
  on_air: def("Social", "bronze", "🎙️", "On Air", "Send a voice note.", "#fda4af", "#9f1239"),
  whisper: def("Social", "bronze", "🤫", "Secret Whisper", "Send someone a private message.", "#e9d5ff", "#6b21a8"),
  party_time: def("Social", "silver", "🎉", "Party Time", "Play in a round with 20+ players.", "#f5d0fe", "#86198f"),
  // Rare
  welcome: def("Rare", "bronze", "🗝️", "Welcome to the City", "Play your very first round.", "#fde68a", "#92400e"),
  big_win: def("Rare", "gold", "💰", "Big Win", "Win 300+ coins in one round.", "#fde047", "#a16207"),
  high_roller: def("Rare", "gold", "🎰", "High Roller", "Play a round with a 1,000+ coin pool.", "#fcd34d", "#7c2d12"),
  night_owl: def("Rare", "silver", "🦉", "Night Owl", "Play a round that ends between midnight and 5am (UTC).", "#818cf8", "#1e1b4b"),
  early_bird: def("Rare", "bronze", "🐦", "Early Bird", "Play a round that ends between 5 and 8am (UTC).", "#fef9c3", "#d97706"),
  weekend_warrior: def("Rare", "bronze", "🛹", "Weekend Warrior", "Play a round on a Saturday or Sunday.", "#99f6e4", "#115e59"),
  balloon_popper: def("Rare", "silver", "🎈", "Balloon Popper", "Pop 10 coin balloons.", "#fecaca", "#dc2626"),
};

const RIMS = {
  gold: ["#fff3b0", "#f5c542", "#b8860b"],
  silver: ["#ffffff", "#d0d5dd", "#8a94a6"],
  bronze: ["#ffd9b3", "#d08a4f", "#8a4b1f"],
};

// A four-pointed sparkle centred on (x, y).
const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r} Z`;

export function BadgeMedal({ badge, size = 72, dim }: { badge: string; size?: number; dim?: boolean }) {
  const b = BADGE_INFO[badge] ?? BADGE_INFO.survivor;
  const rim = RIMS[b.rim];
  const id = `bdg-${badge}`;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={dim ? "opacity-30 grayscale" : undefined} aria-label={b.title}>
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
      </defs>
      {/* Ribbon tails behind the medal */}
      <path d="M38 80 L28 117 L38 111 L45 119 L54 86 Z" fill={b.to} />
      <path d="M82 80 L92 117 L82 111 L75 119 L66 86 Z" fill={b.to} />
      <path d="M38 80 L28 117 L38 111 L41 101 Z" fill="#000" opacity="0.18" />
      <path d="M82 80 L92 117 L82 111 L79 101 Z" fill="#000" opacity="0.18" />
      <g transform="translate(6 1) scale(0.9)">
        <path d="M60 6 L106 32 L106 86 L60 112 L14 86 L14 32 Z" fill={`url(#${id}-rim)`} />
        <path d="M60 15 L98 37 L98 81 L60 103 L22 81 L22 37 Z" fill={`url(#${id}-in)`} />
        <path d="M60 15 L98 37 L98 58 Q60 46 22 58 L22 37 Z" fill={`url(#${id}-shine)`} />
        <text x="60" y="72" textAnchor="middle" fontSize="40">
          {b.icon}
        </text>
        {[0, 1, 2].map((k) => (
          <circle key={k} cx={44 + k * 16} cy="94" r="2.2" fill="#ffffff" opacity="0.8" />
        ))}
      </g>
      {b.rim === "gold" && (
        <g fill="#fff8d6">
          <path d={star(14, 16, 8)} />
          <path d={star(106, 26, 6)} opacity="0.9" />
          <path d={star(104, 6, 3.5)} opacity="0.75" />
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
  // Light rays behind the medal
  c.save();
  c.translate(cx, cy);
  for (let k = 0; k < 16; k++) {
    c.rotate(Math.PI / 8);
    c.fillStyle = `rgba(255,255,255,${k % 2 ? 0.05 : 0.09})`;
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
  const rim = RIMS[b.rim];
  const rg = c.createLinearGradient(cx - 230, cy - 230, cx + 230, cy + 230);
  rg.addColorStop(0, rim[0]);
  rg.addColorStop(0.5, rim[1]);
  rg.addColorStop(1, rim[2]);
  c.fillStyle = rg;
  hex(235);
  c.fill();
  const ig = c.createRadialGradient(cx - 60, cy - 90, 20, cx, cy, 240);
  ig.addColorStop(0, b.from);
  ig.addColorStop(1, b.to);
  c.fillStyle = ig;
  hex(198);
  c.fill();
  c.font = "180px system-ui, Apple Color Emoji, Segoe UI Emoji, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(b.icon, cx, cy + 10);
  // Sparkles for gold badges
  if (b.rim === "gold") {
    c.fillStyle = "#fff8d6";
    for (const [x, y, r] of [
      [300, 230, 46],
      [790, 290, 34],
      [770, 190, 20],
      [280, 610, 22],
    ]) {
      c.fill(new Path2D(star(x, y, r)));
    }
  }
  // Rarity and group
  c.font = "800 34px system-ui, sans-serif";
  c.fillStyle = RIMS[b.rim][1];
  c.fillText(`${b.rim.toUpperCase()} BADGE · ${b.group.toUpperCase()}`, 540, 92);
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

/** A badge with its name, tappable to share. */
export function BadgeTile({
  badge,
  player,
  city,
  detail,
  size = 64,
}: {
  badge: string;
  player: string;
  city?: string;
  detail?: string | null;
  size?: number;
}) {
  const [state, setState] = useState<string | null>(null);
  const b = BADGE_INFO[badge] ?? BADGE_INFO.survivor;
  return (
    <button
      onClick={async () => setState(await shareBadge(badge, player, city))}
      className="flex flex-col items-center gap-1 rounded-2xl p-2 text-center transition hover:bg-panel-2"
      title={detail ?? b.blurb}
    >
      <BadgeMedal badge={badge} size={size} />
      <span className="text-xs font-semibold leading-tight">{b.title}</span>
      <span className="text-[10px] text-muted">{state === "saved" ? "Saved" : state === "shared" ? "Shared!" : "Tap to share"}</span>
    </button>
  );
}
