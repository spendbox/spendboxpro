"use client";

import { useState } from "react";

// Badges players earn in a round, drawn as shiny medals, and a share card they can post.

export const BADGE_INFO: Record<string, { title: string; blurb: string; icon: string; from: string; to: string; rim: "gold" | "silver" | "bronze" }> = {
  survivor: { title: "Survivor", blurb: "Stayed hidden till the very end.", icon: "🛡️", from: "#34d399", to: "#047857", rim: "silver" },
  ghost: { title: "Ghost", blurb: "Survived without moving once. Nerves of steel.", icon: "👻", from: "#a5b4fc", to: "#4338ca", rim: "gold" },
  escape_artist: { title: "Escape Artist", blurb: "Kept moving and still got away.", icon: "🏃", from: "#fda4af", to: "#be123c", rim: "silver" },
  last_standing: { title: "Last One Standing", blurb: "The only hider nobody could find.", icon: "👑", from: "#fde68a", to: "#b45309", rim: "gold" },
  bot_hunter: { title: "Bot Hunter", blurb: "Tracked down the bot.", icon: "🤖", from: "#93c5fd", to: "#1d4ed8", rim: "silver" },
  hat_trick: { title: "Hat-trick", blurb: "Caught three or more hiders in one round.", icon: "🎯", from: "#fca5a5", to: "#b91c1c", rim: "gold" },
  first_blood: { title: "First Catch", blurb: "Made the first catch of the round.", icon: "⚡", from: "#fcd34d", to: "#c2410c", rim: "bronze" },
  sharpshooter: { title: "Sharpshooter", blurb: "Found someone with the very first search.", icon: "🔍", from: "#5eead4", to: "#0f766e", rim: "gold" },
  trapper: { title: "Trapper", blurb: "A drone trap caught someone sneaking in.", icon: "📡", from: "#c4b5fd", to: "#6d28d9", rim: "bronze" },
  big_win: { title: "Big Win", blurb: "Won 300+ coins in one round.", icon: "💰", from: "#fde047", to: "#a16207", rim: "gold" },
};

const RIMS = {
  gold: ["#fff3b0", "#f5c542", "#b8860b"],
  silver: ["#ffffff", "#d0d5dd", "#8a94a6"],
  bronze: ["#ffd9b3", "#d08a4f", "#8a4b1f"],
};

export function BadgeMedal({ badge, size = 72, dim }: { badge: string; size?: number; dim?: boolean }) {
  const b = BADGE_INFO[badge] ?? BADGE_INFO.survivor;
  const rim = RIMS[b.rim];
  const id = `bdg-${badge}`;
  const hex = "M60 6 L106 32 L106 86 L60 112 L14 86 L14 32 Z";
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
      <path d={hex} fill={`url(#${id}-rim)`} />
      <path d="M60 15 L98 37 L98 81 L60 103 L22 81 L22 37 Z" fill={`url(#${id}-in)`} />
      <path d="M60 15 L98 37 L98 58 Q60 46 22 58 L22 37 Z" fill={`url(#${id}-shine)`} />
      <text x="60" y="72" textAnchor="middle" fontSize="40">
        {b.icon}
      </text>
      {[0, 1, 2].map((k) => (
        <circle key={k} cx={44 + k * 16} cy="94" r="2.2" fill="#ffffff" opacity="0.8" />
      ))}
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
  // Light rays behind the medal
  c.save();
  c.translate(540, 470);
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
  // Medal
  const hex = (r: number) => {
    c.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 3;
      c[k ? "lineTo" : "moveTo"](540 + Math.cos(a) * r, 470 + Math.sin(a) * r);
    }
    c.closePath();
  };
  const rim = RIMS[b.rim];
  const rg = c.createLinearGradient(330, 260, 750, 680);
  rg.addColorStop(0, rim[0]);
  rg.addColorStop(0.5, rim[1]);
  rg.addColorStop(1, rim[2]);
  c.fillStyle = rg;
  hex(250);
  c.fill();
  const ig = c.createRadialGradient(480, 380, 20, 540, 470, 260);
  ig.addColorStop(0, b.from);
  ig.addColorStop(1, b.to);
  c.fillStyle = ig;
  hex(212);
  c.fill();
  c.font = "190px system-ui, Apple Color Emoji, Segoe UI Emoji, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(b.icon, 540, 480);
  // Words
  c.fillStyle = "#ffffff";
  c.font = "800 84px system-ui, sans-serif";
  c.fillText(b.title, 540, 800);
  c.font = "500 38px system-ui, sans-serif";
  c.fillStyle = "rgba(255,255,255,0.85)";
  c.fillText(b.blurb, 540, 868);
  c.font = "700 40px system-ui, sans-serif";
  c.fillStyle = "#ffc53d";
  c.fillText(`${player}${city ? ` · ${city}` : ""}`, 540, 945);
  c.font = "600 32px system-ui, sans-serif";
  c.fillStyle = "rgba(255,255,255,0.7)";
  c.fillText("Hide & Seek", 540, 1010);

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
export function BadgeTile({ badge, player, city, detail }: { badge: string; player: string; city?: string; detail?: string | null }) {
  const [state, setState] = useState<string | null>(null);
  const b = BADGE_INFO[badge] ?? BADGE_INFO.survivor;
  return (
    <button
      onClick={async () => setState(await shareBadge(badge, player, city))}
      className="flex flex-col items-center gap-1 rounded-2xl p-2 text-center transition hover:bg-panel-2"
      title={detail ?? b.blurb}
    >
      <BadgeMedal badge={badge} size={64} />
      <span className="text-xs font-semibold leading-tight">{b.title}</span>
      <span className="text-[10px] text-muted">{state === "saved" ? "Saved" : state === "shared" ? "Shared!" : "Tap to share"}</span>
    </button>
  );
}
