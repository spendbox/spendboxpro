"use client";

import { useEffect } from "react";
import { AvatarFace } from "@/components/avatar";
import { Crown } from "@/components/icons";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import type { Leader } from "../profile-actions";
import { leadersStore, useStore } from "./data";
import { LeadersSkeleton, LoadFailed } from "./skeletons";

/** Gold, silver and bronze for the top three. */
const PODIUM = ["#e0a100", "#8a94a6", "#b0662f"];
/** How tall each step of the podium is (1st, 2nd, 3rd). */
const STEP = ["4rem", "3rem", "2.25rem"];

/** The week's top players by mint won: the top three on a podium, then the rest. Fetched when opened. */
export function LeaderboardSheet({ me }: { me: { id: string } }) {
  const { value: board, failed } = useStore(leadersStore, me.id);

  useEffect(() => {
    void leadersStore.refresh(me.id);
  }, [me.id]);

  if (!board) {
    return failed ? (
      <LoadFailed text="Couldn't load the leaderboard." onRetry={() => void leadersStore.refresh(me.id, true)} />
    ) : (
      <LeadersSkeleton />
    );
  }

  const { leaders, myRank } = board;
  const top = leaders.slice(0, 3);
  const rest = leaders.slice(3);
  // Second, first, third: the winner in the middle.
  const podium = [top[1], top[0], top[2]].map((l, i) => (l ? { l, place: [2, 1, 3][i] } : null));

  return (
    <div className="min-h-[22rem]">
      <p className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>Most mint won in the last 7 days</span>
        {myRank && <span className="shrink-0 rounded-full bg-gold/25 px-2 py-0.5 font-bold text-ink">You&apos;re #{myRank}</span>}
      </p>

      {leaders.length === 0 ? (
        <p className="px-3 py-16 text-center text-sm text-muted">No winners yet this week. Be the first!</p>
      ) : (
        <>
          <ol className="mt-4 flex items-end gap-2" aria-label="Top three">
            {podium.map((p, i) =>
              p ? (
                <PodiumStep key={p.l.id} leader={p.l} place={p.place} isMe={p.l.id === me.id} />
              ) : (
                <li key={`empty-${i}`} className="flex-1" aria-hidden />
              ),
            )}
          </ol>

          {rest.length > 0 && (
            <ol start={4} className="mt-3 space-y-1">
              {rest.map((l, i) => (
                <li key={l.id} className={cn("flex items-center gap-2.5 rounded-xl px-2 py-1.5", l.id === me.id ? "bg-gold/25" : "bg-panel-2")}>
                  <span className="w-5 text-center font-display font-bold text-muted">{i + 4}</span>
                  <AvatarFace avatar={l.avatar} size={30} className="shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {l.name}
                    {l.id === me.id && <span className="text-muted"> (you)</span>}
                  </span>
                  <span className="font-display font-bold tabular-nums">{short(l.won)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {myRank === null ? (
        <p className="mt-4 rounded-xl border border-dashed border-line px-3 py-2 text-center text-xs text-muted">
          You&apos;re not on the board yet this week. Win some mint to climb it!
        </p>
      ) : myRank > leaders.length ? (
        <p className="mt-4 rounded-xl bg-panel-2 px-3 py-2 text-center text-xs">
          You&apos;re <b>#{myRank}</b> this week. Keep going!
        </p>
      ) : null}
    </div>
  );
}

function PodiumStep({ leader: l, place, isMe }: { leader: Leader; place: number; isMe: boolean }) {
  const color = PODIUM[place - 1];
  const first = place === 1;
  return (
    <li className="flex min-w-0 flex-1 flex-col items-center">
      <div className="relative">
        {first && <Crown className="absolute -top-4 left-1/2 size-5 -translate-x-1/2" style={{ color }} fill="currentColor" aria-hidden />}
        <span className="block rounded-full" style={{ boxShadow: `0 0 0 3px ${color}` }}>
          <AvatarFace avatar={l.avatar} size={first ? 56 : 46} className="block rounded-full" />
        </span>
      </div>
      <p className="mt-2 w-full truncate text-center text-xs font-semibold">
        {l.name}
        {isMe && <span className="text-muted"> (you)</span>}
      </p>
      <p className="font-display text-sm font-bold tabular-nums">
        {short(l.won)} <span className="text-[10px] font-semibold text-muted">mint</span>
      </p>
      <div
        className="mt-1.5 grid w-full place-items-center rounded-t-xl font-display text-lg font-extrabold text-white"
        style={{ height: STEP[place - 1], background: `linear-gradient(${color}, ${color}b3)` }}
        aria-label={`Number ${place}`}
      >
        {place}
      </div>
    </li>
  );
}
