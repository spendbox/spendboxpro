"use client";

import { announceGiftSent } from "./gift-pop";
import { rememberPerson } from "./recent-rail";
import { GenderMark } from "./people-list";
import { setGender } from "../people-actions";
import { useEffect, useState } from "react";
import { Banknote, BellRing, Car, Dices, Gift, House, MapPin, MessageCircle, StickyNote, UserPlus } from "lucide-react";
import { Star, X } from "@/components/icons";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { myThings, type MyItem } from "../item-actions";
import { LIFE_BADGE_BY_ID, badgeName } from "@/lib/world/life-badges";
import { leaveAtDoor, type PlayerCardData } from "../people-actions";
import { cachedCard, cardPreview, forgetCard, loadCard } from "./card-cache";
import { Sheet } from "../sheet";
import type { Prices } from "@/lib/world/region";
import { DatingRow, StreetRow } from "./street-dating";

// Anyone's card on the real map (docs/PEOPLE.md): who they are (with Add friend by their name),
// Message and Give money up top, Hug / Shake / Report, a game against them (coming soon), where
// they live, their job, car, inventions and friends; a note or a wrapped gift at their door,
// dating, and the Rival box (prank, steal).

export function PersonCard({
  id,
  onClose,
  onFly,
  onAddFriend,
  greet,
  onDone,
  self,
  prices,
  onOpenDating,
  onMessage,
  onGive,
}: {
  id: string;
  onClose: () => void;
  /** Fly the camera to a spot (their home). */
  onFly: (x: number, z: number) => void;
  onAddFriend?: (p: { id: string; name: string }) => void;
  /** Hug, Shake and Report for them. */
  greet: (p: { id: string; name: string }) => React.ReactNode;
  onDone: (text: string, ok: boolean) => void;
  /** Your own card: no stealing from or dating yourself. */
  self?: boolean;
  /** The city's prices (what pranks and fines cost). */
  prices?: Prices | null;
  /** Open Dating on your phone (to switch it on). */
  onOpenDating?: () => void;
  /** Send them a private message (the chat). */
  onMessage?: (p: { id: string; name: string }) => void;
  /** Give them money. */
  onGive?: (p: { id: string; name: string; avatar: unknown }) => void;
}) {
  // Shown at once: the card from last time (brought up to date behind it), or else their face and
  // name from what's already known while the rest loads (./card-cache).
  const [card, setCard] = useState<PlayerCardData | null | undefined>(() => cachedCard(id)?.card);
  const [preview] = useState(() => cardPreview(id));
  const [mode, setMode] = useState<"note" | "gift" | null>(null);
  const [note, setNote] = useState("");
  const [things, setThings] = useState<MyItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadCard(id).then((c) => {
      if (!alive) return;
      // A failed refresh keeps what's showing.
      setCard((was) => c ?? (was === undefined ? null : was));
      if (c && !self) rememberPerson(c, "Looked them up");
    });
    return () => {
      alive = false;
    };
  }, [id, self]);
  useEffect(() => {
    if (mode !== "gift" || things) return;
    void myThings().then((t) => setThings((t?.items ?? []).filter((i) => i.listPrice == null)));
  }, [mode, things]);
  const leave = async (kind: "note" | "gift", itemId?: number, itemName?: string) => {
    if (!card) return;
    setBusy(true);
    const r = await leaveAtDoor(card.id, kind, note, itemId);
    setBusy(false);
    if (!r.ok) return onDone(r.error, false);
    forgetCard(card.id);
    setMode(null);
    setNote("");
    rememberPerson(card, kind === "note" ? "Left a note" : "Gave a gift");
    if (kind === "gift") announceGiftSent(card.name, itemName ?? "Your gift");
    onDone(kind === "note" ? `Note left for ${card.name}.` : `${itemName ?? "Your gift"} is wrapped and waiting at ${card.name}'s door.`, true);
  };
  const canAct = !!card && !self && !card.blocked;
  return (
    <Sheet onClose={onClose} above centred>
      {card === undefined ? (
        preview ? (
          <>
            <div className="flex items-start gap-3 pr-8">
              <span className="relative shrink-0">
                <AvatarFace avatar={cleanAvatar(preview.avatar, preview.name)} size={64} />
                {preview.online && <span className="absolute bottom-0.5 right-0.5 size-3.5 rounded-full bg-[#2f9e44] ring-2 ring-panel" aria-label="Online" />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="min-w-0 truncate font-display text-xl font-extrabold">{preview.name}</h2>
                <p className="mt-0.5 text-xs text-muted">{preview.online ? <span className="font-semibold text-[#2f9e44]">Online</span> : "\u00a0"}</p>
              </div>
            </div>
            <button onClick={onClose} className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-ink/5 hover:bg-ink/10" aria-label="Close">
              <X className="size-4" />
            </button>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="h-12 animate-pulse rounded-2xl bg-ink/5" />
              <div className="h-12 animate-pulse rounded-2xl bg-ink/5" />
            </div>
            <div className="mt-3 h-20 animate-pulse rounded-2xl bg-ink/5" />
          </>
        ) : (
          <div className="h-40 animate-pulse rounded-2xl bg-ink/5" />
        )
      ) : card === null ? (
        <p className="py-6 text-center text-sm text-muted">We couldn&apos;t find them.</p>
      ) : (
        <>
          {/* Who: face, name (Add friend right beside it), online, reputation. */}
          <div className="flex items-start gap-3 pr-8">
            <span className="relative shrink-0">
              <AvatarFace avatar={cleanAvatar(card.avatar, card.name)} size={64} />
              {card.online && <span className="absolute bottom-0.5 right-0.5 size-3.5 rounded-full bg-[#2f9e44] ring-2 ring-panel" aria-label="Online" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="min-w-0 truncate font-display text-xl font-extrabold">{card.name}</h2>
                {!self && !card.friend && onAddFriend && (
                  <button onClick={() => { forgetCard(card.id); onAddFriend({ id: card.id, name: card.name }); }} className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-[#d6336c] px-2.5 text-[11px] font-bold text-white shadow-sm">
                    <UserPlus className="size-3.5" /> Add friend
                  </button>
                )}
                {!self && card.friend && <span className="flex h-7 shrink-0 items-center rounded-full bg-[#d6336c]/10 px-2.5 text-[11px] font-bold text-[#d6336c]">Friends ✓</span>}
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                {card.gender ? <GenderMark gender={card.gender} /> : self && <GenderPick />}
                {card.online ? (
                  <span className="font-semibold text-[#2f9e44]">Online</span>
                ) : (
                  <span>{card.seenAt ? `Last seen ${ago(Date.now() - Date.parse(card.seenAt))}` : "Not seen lately"}</span>
                )}
                <span className="inline-flex items-center gap-0.5 font-semibold text-gold-dark">
                  <Star className="size-3" /> {card.reputation}
                </span>
              </p>
              {/* The badges they chose to show (docs/LIFE_WHEEL.md); cards cached from before have none. */}
              {(card.lifeBadges ?? []).some((b) => LIFE_BADGE_BY_ID.has(b)) && (
                <p className="mt-1 flex flex-wrap gap-1">
                  {(card.lifeBadges ?? [])
                    .filter((b) => LIFE_BADGE_BY_ID.has(b))
                    .map((b) => {
                      const def = LIFE_BADGE_BY_ID.get(b)!;
                      return (
                        <span key={b} className="rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-semibold" title={def.about}>
                          {def.emoji} {badgeName(def, card.region ?? "lagos")}
                        </span>
                      );
                    })}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-ink/5 hover:bg-ink/10" aria-label="Close">
            <X className="size-4" />
          </button>

          {/* The main things to do: big and obvious. */}
          {canAct && (onMessage || onGive) && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {onMessage && (
                <button onClick={() => onMessage({ id: card.id, name: card.name })} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#7048e8] text-sm font-bold text-white shadow">
                  <MessageCircle className="size-5" /> Message
                </button>
              )}
              {onGive && (
                <button onClick={() => onGive({ id: card.id, name: card.name, avatar: card.avatar })} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#12a37a] text-sm font-bold text-white shadow">
                  <Banknote className="size-5" /> Give money
                </button>
              )}
            </div>
          )}
          {!self && <div className="mt-2 flex flex-wrap items-center gap-2">{greet({ id: card.id, name: card.name })}</div>}

          {/* Play a game against them: Whot!, Truth or Dare, Impostor (src/app/play/fight/whot-invite.tsx). */}
          {canAct && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#7048e8]/[0.07] p-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#7048e8] text-white">
                <Dices className="size-5" />
              </span>
              <p className="min-w-0 flex-1 text-sm">
                <b>Play a game with {card.name}</b>
                <span className="block text-xs text-muted">For a stake: Whot!, Truth or Dare, Impostor.</span>
              </p>
              <span className="flex shrink-0 gap-1">
                {[
                  ["whot", "🃏", "Whot!"],
                  ["truth_dare", "🍾", "Truth or Dare"],
                  ["impostor", "🕵️", "Impostor"],
                ].map(([game, icon, label]) => (
                  <button
                    key={game}
                    onClick={() => window.dispatchEvent(new CustomEvent("nt-play-game", { detail: { game, id: card.id, name: card.name, avatar: card.avatar } }))}
                    className="grid size-9 place-items-center rounded-full bg-[#7048e8] text-base shadow"
                    aria-label={`Play ${label}`}
                    title={label}
                  >
                    {icon}
                  </button>
                ))}
              </span>
            </div>
          )}

          {/* About them. */}
          <ul className="mt-3 space-y-1.5 text-sm">
            {card.home && (
              <li className="flex items-center gap-2">
                <House className="size-4 shrink-0 text-muted" /> Lives in {card.home.area}
                <button onClick={() => onFly(card.home!.x, card.home!.z)} className="ml-auto text-xs font-semibold text-gold-dark">
                  <MapPin className="mr-0.5 inline size-3" /> Show
                </button>
              </li>
            )}
            {card.job && (
              <li className="flex items-center gap-2">
                <BellRing className="size-4 shrink-0 text-muted" /> {card.job.title}, {card.job.place}
              </li>
            )}
            {card.car && (
              <li className="flex items-center gap-2">
                <Car className="size-4 shrink-0 text-muted" /> Drives a {card.car}
              </li>
            )}
            {card.friends.length > 0 && <li className="text-xs text-muted">Friends with {card.friends.map((f) => f.name).join(", ")}</li>}
          </ul>

          {/* Leave something at their door. */}
          {card.home && canAct && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => setMode(mode === "note" ? null : "note")} className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold ${mode === "note" ? "bg-ink text-white" : "bg-ink/[0.05]"}`}>
                <StickyNote className="size-4" /> Leave a note
              </button>
              <button onClick={() => setMode(mode === "gift" ? null : "gift")} className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold ${mode === "gift" ? "bg-ink text-white" : "bg-ink/[0.05]"}`}>
                <Gift className="size-4" /> Send a gift
              </button>
            </div>
          )}
          {mode && (
            <div className="mt-2 space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={280}
                rows={2}
                placeholder={mode === "note" ? `A note for ${card.name}…` : "A message with it (optional)"}
                className="w-full rounded-2xl bg-ink/5 px-4 py-2.5 text-sm outline-none ring-ink/20 focus:ring-2"
              />
              {mode === "note" ? (
                <button disabled={busy || !note.trim()} onClick={() => void leave("note")} className="h-10 w-full rounded-full bg-ink text-sm font-semibold text-white disabled:opacity-40">
                  Leave it at their door
                </button>
              ) : things === null ? (
                <div className="h-16 animate-pulse rounded-2xl bg-ink/5" />
              ) : things.length === 0 ? (
                <p className="text-xs text-muted">You have nothing to give yet. Buy something from Shops (tap your face, top left).</p>
              ) : (
                <ul className="max-h-48 divide-y divide-ink/5 overflow-y-auto rounded-2xl ring-1 ring-ink/5">
                  {things.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm">{i.name}</span>
                      <button disabled={busy} onClick={() => void leave("gift", i.id, i.name)} className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40">
                        Wrap and leave
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {canAct && <DatingRow id={card.id} name={card.name} onDone={onDone} onOpenDating={() => onOpenDating?.()} />}
          {canAct && <StreetRow id={card.id} name={card.name} hasHome={!!card.home} prices={prices ?? null} onDone={onDone} />}
        </>
      )}
    </Sheet>
  );
}

export function ago(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}

/** Your own card, before you've said: male or female (shown on your card and in the lists). */
function GenderPick() {
  const [done, setDone] = useState<string | null>(null);
  if (done) return <p className="text-[11px] font-semibold text-me">{done}</p>;
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted">
      I am
      {(
        [
          ["male", "Male"],
          ["female", "Female"],
        ] as const
      ).map(([g, label]) => (
        <button key={g} onClick={() => void setGender(g).then((r) => setDone(r.ok ? "Saved" : r.error))} className="rounded-full bg-ink/5 px-2 py-0.5 font-semibold text-ink">
          {label}
        </button>
      ))}
    </p>
  );
}
