"use client";

import { cashText } from "@/lib/world/value";
import {
  Building2,
  Coins,
  Compass,
  Flame,
  Gamepad2,
  Ghost,
  House,
  Medal,
  MessageCircle,
  Star,
  Users,
  X,
  type LucideIcon,
} from "@/components/icons";
import { Briefcase, PartyPopper, Swords, Trophy, Wallet } from "lucide-react";
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
      "Out past the edge of town there's farmland and a few famous places from that country, like the Third Mainland Bridge, Big Ben or the Statue of Liberty. Take the train out to see them.",
      "A new game starts every hour, on the hour (UTC). The first 2 minutes are for joining as a ghost, while the town is being built. Then the hunt runs until the next hour mark, from morning to night (or night to morning), and the next game's countdown starts straight away.",
      "Newtown is for adults 18+.",
    ],
  },
  {
    icon: Ghost,
    title: "Ghosts",
    body: [
      "Join as a ghost in the first 2 minutes of the hour: put down ₥100. Ghosts don't hide or move: when the hunt starts, every ghost lights up on the map for everyone to see.",
      "Hunters challenge you to a quick game (Rock-Paper-Scissors for now, first to 2, a minute at most). A pop-up tells you wherever you are, even inside a building: answer within 30 seconds or you lose that duel.",
      "Win 3 duels and your light turns gold: you're safe for the rest of the game, you get your stake back, and you share the prize pool.",
      "Lose 3 and you're out: your light goes. Each loss costs a third of your stake (80% to the hunter who beat you, 20% to the prize pool).",
      "Your light shows blue when you're free and orange while you're in a duel. In between duels, explore, chat and play like everyone else.",
    ],
  },
  {
    icon: Swords,
    title: "Hunters",
    body: [
      "Everyone who isn't a ghost is a hunter: there's nothing to join.",
      "Tap a ghost's light (or Ghosts in the bottom bar) to see their stats: wins and losses this game and their record. Chat with them, or challenge them.",
      "A challenge costs ₥10. Win and you get your 10 back plus a slice of the ghost's stake. Lose and your 10 goes into the prize pool. Ghosts start with the advantage: if time runs out with the score level, the ghost wins.",
      "After each duel you catch your breath for 30 seconds. You can't challenge a ghost who's already in a duel, or a golden one.",
      "Win 20 duels in one game and you're in the prize pool too.",
    ],
  },
  {
    icon: Trophy,
    title: "The prize pool",
    body: [
      "Every game's pool starts at 0 and grows with lost challenges, slices of ghosts' stakes, sports tickets and the sportsbook's cut.",
      "When the game ends on the hour, golden ghosts and hunters with 20 wins share 90% of it equally; 10% disappears. If nobody made it, it all disappears.",
      "Ghosts who are still in (not golden, not out) get what's left of their stake back.",
    ],
  },
  {
    icon: MessageCircle,
    title: "Chatting",
    body: [
      <>
        Tap any building to go inside and chat with the people there. The <Ico icon={Users} /> numbers show how many are inside;
        bigger buildings hold more people.
      </>,
      "Or tap Explore to hop on a ride: up to 1,000 people float over the city together on a hot-air balloon for 10 minutes and chat on the way.",
      "You can message anyone privately from the People list, or from a ghost's card.",
      "When other real players are in the same place as you, a card pops up saying who they are (they're people, not NPCs), so you can say hi or add them as a friend.",
      "Add friends from the menu (Friends), the People list or that card. Once they say yes, they stay your friends in every new town: you see their faces over the places they're in, get a nudge when they go somewhere, and can go straight to them. Remove a friend any time.",
      "Send someone a hug or a handshake (from that card, Friends, or a private chat). It's free: up to 30 a day, and 3 a day to the same person. My gifts in the menu shows the hugs, handshakes and mint people sent you, with a Thank you button. Don't want to hear from someone? Block them there: their hugs, gifts, private messages and friend requests stop reaching you.",
    ],
  },
  {
    icon: Star,
    title: "Levels",
    body: [
      "Earn XP, then spend mint to level up from the menu. Playing a game gives 10 XP, finishing a side quest 10, and every day of your streak 5.",
      "Levels up to 20 are quick: 15 XP each, and ₥40 times the level you're on (₥40 from level 1 to 2, ₥400 from 10 to 11). After that each level takes more XP and more mint, all the way to level 100.",
      "Perks for the new duel game are on the way.",
    ],
  },
  {
    icon: Coins,
    title: "Mint",
    body: [
      "Mint is just for playing: it can't be bought or cashed out.",
      "Mint spent during a game goes into its prize pool (see above). Sometimes a brand sponsors the pool and adds extra mint.",
      "Tap a billboard to see the ad on it, then tap the ad's button to earn ₥5, paid by the brand (up to 5 ads a day).",
      "Running low? While your wallet and budget pots together are under your refill line you earn passive income every hour: up to ₥100 a day at level 1, and 25 more for every level after that, up to level 40 (1,075 a day).",
      "Anyone holding ₥10,000 or more is a big fish, and everyone can see it.",
      "You can give mint to other players, and spray mint on the dance floor in clubs.",
      "Going places costs a little: the first time you go into a place in each town costs ₥0.10 (a house) up to ₥5 (an international airport). Going back is free until the next town. Trains cost a fare every time you board (₥1, the monorail ₥1.50). Half of every fee goes into the prize pool.",
      "Coming soon: a marketplace to swap mint for rewards from brands, like custom tees and event tickets.",
    ],
  },
  {
    icon: Briefcase,
    title: "Jobs",
    body: [
      "Any business can give you a job: offices, shops, restaurants, clubs, banks, hotels, the station, the airport and more. Go inside and tap Jobs.",
      "To get the job, pass a quick interview: 5 questions about the town you're in (its name, its streets, its station, its country...). Fail and that place won't see you again in this town, so look around first!",
      "A job pays mint by the hour while the town lasts (better jobs pay more), up to 8 paid hours a day. Collect your pay from My job in the menu. Pay is taxed 10%, and the tax goes into the prize pool.",
      "Working builds skills (hospitality, finance, health care...). With a skill, the same kind of job in the next town needs no interview, and every skill level adds 10% to your pay.",
      "At work, tap Work a shift to play a quick game that fits the job. A medal score earns a tip.",
    ],
  },
  {
    icon: Gamepad2,
    title: "Games",
    body: [
      "Tap Games (in the menu, or inside any place) for 100 quick games: heists, sport, water, shooting, board games, cards, arcade, party and town life. The ones that suit the place you're in come first.",
      "Play alone, take turns with friends on one phone, or challenge someone in the same place: you both play the same level on your own phones and the best score wins. Board and card games can be played against the computer or someone online.",
      "A bronze, silver or gold score pays ₥2, ₥4 or ₥6, for up to 10 games a day.",
      "Robbing the bank? The job itself is a run of heist games. Fail one and the alarm goes off.",
    ],
  },
  {
    icon: Star,
    title: "Town events",
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
      "Tap any building to go inside: lobbies, floors, restaurants, clubs and rooftops. Tap the floor to walk around and tap glowing things to use them.",
      "Sit down, play mini games with the people around you (archery, darts, arcade, duels, trivia and more), order food, dance and spray mint in clubs.",
      "In a club, tap Dance (or the dance floor): the music starts and you see yourself dancing in the middle of the crowd, with a glowing ring under you. Pick a move (groove, hands up, shaku shaku, disco point, body wave, gwara gwara, legwork, spin), dance with another player or one of the regulars, and drag to look round. Everyone in the club sees you dance.",
      "Tap Explore to hop on a ride (hot-air balloons, bullet trains, the monorail, buses, cars, boats, the Ferris wheel and water slides) or watch sport. Rides drive themselves, so just sit back and look around.",
      "Watch sport: football at the stadium, basketball, boxing and wrestling at the arenas (or Explore, then Sports). Every match is a brand-new simulated game, shown live from above. A ticket costs a few mint, and you can bet mint on who wins before kick-off. Tickets and the sportsbook's cut of bets go into the game's prize pool. Mint only, just for fun.",
      "Sometimes you'll get a side quest (sitting down makes it more likely). Finish it for mint and special moves.",
      "Chat with the city's regulars (NPCs). Some joke, some are rude, some are generous, and a few spill real secrets about where ghosts are.",
    ],
  },
  {
    icon: House,
    title: "Your house",
    body: [
      "Build your own house from the menu: pick a style (cottage, bungalow, modern, duplex or villa), paint the walls and roof, choose the room inside and give it a name.",
      "Switch on \u201cShow my house in the game\u201d and it stands in the busy middle of every new town, with your name on the sign. People can walk in, sit down and chat. Each house adds 5 more hiding spots to the town.",
      "Switch it off any time: it stays until the end of the game it's in, and won't be in the next one. Free for now.",
    ],
  },
  {
    icon: Compass,
    title: "Your play style",
    body: [
      "At the end of every game you find out how you played: The Explorer, The Detective, The Party Animal, The Foodie, The Master Thief and more (12 in all), with the numbers that earned it.",
      "Play a few games and the bars in My style show your mix. Share your card with friends and see who's who.",
    ],
  },
  {
    icon: Flame,
    title: "Daily streaks",
    body: [
      "Do one thing a day to keep your streak going: play a game, finish a side quest, give or spray mint, hug or shake hands, or ride something. The flame next to your mint shows your days in a row.",
      "Miss a day and your free weekly freeze saves your streak (one a week). Miss more and it starts again.",
      "Reach 3, 7, 14, 30, 60 and 100 days for mint (10 up to 500) and a badge.",
    ],
  },
  {
    icon: Medal,
    title: "Badges",
    body: ["There are over 100 badges to collect, from easy ones to legendary. Tap any badge in the menu to see what it means and how to earn it."],
  },
];

