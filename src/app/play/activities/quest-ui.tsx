"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Armchair,
  Binoculars,
  Brain,
  Building2,
  Camera,
  Check,
  Clock,
  Coins,
  Dices,
  Drone,
  Fingerprint,
  Footprints,
  Gamepad2,
  Gem,
  Ghost,
  Gift,
  Martini,
  MessageCircle,
  Mic,
  Moon,
  Music,
  Package,
  PartyPopper,
  Sailboat,
  Search,
  Spade,
  Target,
  TrainFront,
  Trophy,
  UtensilsCrossed,
  VenetianMask,
  Zap,
} from "lucide-react";
import { HotAirBalloon } from "@/components/icons";
import { addressOf, makePlan, tileAt } from "@/lib/city/layout";
import { cn } from "@/lib/cn";
import { ACTION_INFO, BIG_FISH_COINS, QUEST_BY_KEY, stepLabel, stepProgressText, type QuestActionResult, type QuestIcon, type QuestState } from "@/lib/quests";
import { dropQuest, runQuestAction, stealFrom, stealTargets, type StealTarget } from "../quest-actions";
import { Sheet } from "../sheet";
import { playSfx } from "../sound";
import { clearQuestFlash, refreshQuest, setQuest, useQuestSnapshot } from "./quest-store";
import { ActivityStyles, BigButton, Confetti, Face, GameHeader, useSecondsLeft } from "./ui";

type Icon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

export const QUEST_ICONS: Record<QuestIcon, Icon> = {
  thief: VenetianMask,
  detective: Fingerprint,
  courier: Package,
  food: UtensilsCrossed,
  party: PartyPopper,
  tourist: Camera,
  spy: Binoculars,
  night: Moon,
  gift: Gift,
  treasure: Gem,
  camera: Camera,
  target: Target,
  trophy: Trophy,
  message: MessageCircle,
  lookout: Binoculars,
  ghost: Ghost,
  search: Search,
  drone: Drone,
  music: Music,
  mic: Mic,
  game: Gamepad2,
  brain: Brain,
  cards: Spade,
  dice: Dices,
  building: Building2,
  chat: MessageCircle,
  drink: Martini,
  balloon: HotAirBalloon,
  train: TrainFront,
  boat: Sailboat,
  seat: Armchair,
  dance: Footprints,
  coins: Coins,
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const iconKey = (q: QuestState | null): QuestIcon => (q ? (QUEST_BY_KEY[q.key]?.icon ?? "game") : "game");

const waiting = (q: QuestState | null) => !!q && q.status === "done" && !!q.action && !q.actionUsed;

/**
 * A small pill for the active side quest: its title, steps done and time left. Glows when a
 * special move is waiting. When a quest has just arrived (or just been finished) it opens up
 * for a few seconds with the news. Renders nothing without a quest.
 */
export function QuestBanner({ quest, onOpen }: { quest: QuestState | null; onOpen: () => void }) {
  const { fresh, finished } = useQuestSnapshot();
  const active = quest?.status === "active";
  const left = useSecondsLeft(quest ? Date.parse(active ? quest.expiresAt : (quest.actionUntil ?? quest.expiresAt)) : null);
  const flash = fresh ?? finished;
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(clearQuestFlash, 7000);
    return () => window.clearTimeout(id);
  }, [flash]);
  if (!quest || (!active && !waiting(quest))) return null;
  const Icon = QUEST_ICONS[iconKey(quest)];
  const done = quest.targets.filter((t, i) => (quest.progress[i] ?? 0) >= t).length;
  return (
    <button
      onClick={() => {
        clearQuestFlash();
        onOpen();
      }}
      className={cn(
        "pointer-events-auto flex max-w-[min(92vw,22rem)] items-center gap-2 rounded-2xl bg-[#18202b]/90 py-1.5 pl-1.5 pr-3 text-left text-white shadow-lg backdrop-blur",
        waiting(quest) && "act-glow",
        flash && "act-pop",
      )}
      aria-label={`Side quest: ${quest.title}`}
    >
      <ActivityStyles />
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", waiting(quest) ? "bg-gold text-ink" : "bg-[#7048e8]")}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        {flash ? (
          <>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-gold">{fresh ? "New side quest!" : "Quest complete!"}</span>
            <span className="block truncate text-sm font-semibold">{fresh ? quest.role : finished?.action ? "Tap to use your special move" : `+${quest.reward} coins`}</span>
          </>
        ) : (
          <>
            <span className="block truncate text-sm font-semibold">{quest.title}</span>
            <span className="block text-[11px] text-white/70">
              {waiting(quest) ? `${ACTION_INFO[quest.action!].label} ready · ${clock(left)}` : `${done}/${quest.targets.length} steps · ${clock(left)} left`}
            </span>
          </>
        )}
      </span>
    </button>
  );
}

