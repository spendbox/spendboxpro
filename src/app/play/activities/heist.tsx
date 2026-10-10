"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bomb, Footprints, LoaderCircle, Siren, Vault } from "lucide-react";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { bankHeistInfo, robBank, type HeistInfo, type HeistResult } from "../heist-actions";
import { playSfx } from "../sound";
import { useActivityRoom } from "./hub";
import { BigButton, Confetti, GameHeader, type GameProps, useSecondsLeft } from "./ui";

// Rob the bank: the vault holds the game's prize pool. Pick a plan (a quiet job or a big
// heist), see the odds and what's at stake, and go. The server rolls the dice; this screen
// plays out the tension (alarms, a cracking bar) and then the getaway or the arrest.

const PLAN_INFO = {
  quiet: { title: "The quiet job", line: "Slip in after hours and crack a side safe.", icon: Footprints, color: "#1c7ed6" },
  big: { title: "The big heist", line: "Blow the main vault door. Loud, fast, rich.", icon: Bomb, color: "#e03131" },
} as const;

const WHY: Record<string, string> = {
  no_game: "The bank only opens while a game is on.",
  no_name: "Pick a player name first.",
  frozen: "Your account is paused right now.",
  empty_vault: "The vault is nearly empty. Come back when the prize pool has grown.",
  not_enough: "You don't have enough mint to pull a job.",
};

const STEPS = ["Cutting the alarm wires…", "Cracking the vault…", "Filling the bags…", "Running for the van…"];