/** The real map (what everyone plays now): one section for each part of life in the city. */
const WORLD_SECTIONS: { icon: LucideIcon; title: string; body: React.ReactNode[] }[] = [
  {
    icon: Building2,
    title: "A real city, alive",
    body: [
      "Newtown is a living 3D copy of a real city (Lagos first, more cities and countries on the way), with its real streets, neighbourhoods and landmarks.",
      "It's part social network, part game: the people you meet are real players, the places are real places, and what you do here is yours.",
      "Newtown is for adults 18+.",
    ],
  },
  {
    icon: House,
    title: "Start a life",
    body: [
      "Sign in and you get ₦2,000,000 and a free home to live in straight away (you can move once, free). Your Home bubble shows it on the map.",
      "Want to start richer? Once, until you buy a home of your own, a starter pack in your Wallet starts you with ₦20m, ₦80m or ₦300m (₦1,000, ₦2,500 or ₦5,000), paid by bank transfer or card.",
      "Save up for a home of your own (a flat, a house, a duplex) anywhere on the map. Friends can visit; anyone else knocks first.",
    ],
  },
  {
    icon: Wallet,
    title: "Money",
    body: [
      "Prices are real Lagos prices. Money comes from your daily gift (bigger the more you play, the more days in a row, and the better your reputation), from winning challenges, from events, and from places you own and let out.",
      "Spend it on rides, clubs, gifts, cars and homes. Tap your cash to see where your money comes from. No bills, no food to buy, no job: just play.",
    ],
  },
  {
    icon: Compass,
    title: "Get around",
    body: [
      "Tap any building or landmark on the map to go there (the fare is paid like a real trip). Every place has something to do inside.",
      "Or tap Walk at the bottom and walk the streets yourself. The round button in the lower left brings you back to where you are.",
    ],
  },
  {
    icon: Users,
    title: "People",
    body: [
      "See who's online and who's nearby, chat privately, and talk out loud in a voice call with the people in the same place (never recorded).",
      "Add friends, send gifts and money, sign a guest book, leave notes on the map.",
    ],
  },
  {
    icon: PartyPopper,
    title: "Events",
    body: [
      "Tap the party button (top right) to see what's on nearby, or host your own: a party (street party, owambe, concert, rave...) or a stage (a talk with slides, a class, a watch party, an open mic), on the street you're on or at a landmark, a restaurant or a park.",
      "Parties fill the street on the map. Inside: a DJ booth (songs everyone hears together) or a beat, the hot seat, meeting someone new, dance moves, shout-outs, toasts, spraying the host, a hype meter and a chat with photos. On a stage everyone watches the same slides or video together, reacts and asks questions.",
      "Parties cost money to host: from ₦100,000 an hour, more for a bigger crowd, a fancier place or a pricier area (all back if you call it off before it starts). Two street parties can't share a stretch of road at the same time. Sell tickets if you like: they include 7.5% VAT, and your takings pay 7% income tax like pay (you keep about 86%). The hosting permit and the taxes go to the state. Hosting events people come to, and going to them, raise your reputation.",
    ],
  },
  {
    icon: Trophy,
    title: "Challenge people",
    body: [
      "Challenge everyone nearby to a game (Whot! and Ludo now, more coming): everyone puts the same stake in the pool and the winner takes it. The guide opens it for you; it joins Events as Game challenge soon.",
      "Your first challenge is free; challenging again soon after costs a fee. Hosting and winning challenges raise your reputation.",
    ],
  },
  {
    icon: Star,
    title: "Reputation",
    body: [
      "Your reputation grows with your home and property, fine things, the challenges you win and what people like about you. It drops when you're caught doing wrong.",
    ],
  },
  {
    icon: Coins,
    title: "Fair and safe",
    body: [
      "Game money is for the game: it can't be turned back into cash. Report anyone who's out of order and we'll look into it.",
      "Businesses can advertise on the map's billboards and buildings: tap Advertise on the map.",
    ],
  },
];

