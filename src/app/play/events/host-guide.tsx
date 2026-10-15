"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { HOST_SHARE, PARTY_SIZES } from "@/lib/world/events";
import { Sheet } from "../sheet";

// How to host a party, step by step (docs/EVENTS.md, "How to host a great party"): setting it up,
// then everything the host does inside, music first. Opened from Host an event.

const STEPS: { icon: string; title: string; points: string[] }[] = [
  {
    icon: "🎉",
    title: "Pick your party",
    points: [
      "Open Events (the party button, top right), then Host an event.",
      "Pick Parties, then the kind: Street party, Owambe, Concert, Rave, House party or Drum circle.",
      "Give it a name people will want to tap (\"Ada's 30th Owambe\"), and say what to expect: the dress code, the music, the food.",
    ],
  },
  {
    icon: "📍",
    title: "Choose where",
    points: [
      "Pick a road or a place from the list, or tap Choose on the map.",
      "On the map: move it until the pin is where you want it. The ring shows how far your party reaches. Tap Use this spot.",
      "Landmarks, clubs and hotels cost more than a street; pricey areas (Ikoyi, VI) cost more too.",
    ],
  },
  {
    icon: "🎆",
    title: "Choose how big",
    points: [
      `From one spot to a mega carnival ${PARTY_SIZES[PARTY_SIZES.length - 1].m * 2 / 1000} km across. Every road inside it lights up with bulbs and dancing crowds on the map.`,
      "Bigger parties can take more people (up to 10,000) and cost more to host.",
      "From the area size up, or with 1,000+ people, your party is announced in the Lagos news.",
    ],
  },
  {
    icon: "🎟️",
    title: "When, tickets and how many",
    points: [
      "Start now, later today, or any time in the next week; 30 minutes to 4 hours.",
      `Free, or sell tickets: once it's over you keep about ${Math.round(HOST_SHARE * 100)}% (VAT and income tax go to the state).`,
      "You pay the hosting fee when it goes on the map. If fewer than 10 people come, it all comes back.",
    ],
  },
  {
    icon: "🎵",
    title: "Add music (the DJ booth)",
    points: [
      "Inside your party, tap DJ & music (only the host sees it).",
      "Get a song: open YouTube, find the song, tap Share, then Copy link.",
      "Come back, paste the link and tap Play. Everyone at the party hears it at the same moment.",
      "Paste more links to queue them (up to 20): they play one after another. Next skips, Stop stops.",
      "No links? Pick a beat (Afrobeats, Amapiano...): it's made on everyone's phone.",
    ],
  },
  {
    icon: "🔥",
    title: "Get the party going",
    points: [
      "Watch the hype meter: reactions, dancing, toasts and spraying fill it. Full, the party is LIT.",
      "Hot seat: ask everyone a question (yours, or a random one) and love the best answers.",
      "Raise a toast, send shout-outs, and pair people up with Meet someone.",
      "Guests can spray you real money; it rains on everyone's screen.",
    ],
  },
  {
    icon: "📣",
    title: "Bring people in",
    points: [
      "The moment you host, your friends are told, and so are the people nearest you: twice as many as your party holds (100 people? the closest 200 hear), or everyone within 4 km if that's more. Nobody misses out.",
      "Tap Invite friends on your event to share its link (WhatsApp, X, anywhere).",
      "Starting later? People can say I'm going and they're told when it starts.",
    ],
  },
  {
    icon: "👋",
    title: "Leaving and ending",
    points: [
      "The arrow at the top takes you back to the map: you stay in, with a Back to button.",
      "Leave takes you out (anyone can come back while it's on).",
      "End it when you're done: ticket money is paid to you. Call it off before it starts and everyone gets their money back.",
    ],
  },
];

export function HostGuide({ onClose }: { onClose: () => void }) {
  const [k, setK] = useState(0);
  const s = STEPS[k];
  const last = k === STEPS.length - 1;
  return (
    <Sheet onClose={onClose} title="How to host a great party">
      <div className="flex gap-1" aria-hidden>
        {STEPS.map((_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= k ? "bg-[#d6336c]" : "bg-ink/10")} />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#d6336c] to-[#7048e8] text-2xl">{s.icon}</span>
        <div>
          <p className="text-xs font-semibold text-muted">
            Step {k + 1} of {STEPS.length}
          </p>
          <p className="font-display text-lg font-extrabold leading-tight">{s.title}</p>
        </div>
      </div>
      <ol className="mt-3 space-y-2">
        {s.points.map((p, i) => (
          <li key={i} className="flex gap-2.5 rounded-2xl bg-ink/5 px-3 py-2.5 text-sm">
            <b className="grid size-5 shrink-0 place-items-center rounded-full bg-ink text-[11px] text-white">{i + 1}</b>
            <span>{p}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={() => (k ? setK(k - 1) : onClose())} className="h-11 rounded-full bg-ink/5 text-sm font-semibold">
          {k ? "Back" : "Close"}
        </button>
        <button onClick={() => (last ? onClose() : setK(k + 1))} className="h-11 rounded-full bg-gradient-to-r from-[#d6336c] to-[#7048e8] text-sm font-bold text-white">
          {last ? "Let's host" : "Next"}
        </button>
      </div>
    </Sheet>
  );
}
