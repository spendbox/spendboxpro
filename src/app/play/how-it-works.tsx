"use client";

import { CITY_ASSETS } from "@/lib/city/layout";
import { Sheet } from "./sheet";

const SECTIONS: { icon: string; title: string; body: string[] }[] = [
  {
    icon: "🏙️",
    title: "One city, one hour",
    body: [
      "Every round is a brand-new city, named after a real place, with its own streets and landmarks.",
      "First there's a 10-minute window to get ready. Then the hunt runs for an hour, from morning to night (or night to morning).",
    ],
  },
  {
    icon: "🙈",
    title: "Hiding",
    body: [
      "Put down 100 coins and we'll drop you on a random spot when the window closes. Every hider makes the city grow a little.",
      "You can move as often as you like: 100 coins a move, once a minute. You can't go back to a spot you've left, or onto one that's been searched (those show in orange).",
      "When you move, everyone sees that you slipped away, and from where.",
      "Make it to the end and you get your 100 back plus a share of the survivor pool.",
    ],
  },
  {
    icon: "🔍",
    title: "Seeking",
    body: [
      "Tap any spot to search it. Your first search each day is free; after that the price creeps up as more of the city gets searched.",
      "Find a hider and you keep most of their stake. Find the bot and you get 200 coins.",
      "You can search a spot again if you think someone's snuck in. We'll remind you it was searched before.",
      "You only see the most recent searches on the map; older ones fade.",
      "There's a bot hiding every round, with a new name each time. It only moves when a drone sweeps it (three times at most), and it likes to tease the chat.",
    ],
  },
  {
    icon: "📡",
    title: "Drones and traps",
    body: [
      "A sweep sends a drone over an area. It tells you yes or no: is anyone hiding there? Anyone inside is pinned in place for 15 seconds.",
      "Your last 5 sweeps keep watching as traps. If a hider moves into one, you'll get a ping. Nobody else can see your traps.",
      "Sweeps get pricier the more people use them, and your drone needs 10 seconds to recharge.",
    ],
  },
  {
    icon: "🪙",
    title: "Coins",
    body: [
      "Coins are just for playing: they can't be bought or cashed out.",
      "Searches, sweeps and moves all feed the survivor pool. At the end, survivors share 60% of it, seekers share 20% (by how much they spent), and 20% disappears.",
      "Keep an eye out for golden coin balloons drifting over the city. Tap one to pop it for a few coins (up to 10 a day).",
      "Running low? Everyone gets topped back up to 100 every day.",
    ],
  },
  {
    icon: "🏅",
    title: "Badges",
    body: ["Pull off something special (survive without moving, catch three in a round, find the bot...) and you earn a badge you can share."],
  },
];

export function HowItWorks({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} wide>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Hide &amp; Seek</p>
          <h2 className="font-display text-2xl font-extrabold">How it works</h2>
        </div>
        <button onClick={onClose} className="rounded-full px-2 text-2xl text-muted" aria-label="Close">
          ×
        </button>
      </div>
      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <section key={s.title} className="rounded-2xl bg-panel-2 p-4">
            <h3 className="mb-1.5 flex items-center gap-2 font-display text-lg font-bold">
              <span>{s.icon}</span>
              {s.title}
            </h3>
            <ul className="space-y-1.5 text-sm text-ink/80">
              {s.body.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
        <section className="rounded-2xl bg-panel-2 p-4 text-sm text-ink/80">
          <h3 className="mb-1.5 flex items-center gap-2 font-display text-lg font-bold text-ink">
            <span>🗺️</span>Getting around
          </h3>
          <p>Drag to look around, pinch or scroll to zoom, and use two fingers (or right-drag) to turn the city. Tap a billboard to advertise on it.</p>
          <p className="mt-2 text-muted">You might spot: {CITY_ASSETS.big.join(", ")}, and plenty more.</p>
        </section>
      </div>
      <button onClick={onClose} className="mt-5 w-full rounded-xl bg-gold py-3 font-semibold text-ink">
        Got it
      </button>
    </Sheet>
  );
}