/** The quest card: what to do, the steps (with ticks), time left, and the special move. */
export function QuestSheet({
  quest,
  onClose,
  players,
}: {
  quest: QuestState | null;
  onClose: () => void;
  /** Extra people to offer as theft targets (e.g. the people in your place). */
  players?: { id: string; name: string; avatar: unknown }[];
}) {
  const active = quest?.status === "active";
  const left = useSecondsLeft(quest ? Date.parse(active ? quest.expiresAt : (quest.actionUntil ?? quest.expiresAt)) : null);
  const def = quest ? QUEST_BY_KEY[quest.key] : null;
  const Icon = QUEST_ICONS[iconKey(quest)];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuestActionResult | null>(quest?.actionResult ?? null);
  const [picking, setPicking] = useState(false);
  const [targets, setTargets] = useState<StealTarget[] | null>(null);
  const [confirmDrop, setConfirmDrop] = useState(false);

  async function openPicker() {
    setPicking(true);
    setError(null);
    const res = await stealTargets();
    const list = res.ok ? res.players : [];
    const seen = new Set(list.map((p) => p.id));
    for (const p of players ?? []) if (!seen.has(p.id)) list.push({ id: p.id, name: p.name, avatar: p.avatar, bigFish: false, safe: false });
    setTargets(list);
  }

  async function steal(t: StealTarget) {
    setBusy(true);
    setError(null);
    const res = await stealFrom(t.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      playSfx("denied");
      return;
    }
    setResult({ kind: "steal", target: res.target, amount: res.amount });
    setPicking(false);
    playSfx("found");
    refreshQuest();
  }

  async function act() {
    if (!quest?.action || quest.action === "steal") return;
    setBusy(true);
    setError(null);
    const res = await runQuestAction(quest.action);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res.result);
    playSfx("levelup");
    refreshQuest();
  }

  async function drop() {
    setBusy(true);
    await dropQuest();
    setBusy(false);
    setQuest(null);
    onClose();
  }

  return (
    <Sheet onClose={onClose}>
      <ActivityStyles />
      {!quest || !def ? (
        <div className="space-y-3">
          <GameHeader icon={VenetianMask} title="Side quests" onClose={onClose} />
          <p className="text-sm text-muted">
            No side quest right now. Sit down somewhere inside a building or chat with the regulars: they sometimes have a secret job for you.
          </p>
        </div>
      ) : (
        <div className="relative space-y-4">
          {result && <Confetti />}
          <GameHeader icon={Icon} title={quest.title} sub={quest.role} onClose={onClose} color={waiting(quest) ? "#c98a00" : "#7048e8"} />
          <p className="text-sm">{quest.brief}</p>
          {(active || waiting(quest)) && (
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Clock className="size-4 text-muted" />
              {active ? `${clock(left)} left to finish` : `${clock(left)} left to use your special move`}
            </p>
          )}
          <ol className="space-y-2">
            {def.steps.map((s, i) => {
              const value = quest.progress[i] ?? 0;
              const target = quest.targets[i] ?? 1;
              const ok = value >= target;
              return (
                <li key={i} className="rounded-2xl bg-panel-2 p-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", ok ? "bg-me text-white" : "bg-white text-muted ring-1 ring-line")}>
                      {ok ? <Check className="size-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                    </span>
                    <span className={cn("flex-1 text-sm font-semibold", ok && "text-muted line-through")}>{stepLabel(s)}</span>
                    <span className="text-xs tabular-nums text-muted">{stepProgressText(s, value)}</span>
                  </div>
                  {!ok && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-[#7048e8] transition-all" style={{ width: `${Math.min(100, (value / target) * 100)}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="flex items-center gap-1.5 text-sm">
            <Coins className="size-4 text-gold-dark" />
            {quest.reward > 0 ? `Reward: ${quest.reward} coins` : "No coins for this one"}
            {quest.action ? ` + ${ACTION_INFO[quest.action].label.toLowerCase()}` : ""}
            {quest.status === "done" && <b className="ml-auto text-me">Done!</b>}
          </p>

          {quest.action && (waiting(quest) || result) && (
            <div className="space-y-2 rounded-2xl border-2 border-gold p-3">
              <p className="flex items-center gap-1.5 font-semibold">
                <Zap className="size-4 text-gold-dark" /> Special move: {ACTION_INFO[quest.action].label}
              </p>
              {result ? (
                <ActionResult result={result} />
              ) : (
                <>
                  <p className="text-sm text-muted">{ACTION_INFO[quest.action].about}</p>
                  {quest.action === "steal" ? (
                    picking ? (
                      <StealPicker targets={targets} busy={busy} onPick={(t) => void steal(t)} />
                    ) : (
                      <BigButton tone="gold" onClick={() => void openPicker()}>
                        <VenetianMask className="size-4" /> {ACTION_INFO.steal.button}
                      </BigButton>
                    )
                  ) : (
                    <BigButton tone="gold" onClick={() => void act()} disabled={busy}>
                      <Zap className="size-4" /> {busy ? "One moment…" : ACTION_INFO[quest.action].button}
                    </BigButton>
                  )}
                </>
              )}
            </div>
          )}
          {error && <p className="act-pop rounded-2xl bg-hit/10 px-3 py-2 text-sm font-semibold text-hit">{error}</p>}
          {active &&
            (confirmDrop ? (
              <div className="flex gap-2">
                <BigButton tone="soft" onClick={() => setConfirmDrop(false)}>
                  Keep going
                </BigButton>
                <BigButton onClick={() => void drop()} disabled={busy}>
                  Drop it
                </BigButton>
              </div>
            ) : (
              <button onClick={() => setConfirmDrop(true)} className="w-full text-center text-xs text-muted underline">
                Drop this quest
              </button>
            ))}
        </div>
      )}
    </Sheet>
  );
}

function StealPicker({ targets, busy, onPick }: { targets: StealTarget[] | null; busy: boolean; onPick: (t: StealTarget) => void }) {
  const [q, setQ] = useState("");
  if (!targets) return <p className="act-pulse text-sm text-muted">Looking for marks…</p>;
  const shown = targets.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40);
  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a player" className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-ink" />
      {shown.length === 0 ? (
        <p className="text-sm text-muted">Nobody to rob right now. Try again when more people are playing.</p>
      ) : (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto">
          {shown.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onPick(t)}
                disabled={busy || t.safe}
                className="flex w-full items-center gap-2 rounded-xl bg-panel-2 px-2 py-1.5 text-left hover:bg-gold/20 disabled:opacity-50"
              >
                <Face p={t} size={30} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.name}</span>
                {t.bigFish && (
                  <span className="rounded-full bg-[#0b7285]/15 px-2 py-0.5 text-[11px] font-semibold text-[#0b7285]" title={`Over ${BIG_FISH_COINS.toLocaleString("en")} coins`}>
                    Big fish
                  </span>
                )}
                {t.safe ? <span className="text-[11px] text-muted">Safe today</span> : <VenetianMask className="size-4 text-muted" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionResult({ result }: { result: QuestActionResult }) {
  const roundId = "roundId" in result ? result.roundId : null;
  const plan = useMemo(() => (roundId != null ? makePlan(roundId) : null), [roundId]);
  const where = (tile: number) => (plan ? addressOf(plan, tileAt(plan, tile)) : `spot ${tile}`);
  switch (result.kind) {
    case "steal":
      return (
        <p className="act-pop text-sm font-semibold">
          You swiped {result.amount} coins from {result.target}! They know it was you, so watch your back.
        </p>
      );
    case "ghost_near":
      return (
        <p className="act-pop text-sm font-semibold">
          Psst: a ghost is hiding within {result.radius} spots of <b>{where(result.tile)}</b>. Go get them!
        </p>
      );
    case "hunters_near":
      return (
        <p className="act-pop text-sm font-semibold">
          Heads up: hunters have been searching around <b>{where(result.tile)}</b>. Stay away from there!
        </p>
      );
    case "spy":
      return (
        <div className="act-pop space-y-1 text-sm">
          <p className="font-semibold">{result.name}&apos;s latest searches (newest first):</p>
          <ol className="list-decimal pl-5">
            {(result.tiles ?? []).map((t, i) => (
              <li key={i}>{where(t)}</li>
            ))}
          </ol>
        </div>
      );
    case "free_search":
      return <p className="act-pop text-sm font-semibold">Done! Your next search is free.</p>;
    case "free_move":
      return <p className="act-pop text-sm font-semibold">Done! You have one extra move this game.</p>;
  }
}
