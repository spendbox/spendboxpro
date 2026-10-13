"use client";

import { Heart, House, MessageCircle, Music, Phone, Plane, Swords, Users } from "lucide-react";

// Signed out, under what Newtown is: what you can do here, at a glance (small cards, an icon each).

const FEATURES = [
  { icon: Users, label: "Meet people", colour: "#e64980" },
  { icon: MessageCircle, label: "Chat", colour: "#1c7ed6" },
  { icon: Phone, label: "Voice calls", colour: "#12a37a" },
  { icon: Swords, label: "Fight & win", colour: "#e03131" },
  { icon: Heart, label: "Form bonds", colour: "#2f9e44" },
  { icon: House, label: "Own a home", colour: "#f08c00" },
  { icon: Plane, label: "Travel", colour: "#7048e8" },
  { icon: Music, label: "Party", colour: "#d6336c" },
] as const;

export function WelcomeFeatures() {
  return (
    <ul className="mt-3 grid w-[min(22rem,calc(100vw-2rem))] grid-cols-4 gap-1.5 sm:w-[26rem] sm:gap-2" aria-label="What you can do in Newtown">
      {FEATURES.map((f) => (
        <li key={f.label} className="flex flex-col items-center gap-1 rounded-2xl bg-white/90 px-1 py-2 shadow-md backdrop-blur-sm">
          <span className="grid size-8 place-items-center rounded-xl text-white" style={{ background: f.colour }}>
            <f.icon className="size-4" strokeWidth={2.4} />
          </span>
          <span className="text-center text-[10.5px] font-bold leading-tight text-ink">{f.label}</span>
        </li>
      ))}
      <li className="col-span-4 text-center text-[11px] font-semibold text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">…and a whole world more</li>
    </ul>
  );
}