/** How it works: the real map (legacy: the old hourly ghost-hunt towns). */
export function HowItWorks({ onClose, legacy }: { onClose: () => void; legacy?: boolean }) {
  const sections = legacy ? SECTIONS : WORLD_SECTIONS;
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
        {sections.map((s) => (
          <section key={s.title} className="rounded-2xl bg-panel-2 p-4">
            <h3 className="mb-1.5 flex items-center gap-2 font-display text-lg font-bold">
              <SectionIcon icon={s.icon} />
              {s.title}
            </h3>
            <ul className="space-y-1.5 text-sm text-ink/80">
              {s.body.map((line, i) => (
                <li key={i}>{moneyWords(line)}</li>
              ))}
            </ul>
          </section>
        ))}
        <section className="rounded-2xl bg-panel-2 p-4 text-sm text-ink/80">
          <h3 className="mb-1.5 flex items-center gap-2 font-display text-lg font-bold text-ink">
            <SectionIcon icon={Compass} />
            Moving the view
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

/** Amounts in the player's currency ("₥100" → "₦150,000"), and "mint" said as "money". */
function moneyWords(line: React.ReactNode): React.ReactNode {
  if (typeof line !== "string") return line;
  return cashText(line).replace(/\bmint\b/g, "money").replace(/\bMint\b/g, "Money");
}
