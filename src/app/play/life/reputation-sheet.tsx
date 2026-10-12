"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Building, Clapperboard, Coins, Egg, Gift, Globe, Landmark, Megaphone, Rocket, Smile, Users, Briefcase as Work, Wallet, Zap } from "lucide-react";
import { Star } from "@/components/icons";
import { reputationDetails, type RepDetails } from "../rep-actions";
import { Sheet } from "../sheet";

// Your reputation (what adds to it, what takes it away), and what's coming to Newtown.

/** Reputation: the score, what's bringing it up and what's pulling it down, and earning from it (soon). */
export function ReputationSheet({ onClose }: { onClose: () => void }) {
  const [d, setD] = useState<RepDetails | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void reputationDetails()
      .then((r) => alive && setD(r))
      .catch(() => alive && setD(null));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Sheet onClose={onClose} wide title="Reputation">
      {d === undefined ? (
        <div className="h-48 animate-pulse rounded-2xl bg-ink/5" />
      ) : d === null ? (
        <p className="py-6 text-center text-sm text-muted">Start your life to build a reputation.</p>
      ) : (
        <>
          <div className="rounded-3xl bg-gradient-to-br from-gold/30 to-gold/5 p-4 text-center">
            <Star className="mx-auto size-7 fill-gold text-gold-dark" />
            <p className="font-display text-4xl font-extrabold tabular-nums">{d.score.toLocaleString("en-GB")}</p>
            <p className="text-xs text-muted">How the city sees you. It decides how many marks you can leave, and soon, what you earn.</p>
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-me">
            <ArrowUp className="size-4" /> Bringing it up
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {d.plus.map((l) => (
              <Line key={l.label} line={l} />
            ))}
          </ul>
          <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-hit">
            <ArrowDown className="size-4" /> Taking it away
          </p>
          {d.minus.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted">Nothing. A clean record.</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {d.minus.map((l) => (
                <Line key={l.label} line={l} />
              ))}
            </ul>
          )}
          <div className="mt-5 rounded-2xl bg-ink p-4 text-white">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Coins className="size-4 text-gold" /> Earn from your reputation
              <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase text-ink">Coming soon</span>
            </p>
            <p className="mt-1.5 text-xs text-white/75">
              Half of everything Newtown earns (adverts, packs, leases) will be shared with the players with the highest reputation. The higher yours, the bigger your share. Start building it now.
            </p>
          </div>
        </>
      )}
    </Sheet>
  );
}

function Line({ line }: { line: { label: string; points: number; how: string } }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-ink/[0.04] px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <b className="block text-sm">{line.label}</b>
        <span className="text-[11px] text-muted">{line.how}</span>
      </span>
      <span className={`shrink-0 font-display text-lg font-extrabold tabular-nums ${line.points > 0 ? "text-me" : line.points < 0 ? "text-hit" : "text-muted"}`}>
        {line.points > 0 ? `+${line.points}` : line.points}
      </span>
    </li>
  );
}

const SOON: { icon: typeof Rocket; title: string; text: string }[] = [
  { icon: Globe, title: "All of Nigeria, then Africa, then the world", text: "Every Nigerian city on its real map first, then Africa's, then the world's. Live in one, visit the others." },
  { icon: Clapperboard, title: "Post videos and moments", text: "Share videos, photos and stories from your real life, pinned to places on the map." },
  { icon: Landmark, title: "Politics", text: "Run for councillor of your area, campaign, vote, and decide what the city's taxes pay for." },
  { icon: Egg, title: "Easter eggs", text: "Secrets hidden around Lagos, with prizes for whoever finds them first." },
  { icon: Work, title: "Real jobs", text: "Real companies hiring through the game: apply, interview, get paid in real life." },
  { icon: Wallet, title: "Creator payouts", text: "Get paid for what you make and post, and for your reputation: half of Newtown's revenue shared." },
  { icon: Building, title: "Over a million building designs", text: "Buildings that look like the real ones, with more floors to explore inside, and many more landmarks." },
  { icon: Zap, title: "More of the city", text: "Transformers, power lines, water tanks, bus stops, kiosks, street lights... the everyday things that make Lagos Lagos." },
  { icon: Smile, title: "Better avatars", text: "More faces, hair, clothes and moves, so you look like you." },
  { icon: Users, title: "Group conversations", text: "Group chats with your friends, your street, your rivals or your fans." },
  { icon: Gift, title: "Rewards from real companies", text: "Real brands giving real rewards for what you do in the game." },
];

/** What's coming to Newtown, and a way to help it get there (advertise). */
export function ComingSoonSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} wide title="Coming soon">
      <p className="text-sm text-muted">Newtown is just getting started. Here&apos;s what&apos;s on the way:</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {SOON.map((s) => (
          <li key={s.title} className="flex items-start gap-3 rounded-2xl bg-ink/[0.04] p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold-dark">
              <s.icon className="size-5" />
            </span>
            <span>
              <b className="block text-sm">{s.title}</b>
              <span className="text-xs text-muted">{s.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-2xl bg-gradient-to-br from-gold/30 to-gold/5 p-4">
        <p className="flex items-center gap-2 font-semibold">
          <Rocket className="size-5 text-gold-dark" /> Help us get there faster
        </p>
        <p className="mt-1 text-xs text-muted">Every advert keeps Newtown free and builds what&apos;s next. Put your business on a building in the city.</p>
        <a href="/advertise/start" className="mt-3 flex h-11 items-center justify-center gap-2 rounded-full bg-ink text-sm font-semibold text-white">
          <Megaphone className="size-4" /> Advertise to support us
        </a>
      </div>
    </Sheet>
  );
}
