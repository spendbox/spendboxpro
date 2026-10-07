import Link from "next/link";
import { currentUserId } from "@/lib/game";

const RULES = [
  ["Seek", "Join any time. Tap tiles to search. Your first search each day is free; prices rise as the map fills up. Find a hider and take 80% of their stake."],
  ["Hide", "Stake 100 coins in the 10-minute window. You're dropped on a random tile, then have an hour to survive. One free move, one paid move."],
  ["Survive", "Hiders still hidden when the hour ends get their stake back plus a share of the survivor pool."],
  ["Seed Bot", "A bot hides in every round on a 20×20 map. Find it for 200 coins."],
];

export default async function Home() {
  const signedIn = Boolean(await currentUserId());
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-4 py-12">
      <div>
        <h1 className="font-display text-5xl font-extrabold leading-tight sm:text-6xl">
          Hide <span className="text-gold">&amp;</span> Seek
        </h1>
        <p className="mt-3 max-w-xl text-lg text-muted">
          One shared world. Rounds every hour. Hide on the grid and outlast the hunt, or search it for coins.
        </p>
        <Link
          href={signedIn ? "/play" : "/login"}
          className="mt-6 inline-block rounded-xl bg-gold px-6 py-3 font-semibold text-night"
        >
          {signedIn ? "Play now" : "Sign in to play"}
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {RULES.map(([title, text]) => (
          <div key={title} className="rounded-2xl bg-panel p-4">
            <h2 className="font-display text-lg font-bold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">Coins are for play only. They can&apos;t be bought or cashed out.</p>
    </main>
  );
}
