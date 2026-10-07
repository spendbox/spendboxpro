import Link from "next/link";
import { currentUserId } from "@/lib/game";

const RULES = [
  ["Seek", "Jump in whenever you like and start poking around the city. Your first search of the day is on us; after that, searches get pricier as more of the city gets combed. Catch a hider and you pocket most of their stake."],
  ["Hide", "Put 100 coins down in the 10-minute window and we'll drop you somewhere random. Then survive the hour. You can move whenever you like (100 coins a go, once a minute), but never back to where you've been, and don't wander onto a spot someone already searched."],
  ["Survive", "Still hidden when time runs out? You get your stake back plus a cut of the survivor pool, which fills up with every search, sweep and move."],
  ["The bot", "There's a bot hiding in every round, with a new name each time. It moves around, and it runs when it gets swept. Find it for 200 coins."],
];

export default async function Home() {
  const signedIn = Boolean(await currentUserId());
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-4 py-12">
      <div>
        <h1 className="font-display text-5xl font-extrabold leading-tight sm:text-6xl">
          Hide <span className="text-gold-dark">&amp;</span> Seek
        </h1>
        <p className="mt-3 max-w-xl text-lg text-muted">
          One living city that grows with every player. Hide in it and outlast the hunt, or search it for coins.
        </p>
        <Link
          href={signedIn ? "/play" : "/login"}
          className="mt-6 inline-block rounded-xl bg-gold px-6 py-3 font-semibold text-ink"
        >
          {signedIn ? "Back to the city" : "Enter world"}
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
