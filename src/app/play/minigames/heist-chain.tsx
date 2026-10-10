"use client";

import { useState } from "react";
import { Check, Siren } from "lucide-react";
import { cn } from "@/lib/cn";
import { MINIGAME_BY_ID } from "./registry";
import { MiniGamePlayer, type PlayCtx } from "./shell";

// Pulling a job: a chain of heist games played one after another (pick the lock, beat the
// lasers, crack the safe, get away...). Each must reach the pass mark; fail one and the alarm
// goes off. Used by the bank robbery (and anything else that wants a heist).

export function HeistChain({ games, ctx, passGrade = 1, onDone, onCancel }: { games: string[]; ctx: PlayCtx; passGrade?: number; onDone: (passed: boolean) => void; onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const def = MINIGAME_BY_ID.get(games[step]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        {games.map((g, i) => (
          <span key={g} className={cn("flex h-7 flex-1 items-center justify-center gap-1 rounded-full text-[11px] font-bold", i < step ? "bg-me text-white" : i === step ? "bg-ink text-white" : "bg-panel-2 text-muted")}>
            {i < step && <Check className="size-3.5" />}
            {MINIGAME_BY_ID.get(g)?.title}
          </span>
        ))}
      </div>
      {def ? (
        <MiniGamePlayer
          key={def.id}
          def={def}
          ctx={ctx}
          onClose={onCancel}
          task={{
            label: `Step ${step + 1} of ${games.length}: pass it or the alarm goes off`,
            passGrade,
            onDone: (_score, grade) => {
              if (grade < passGrade) return onDone(false);
              if (step + 1 >= games.length) return onDone(true);
              setStep(step + 1);
            },
          }}
        />
      ) : (
        <p className="flex items-center gap-2 text-sm text-hit">
          <Siren className="size-4" /> Something went wrong with the plan.
        </p>
      )}
    </div>
  );
}
