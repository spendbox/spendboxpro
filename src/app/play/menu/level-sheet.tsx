"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { Flame, Gamepad2, PartyPopper, Star } from "@/components/icons";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { upgradeLevel } from "../profile-actions";
import { levelStore, useStore } from "./data";
import { LevelSkeleton, LoadFailed } from "./skeletons";

/**
 * Your level, what the next one takes (XP from games, side quests and streak days, plus mint),
 * and the button to level up.
 * Its code is only downloaded when you open it from the menu.
 */
export function LevelSheet({ me }: { me: { id: string } }) {
  const { value: info, failed } = useStore(levelStore, me.id);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string; party?: boolean } | null>(null);

  useEffect(() => {
    void levelStore.refresh(me.id);
  }, [me.id]);

  if (!info) {
    return failed ? (
      <LoadFailed text="Couldn't load your level." onRetry={() => void levelStore.refresh(me.id, true)} />
    ) : (
      <LevelSkeleton />
    );
  }
  const next = info.level + 1;
  // XP towards the next level (before game-db/027 is run, rounds played instead).
  const xpMode = info.xp !== null && info.nextXp !== null;
  const have = xpMode ? info.xp! : info.roundsPlayed;
  const need = xpMode ? info.nextXp! : info.nextRounds;
  const left = Math.max(0, need - have);
  const enoughCoins = info.coins >= info.nextCost;

  const upgrade = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await upgradeLevel();
      if (res.ok) {
        setNote({ ok: true, party: true, text: `You're level ${res.level}!` });
        await levelStore.refresh(me.id, true);
      } else {
        setNote({ ok: false, text: res.error || "Couldn't level up. Try again." });
      }
    } catch {
      setNote({ ok: false, text: "Couldn't level up. Try again." });
    }
    setConfirm(false);
    setBusy(false);
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#18202b] to-[#3b2f6b] p-3 text-white">
      <div className="flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold font-display text-xl font-extrabold text-ink shadow">
          {info.level}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold">Level {info.level}</p>
          <p className="text-xs text-white/70">
            {xpMode && <>{short(info.xp!)} XP · </>}
            {short(info.roundsPlayed)} round{info.roundsPlayed === 1 ? "" : "s"} played
          </p>
        </div>
      </div>

      {/* What the next level needs */}
      <div className="mt-2.5">
        {info.max ? (
          <p className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2 text-center text-xs font-semibold text-gold">
            <PartyPopper className="size-4 shrink-0" />
            Top level. You made it all the way!
          </p>
        ) : left > 0 ? (
          <>
            <div className="flex items-baseline justify-between text-xs">
              <span>
                {xpMode ? (
                  <>
                    Earn <b>{left}</b> more XP to unlock level {next}
                  </>
                ) : (
                  <>
                    Play <b>{left}</b> more round{left === 1 ? "" : "s"} to unlock level {next}
                  </>
                )}
              </span>
              <span className="tabular-nums text-white/60">
                {have}/{need}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, (have / Math.max(1, need)) * 100)}%` }} />
            </div>
          </>
        ) : confirm ? (
          <div className="rounded-xl bg-white/10 p-2 text-xs">
            <p>
              Reach level {next}? The mint is used up.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={() => setConfirm(false)} disabled={busy} className="rounded-lg bg-white/15 py-2 font-semibold">
                Not now
              </button>
              <button onClick={upgrade} disabled={busy} className="rounded-lg bg-gold py-2 font-semibold text-ink disabled:opacity-60">
                {busy ? "Levelling up…" : `Yes, spend ₥${short(info.nextCost)}`}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => {
                setNote(null);
                setConfirm(true);
              }}
              disabled={!enoughCoins}
              className="w-full rounded-xl bg-gold py-2 text-sm font-semibold text-ink disabled:opacity-50"
            >
              Upgrade to level {next} for ₥{short(info.nextCost)}
            </button>
            {!enoughCoins && (
              <p className="mt-1 text-center text-[11px] text-white/70">
                You need {short(info.nextCost - info.coins)} more mint (you have {short(info.coins)}).
              </p>
            )}
          </>
        )}
        {xpMode && !info.max && (
          <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 text-[11px] text-white/75">
            <span className="flex items-center gap-1"><Gamepad2 className="size-3.5 text-gold" />Game +{info.xpFor.game}</span>
            <span className="flex items-center gap-1"><ScrollText className="size-3.5 text-gold" />Side quest +{info.xpFor.quest}</span>
            <span className="flex items-center gap-1"><Flame className="size-3.5 text-gold" />Streak day +{info.xpFor.streak}</span>
          </p>
        )}
        {note && (
          <p className={cn("mt-1.5 flex items-center justify-center gap-1.5 text-center text-xs font-semibold", note.ok ? "text-gold" : "text-[#ffb4b6]")}>
            {note.party && <PartyPopper className="size-4 shrink-0" />}
            {note.text}
          </p>
        )}
      </div>

      <p className="mt-3 flex gap-1.5 rounded-xl bg-white/10 px-2.5 py-2 text-[11px] leading-snug text-white/80">
        <Star className="mt-px size-3.5 shrink-0 text-gold" fill="currentColor" />
        <span>Your level shows how seasoned you are. New perks for ghost duels are on the way.</span>
      </p>
    </div>
  );
}