export function Heist(props: GameProps) {
  const [info, setInfo] = useState<HeistInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<"quiet" | "big">("quiet");
  const [phase, setPhase] = useState<"choose" | "confirm" | "running" | "done">("choose");
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<HeistResult | null>(null);
  const timers = useRef<number[]>([]);
  const room = useActivityRoom(props.roundId, props.roomId, props.me);

  useEffect(() => {
    let live = true;
    const pending = timers.current;
    bankHeistInfo()
      .then((r) => {
        if (!live) return;
        if (r.ok) setInfo(r.info);
        else setError(r.error);
      })
      .catch(() => live && setError("The connection blinked. Close and try again."));
    return () => {
      live = false;
      pending.forEach(clearTimeout);
    };
  }, []);
  const coolLeft = useSecondsLeft(info?.cooldownUntil ? Date.parse(info.cooldownUntil) : null);

  async function go() {
    setPhase("running");
    setStep(0);
    setError(null);
    playSfx("start");
    // The answer comes back straight away, but the drama takes a few seconds.
    const res = await robBank(plan).catch(() => ({ ok: false as const, error: "The connection blinked. Your mint is safe." }));
    if (!res.ok) {
      setError(res.error);
      setPhase("choose");
      return;
    }
    STEPS.forEach((_, i) =>
      timers.current.push(
        window.setTimeout(() => {
          setStep(i);
          playSfx(i === STEPS.length - 1 ? "whoosh" : "tick");
        }, i * 900),
      ),
    );
    timers.current.push(
      window.setTimeout(() => {
        setResult(res.result);
        setPhase("done");
        playSfx(res.result.success ? "levelup" : "caught");
        if (props.me) {
          room.send({
            t: "toast",
            icon: "star",
            from: props.me.id,
            text: res.result.success
              ? `${props.me.name} robbed the bank and got away with ₥${short(res.result.loot)}!`
              : `${props.me.name} tried to rob the bank and got caught!`,
          });
        }
      }, STEPS.length * 900 + 400),
    );
  }

  const chosen = info?.plans.find((p) => p.key === plan) ?? null;
  const fineNow = info ? Math.min(Math.round(Math.max(0, info.coins - (chosen?.stake ?? 0)) * info.fineShare), info.fineMax) : 0;
  const blocked = info && !info.can ? (info.why === "cooldown" ? `The police are still watching you. Try again in ${Math.ceil(coolLeft / 60)} min.` : WHY[info.why ?? ""] ?? null) : null;

  return (
    <div className="space-y-3">
      <GameHeader icon={Vault} title="Rob the bank" sub="Huge risk. Huge reward." onClose={props.onClose} color="#2b2f33" />

      {!info && !error && (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" />
          Casing the joint…
        </p>
      )}

      {info && phase !== "done" && (
        <>
          <div className="rounded-2xl bg-gradient-to-br from-[#2b2f33] to-[#16191d] p-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">In the vault (the prize pool)</p>
            <p className="font-display text-3xl font-extrabold text-[#f2c94c]">₥{short(info.vault)}</p>
            <p className="mt-1 text-xs text-white/70">Get away and you take a share of it. Get caught and you add to it.</p>
          </div>

          {phase === "choose" && (
            <div className="grid gap-2 sm:grid-cols-2">
              {info.plans.map((p) => {
                const meta = PLAN_INFO[p.key];
                const on = plan === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => setPlan(p.key)}
                    className={cn("rounded-2xl border-2 p-3 text-left transition", on ? "border-ink bg-panel-2" : "border-line bg-panel")}
                  >
                    <span className="flex items-center gap-2">
                      <span className="grid size-8 place-items-center rounded-xl text-white" style={{ background: meta.color }}>
                        <meta.icon className="size-4" />
                      </span>
                      <b>{meta.title}</b>
                    </span>
                    <span className="mt-1 block text-xs text-muted">{meta.line}</span>
                    <span className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
                      <span className="rounded-lg bg-panel px-1 py-1">
                        <b className="block text-sm">{short(p.stake)}</b>stake
                      </span>
                      <span className="rounded-lg bg-panel px-1 py-1">
                        <b className="block text-sm">{Math.round(p.chance * 100)}%</b>get away
                      </span>
                      <span className="rounded-lg bg-panel px-1 py-1">
                        <b className="block text-sm text-[#2b8a3e]">+{short(p.loot)}</b>loot
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {phase === "confirm" && chosen && (
            <div className="rounded-2xl border-2 border-hit/40 bg-hit/5 p-3 text-sm">
              <p className="flex items-center gap-2 font-bold text-hit">
                <AlertTriangle className="size-5" />
                Are you sure? {Math.round((1 - chosen.chance) * 100)} in 100 robbers get caught.
              </p>
              <p className="mt-1">
                Caught: you lose your <b>₥{short(chosen.stake)}</b> stake and pay a fine of <b>₥{short(fineNow)}</b> ({Math.round(info.fineShare * 100)}% of what you have
                left). Both go into the prize pool, and the whole town hears about it.
              </p>
              <p className="mt-1">
                Get away: your stake back plus <b className="text-[#2b8a3e]">₥{short(chosen.loot)}</b>.
              </p>
            </div>
          )}

          {phase === "running" && (
            <div className="relative overflow-hidden rounded-2xl bg-[#16191d] p-4 text-white">
              <div className="pointer-events-none absolute inset-0 opacity-40" style={{ animation: "siren 0.6s steps(2) infinite" }} />
              <p className="relative flex items-center gap-2 font-display text-lg font-bold">
                <Siren className="size-5 animate-pulse text-[#ff6b6b]" />
                {STEPS[step]}
              </p>
              <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-[#f2c94c] transition-[width] duration-700" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
              </div>
            </div>
          )}

          {blocked ? (
            <p className="rounded-xl bg-panel-2 px-3 py-2 text-center text-sm text-muted">{blocked}</p>
          ) : phase === "choose" ? (
            <BigButton onClick={() => setPhase("confirm")} disabled={!chosen || info.coins < chosen.stake}>
              <Vault className="size-5" />
              {chosen && info.coins < chosen.stake ? `You need ₥${short(chosen.stake)}` : "Plan the job"}
            </BigButton>
          ) : phase === "confirm" ? (
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <BigButton tone="soft" onClick={() => setPhase("choose")} className="w-auto px-5">
                Back out
              </BigButton>
              <BigButton onClick={() => void go()} className="bg-hit">
                <Siren className="size-5" />
                Do it (₥{short(chosen?.stake ?? 0)})
              </BigButton>
            </div>
          ) : null}
        </>
      )}

      {phase === "done" && result && (
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl p-5 text-center text-white",
            result.success ? "bg-gradient-to-br from-[#2b8a3e] to-[#1b5e2b]" : "bg-gradient-to-br from-[#c92a2a] to-[#5c1010]",
          )}
        >
          {result.success && <Confetti count={40} />}
          {!result.success && <div className="pointer-events-none absolute inset-0 opacity-30" style={{ animation: "siren 0.5s steps(2) infinite" }} />}
          <p className="relative font-display text-3xl font-extrabold">{result.success ? "You got away!" : "BUSTED!"}</p>
          <p className="relative mt-1 text-sm text-white/90">
            {result.success
              ? `+₥${short(result.loot)}, and your ${short(result.stake)} stake back.`
              : `The police caught you. You lost ₥${short(result.stake + result.fine)} (stake and fine), and it went into the prize pool.`}
          </p>
          <p className="relative mt-2 text-xs text-white/70">You now have ₥{short(result.coins)}. The police will be watching you for the next hour.</p>
        </div>
      )}

      {error && <p className="rounded-xl bg-hit/10 px-3 py-2 text-center text-sm text-hit">{error}</p>}
      {phase === "done" && (
        <BigButton tone="soft" onClick={props.onClose}>
          Done
        </BigButton>
      )}
    </div>
  );
}
