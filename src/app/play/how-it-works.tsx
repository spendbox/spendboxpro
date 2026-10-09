"use client";

import {
  Building2,
  Coins,
  Compass,
  Drama,
  Flashlight,
  Gamepad2,
  Ghost,
  Medal,
  MessageCircle,
  Radar,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  Star,
  Users,
  X,
  type LucideIcon,
} from "@/components/icons";
import { CITY_ASSETS } from "@/lib/city/layout";
import { Sheet } from "./sheet";
import { Logo } from "@/components/logo";
import { CONTACT_EMAIL, SITE_DOMAIN } from "@/lib/brand";

/** A small icon that sits in a line of text, the same size as the words. */
function Ico({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="mx-0.5 inline-block size-[1.05em] align-[-0.17em]" />;
}

const SECTIONS: { icon: LucideIcon; title: string; body: React.ReactNode[] }[] = [
  {
    icon: Building2,
    title: "One city, one hour",
    body: [
      "Every round is a brand-new city, named after a real place, with its own streets and landmarks.",
      "A new game starts every hour, on the hour (UTC). The first 3 minutes are for joining as a ghost. Then the hunt runs until the next hour mark, from morning to night (or night to morning), and the next game's countdown starts straight away.",
      "Newtown is for adults 18+.",
    ],
  },
  {
    icon: Ghost,
    title: "Hiding",
    body: [
      "Join in the first 3 minutes of the hour: put down 100 mint and we'll drop you on a random spot when the countdown ends. Every ghost makes the city grow a little.",
      "As a ghost you get one move per game (two from level 10, three from level 20). Moving costs 50 mint at the start of a round, and the price goes up every time anyone moves. You can't go back to a spot you've left, or onto one that's been searched (those show in orange).",
      "When you move, everyone sees that you slipped away, and from where.",
      "Make it to the end and you get your 100 back, and the survivors share 80% of the pool.",
    ],
  },
  {
    icon: Search,
    title: "Hunting",
    body: [
      "Tap Hunt to join, then tap any spot to search it. Your first search each day is free; after that the price creeps up as more of the city gets searched.",
      "Each search takes a couple of seconds. Search too fast and you'll have to wait a little longer before the next one.",
      "The hunt always runs to the top of the hour, even if every ghost has been caught. The clock turns red and beeps in the last 30 seconds.",
      "Find a ghost and you keep most of their stake, plus a bonus if they're level 5 or higher (it grows every 5 levels). Find the bot and you get 200 mint.",
      "You can search a spot again if you think someone's snuck in. You only see the most recent searches on the map; older ones fade.",
      "There's a bot hiding every round, with a new name each time. It only moves when a drone sweeps it (three times at most), and it likes to tease the chat.",
    ],
  },
  {
    icon: Radar,
    title: "Drones and traps",
    body: [
      "A sweep sends a drone over an area. It tells you yes or no: is anyone hiding there? Any ghost inside is pinned in place for 60 seconds (they see a countdown). A drone that spots someone needs 90 seconds to recharge.",
      "Your last 5 sweeps keep watching as traps. If a ghost moves into one, you'll get a ping. Nobody else can see your traps.",
      "Sweeps get pricier the more people use them, and your drone needs 10 seconds to recharge.",
    ],
  },
  {
    icon: MessageCircle,
    title: "Chatting",
    body: [
      <>
        Switch to <Ico icon={MessageCircle} />
        <b>Chat</b> mode and tap any building to go inside and chat with the people there. The <Ico icon={Users} /> numbers show how
        many are inside; bigger buildings hold more people.
      </>,
      "Or hop on a hot-air balloon: up to 1,000 people float over the city together for 10 minutes and chat on the way.",
      "You can still message anyone privately from the People list. Tap where a ghost was caught to say hi to them.",
      <>
        Switch back to <Ico icon={Gamepad2} />
        <b>Game</b> to search or move.
      </>,
    ],
  },
  {
    icon: Star,
    title: "Levels and power-ups",
    body: [
      "Play rounds, then spend mint to level up from the menu. Each level needs a few more rounds and a bit more mint than the last.",
      <>
        Level 3, <Ico icon={Drama} />
        <b>Decoy</b> (ghosts): put a fake ghost on any spot you choose. Everyone hears a decoy went out, but not where. Drones think
        it&apos;s real, and a hunter who searches it gets nothing (bang, or a squeaky toy). One per game; each one costs a bit more
        than your last.
      </>,
      <>
        Level 5, <Ico icon={Shield} />
        <b>Shield</b> (ghosts): the next time you&apos;re found, you&apos;re teleported to a spot nearby and stay in the game (the
        hunter still takes your stake). You can&apos;t move while it&apos;s up. One per game, from 100 mint and a bit more each time.
      </>,
      <>
        Level 10, <Ico icon={Flashlight} />
        <b>Big search</b> (hunters): search a whole 3×3 area at once, for 7 times the price of a search.
      </>,
      <>
        Level 20, <Ico icon={RotateCcw} />
        <b>Respawn</b> (ghosts): caught in the first 30 minutes? Pay 300 mint to drop back in somewhere new. Everyone is told.
        Once per game.
      </>,
    ],
  },
  {
    icon: Coins,
    title: "Mint",
    body: [
      "Mint is just for playing: it can't be bought or cashed out.",
      "Every round's pool starts at 0. Searches, sweeps, moves, shields and decoys all go into it. Sometimes a brand sponsors the pool and adds extra mint.",
      "If anyone survives: survivors share 80%, hunters share 10% (by how much they spent), and 10% disappears.",
      "If every ghost is found: hunters share 80% (by how much they spent), the ghosts who played share 10%, and 10% disappears.",
      "Tap a billboard to see the ad on it and earn 5 mint, paid by the brand (up to 5 ads a day). Keep an eye out for golden mint balloons too.",
      "Running low? While you're under your refill line you earn passive income every hour: up to 100 mint a day at level 1, and 25 more for every level after that.",
      "Anyone holding 10,000 mint or more is a big fish, and everyone can see it.",
      "You can give mint to other players, and spray mint on the dance floor in clubs.",
      "Coming soon: a marketplace to swap mint for rewards from brands, like custom tees and event tickets.",
    ],
  },
  {
    icon: Sparkles,
    title: "World events",
    body: [
      "Every hour something rare happens somewhere in the city: fires, parades, UFOs, a treasure chest, a money truck spill, and dozens more.",
      "Tap the news to fly straight there. Some events pay mint to the first few people who tap them.",
      "Some events change the rules for a few minutes: double mint, free searches on a lucky street, a safe house where nobody can be found, a blackout where nobody can search…",
    ],
  },
  {
    icon: Gamepad2,
    title: "Things to do",
    body: [
      "In Chat mode, tap any building to go inside: lobbies, floors, restaurants, clubs and rooftops. Tap the floor to walk around and tap glowing things to use them.",
      "Sit down, play mini games with the people around you (archery, darts, arcade, duels, trivia and more), order food, dance and spray mint in clubs.",
      "Hop on a ride: hot-air balloons, trains, buses, cars, boats, the Ferris wheel and water slides. They drive themselves, so just sit back and look around.",
      "Watch sport: football at the stadium, basketball, boxing and wrestling at the arenas (or tap Sports in Chat mode). Every match is a brand-new simulated game, shown live from above. A ticket costs a few mint, and you can bet mint on who wins before kick-off. Mint only, just for fun.",
      "Sometimes you'll get a side quest (sitting down makes it more likely). Finish it for mint and special moves.",
      "Chat with the city's regulars (NPCs). Some joke, some are rude, some are generous, and a few spill real secrets about where ghosts are.",
    ],
  },
  {
    icon: Medal,
    title: "Badges",
    body: ["There are 100 badges to collect, from easy ones to legendary. Tap any badge in the menu to see what it means and how to earn it."],
  },
];

export function HowItWorks({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} wide>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <Logo size={28} />
          <h2 className="mt-2 font-display text-2xl font-extrabold">How it works</h2>
        </div>
        <button onClick={onClose} className="grid size-9 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close">
          <X className="size-6" />
        </button>
      </div>
      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <section key={s.title} className="rounded-2xl bg-panel-2 p-4">
            <h3 className="mb-1.5 flex items-center gap-2 font-display text-lg font-bold">
              <SectionIcon icon={s.icon} />
              {s.title}
            </h3>
            <ul className="space-y-1.5 text-sm text-ink/80">
              {s.body.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
        <section className="rounded-2xl bg-panel-2 p-4 text-sm text-ink/80">
          <h3 className="mb-1.5 flex items-center gap-2 font-display text-lg font-bold text-ink">
            <SectionIcon icon={Compass} />
            Getting around
          </h3>
          <p>On a phone: drag to look around, pinch to zoom, and use two fingers to turn the city. On a computer: drag to look around, scroll to zoom, and hold Ctrl (or right-click) and drag to turn. Tap a billboard to see its ad.</p>
          <p className="mt-2 text-muted">You might spot: {CITY_ASSETS.big.join(", ")}, and plenty more.</p>
        </section>
        <p className="px-1 text-center text-sm text-muted">
          Questions or ideas? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-ink underline">
            {CONTACT_EMAIL}
          </a>
          . Play at <b className="text-ink">{SITE_DOMAIN}</b>.
        </p>
      </div>
      <button onClick={onClose} className="mt-5 w-full rounded-xl bg-gold py-3 font-semibold text-ink">
        Got it
      </button>
    </Sheet>
  );
}

/** The round gold badge next to each section title. */
function SectionIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-gold/25 text-gold-dark" aria-hidden>
      <Icon className="size-[18px]" strokeWidth={2.25} />
    </span>
  );
}
