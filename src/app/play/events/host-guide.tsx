"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { HOST_SHARE, PARTY_SIZES } from "@/lib/world/events";
import { Sheet } from "../sheet";

// How to host a party, step by step (docs/EVENTS.md, "How to host a great party"): setting it up
// (the same steps as the form), then everything the host does inside. Opened from Host an event.

const STEPS: { icon: string; title: string; points: string[] }[] = [
  {
    icon: "🎉",
    title: "Pick your party",
    points: [
      "Open Events with the party button at the top right, then tap Host an event.",
      "Choose Parties, then the kind you want: a street party, an owambe, a concert, a rave, a house party or a drum circle.",
      "The form takes you through it one question at a time. Tap Back whenever you want to change something.",
    ],
  },
  {
    icon: "✍️",
    title: "Name it",
    points: [
      "Pick a name people will want to tap, like \"Ada's 30th Owambe\".",
      "Add a line about what to expect if you like: the dress code, the music or the food.",
    ],
  },
  {
    icon: "📍",
    title: "Choose where",
    points: [
      "Pick a road or a place from the list, or tap Choose on the map.",
      "On the map, move it until the pin sits where you want it. The ring shows how far your party reaches. Then tap Use this spot.",
      "Landmarks, clubs and hotels cost more than a street, and so do pricey areas like Ikoyi and VI.",
    ],
  },
  {
    icon: "🎆",
    title: "Choose how big",
    points: [
      `It can be one spot or a carnival ${PARTY_SIZES[PARTY_SIZES.length - 1].m * 2 / 1000} km across. Every road inside it lights up with bulbs and dancing crowds.`,
      "Bigger parties hold more people (up to 10,000) and cost more to host.",
      "Big parties, and any party for 1,000 or more, make the Lagos news.",
    ],
  },
  {
    icon: "🎟️",
    title: "Time and tickets",
    points: [
      "Start now, later today or any time in the next week. It can run from 30 minutes to 4 hours.",
      `Make it free or sell tickets. Once it's over, you keep about ${Math.round(HOST_SHARE * 100)}% of each ticket; the rest is VAT and income tax.`,
      "You pay the hosting fee when it goes on the map. If fewer than 10 people come, you get all of it back.",
    ],
  },
  {
    icon: "🎵",
    title: "Add your music",
    points: [
      "The form asks for your songs before the party goes on the map, so the music is ready when you walk in.",
      "To add a song, open YouTube and find it. Tap Share, then Copy link. Come back, paste it and tap Add.",
      "Add up to 20 songs and they play one after another. Inside, tap Play in DJ & music and everyone hears it at the same moment.",
      "No songs? Pick a ready-made beat inside instead, like Afrobeats or Amapiano. It keeps playing even when people switch to another app.",
    ],
  },
  {
    icon: "🔥",
    title: "Get the party going",
    points: [
      "Watch the hype meter. Reactions, dancing, toasts and spraying fill it up, and when it's full the party is LIT.",
      "Use the hot seat to ask everyone a question, then love the best answers.",
      "Raise a toast, send shout-outs, and pair people up with Meet someone.",
      "Guests can spray you real money, and it rains on everyone's screen.",
    ],
  },
  {
    icon: "📣",
    title: "Who hears about it",
    points: [
      "As soon as you host, your friends are told, and so are the people nearest to you: twice as many as your party holds, or everyone within 4 km if that's more.",
      "Tap Invite friends on your event to share the link on WhatsApp, X or anywhere else.",
      "If it starts later, people can tap I'm going and they'll be told when it starts.",
    ],
  },
  {
    icon: "👋",
    title: "Leaving and ending",
    points: [
      "The arrow at the top takes you back to the map. You're still in the party, and a Back to button brings you straight back.",
      "Tap Leave to go out. You can come back in any time while it's on.",
      "When you're done, tap End. Ticket money is paid to you then. If you call it off before it starts, everyone gets their money back.",
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
