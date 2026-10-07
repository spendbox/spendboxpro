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
      "Hide & Seek is for adults 18+.",
    ],
  },
  {
    icon: "🙈",
    title: "Hiding",
    body: [
      "Put down 100 coins and we'll drop you on a random spot when the window closes. Every hider makes the city grow a little.",
      "Moving costs 50 coins at the start of a round, and the price goes up every time anyone moves. After a move you wait 5 minutes before you can move again. You can't go back to a spot you've left, or onto one that's been searched (those show in orange).",
      "When you move, everyone sees that you slipped away, and from where.",
      "Make it to the end and you get your 100 back, and the survivors share 80% of the pool.",
    ],
  },
  {
    icon: "🔍",
    title: "Hunting",
    body: [
      "Tap Hunt to join, then tap any spot to search it. Your first search each day is free; after that the price creeps up as more of the city gets searched.",
      "Each search takes a couple of seconds. Search too fast and you'll have to wait longer before the next one.",
      "Find a hider and you keep most of their stake, plus a bonus if they're level 5 or higher (it grows every 5 levels). Find the bot and you get 200 coins.",
      "You can search a spot again if you think someone's snuck in. You only see the most recent searches on the map; older ones fade.",
      "There's a bot hiding every round, with a new name each time. It only moves when a drone sweeps it (three times at most), and it likes to tease the chat.",
    ],
  },
  {
    icon: "📡",
    title: "Drones and traps",
    body: [
      "A sweep sends a drone over an area. It tells you yes or no: is anyone hiding there? Anyone inside is pinned in place for 30 seconds (they see a countdown).",
      "Your last 5 sweeps keep watching as traps. If a hider moves into one, you'll get a ping. Nobody else can see your traps.",
      "Sweeps get pricier the more people use them, and your drone needs 10 seconds to recharge.",
    ],
  },
  {
    icon: "⭐",
    title: "Levels and power-ups",
    body: [
      "Play rounds, then spend coins to level up from the menu. Each level needs a few more rounds and a few more coins than the last.",
      "Level 3, Decoy 🎭 (hiders): put a fake hider on any spot you choose. Everyone hears a decoy went out, but not where. Drones think it's real, and a hunter who searches it gets nothing (bang, or a squeaky toy). One per game; each one costs a bit more than your last.",
      "Level 5, Shield 🛡️ (hiders): the next time you're found, you're teleported to a spot nearby and stay in the game (the hunter still takes your stake). You can't move while it's up. One per game, from 100 coins and a bit more each time.",
      "Level 10, Big search 🔦 (hunters): search a whole 3×3 area at once, for 7 times the price of a search.",
      "Level 20, Respawn 🔁 (hiders): caught in the first 30 minutes? Pay 300 coins to drop back in somewhere new. Everyone is told. Once per game.",
    ],
  },
  {
    icon: "🪙",
    title: "Coins",
    body: [
      "Coins are just for playing: they can't be bought or cashed out.",
      "Every round's pool starts at 0. Searches, sweeps, moves, shields and decoys all go into it. Sometimes a brand sponsors the pool and adds extra coins.",
      "If anyone survives: survivors share 80%, hunters share 10% (by how much they spent), and 10% disappears.",
      "If every hider is found: hunters share 80% (by how much they spent), the hiders who played share 10%, and 10% disappears.",
      "Tap a billboard to see the ad on it and earn a couple of coins (up to 10 ads a day). Keep an eye out for golden coin balloons too.",
      "Running low? While you have under 100 coins you earn passive income, a little every hour, up to 100 in 24 hours.",
      "Coming soon: a marketplace to swap coins for rewards from brands, like custom tees and event tickets.",
    ],
  },
  {
    icon: "🏅",
    title: "Badges",
    body: ["There are 100 badges to collect, from easy ones to legendary. Tap any badge in the menu to see what it means and how to earn it."],
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
          <p>On a phone: drag to look around, pinch to zoom, and use two fingers to turn the city. On a computer: drag to look around, scroll to zoom, and hold Ctrl (or right-click) and drag to turn. Tap a billboard to see its ad.</p>
          <p className="mt-2 text-muted">You might spot: {CITY_ASSETS.big.join(", ")}, and plenty more.</p>
        </section>
      </div>
      <button onClick={onClose} className="mt-5 w-full rounded-xl bg-gold py-3 font-semibold text-ink">
        Got it
      </button>
    </Sheet>
  );
}
