"use client";

import { announceGiftSent } from "./gift-pop";
import { rememberPerson } from "./recent-rail";
import { GenderMark } from "./people-list";
import { setGender } from "../people-actions";
import { useEffect, useState } from "react";
import { BellRing, Car, DoorClosed, Gift, House, Lightbulb, MapPin, MessageCircle, StickyNote, UserPlus } from "lucide-react";
import { Star } from "@/components/icons";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { myThings, type MyItem } from "../item-actions";
import { leaveAtDoor, playerCard, type PlayerCardData } from "../people-actions";
import { Sheet } from "../sheet";
import type { Prices } from "@/lib/world/region";
import { DatingRow, StreetRow } from "./street-dating";

// Anyone's card on the real map (docs/PEOPLE.md): who they are, where they live, their job, car,
// inventions, friends and reputation; knock on their door, leave a note or a wrapped gift, add
// them as a friend, and the Hug / Shake / Report buttons.

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
}) {
  const [card, setCard] = useState<PlayerCardData | null | undefined>(undefined);
  const [mode, setMode] = useState<"note" | "gift" | null>(null);
  const [note, setNote] = useState("");
  const [things, setThings] = useState<MyItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void playerCard(id).then((c) => {
      if (!alive) return;
      setCard(c);
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
  const leave = async (kind: "knock" | "note" | "gift", itemId?: number, itemName?: string) => {
    if (!card) return;
    setBusy(true);
    const r = await leaveAtDoor(card.id, kind, kind === "gift" ? note : kind === "note" ? note : undefined, itemId);
    setBusy(false);
    if (!r.ok) return onDone(r.error, false);
    setMode(null);
    setNote("");
    rememberPerson(card, kind === "knock" ? "Knocked" : kind === "note" ? "Left a note" : "Gave a gift");
    if (kind === "gift") announceGiftSent(card.name, itemName ?? "Your gift");
    onDone(kind === "knock" ? `You knocked on ${card.name}'s door.` : kind === "note" ? `Note left for ${card.name}.` : `${itemName ?? "Your gift"} is wrapped and waiting at ${card.name}'s door.`, true);
  };
  return (
    <Sheet onClose={onClose} clear>
      {card === undefined ? (
        <div className="h-40 animate-pulse rounded-2xl bg-ink/5" />
      ) : card === null ? (
        <p className="py-6 text-center text-sm text-muted">We couldn&apos;t find them.</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <AvatarFace avatar={cleanAvatar(card.avatar, card.name)} size={56} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-xl font-extrabold">{card.name}</h2>
              {card.gender ? <GenderMark gender={card.gender} /> : self && <GenderPick />}
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span className={`size-2 rounded-full ${card.online ? "bg-me" : "bg-ink/25"}`} />
                {card.online ? "Here now" : card.seenAt ? `Last here ${ago(Date.now() - Date.parse(card.seenAt))}` : "Not seen lately"}
                <span className="ml-1 inline-flex items-center gap-0.5 font-semibold text-gold-dark">
                  <Star className="size-3" /> {card.reputation}
                </span>
              </p>
            </div>
          </div>
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
            {card.inventions.length > 0 && (
              <li className="flex items-start gap-2">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted" /> Invented {card.inventions.map((k) => `${k.name}${k.sold ? ` (${k.sold} sold)` : ""}`).join(", ")}
              </li>
            )}
            {card.friends.length > 0 && <li className="text-xs text-muted">Friends with {card.friends.map((f) => f.name).join(", ")}</li>}
          </ul>

          {card.home && !card.blocked && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button disabled={busy} onClick={() => void leave("knock")} className="flex flex-col items-center gap-1 rounded-2xl bg-ink/[0.05] py-2.5 text-xs font-semibold disabled:opacity-40">
                <DoorClosed className="size-5" /> Knock
              </button>
              <button onClick={() => setMode(mode === "note" ? null : "note")} className={`flex flex-col items-center gap-1 rounded-2xl py-2.5 text-xs font-semibold ${mode === "note" ? "bg-ink text-white" : "bg-ink/[0.05]"}`}>
                <StickyNote className="size-5" /> Note
              </button>
              <button onClick={() => setMode(mode === "gift" ? null : "gift")} className={`flex flex-col items-center gap-1 rounded-2xl py-2.5 text-xs font-semibold ${mode === "gift" ? "bg-ink text-white" : "bg-ink/[0.05]"}`}>
                <Gift className="size-5" /> Gift
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
                <p className="text-xs text-muted">You have nothing to give yet. Buy something from the Shops on your phone.</p>
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

          {!self && !card.blocked && <DatingRow id={card.id} name={card.name} onDone={onDone} onOpenDating={() => onOpenDating?.()} />}
          {!self && !card.blocked && <StreetRow id={card.id} name={card.name} hasHome={!!card.home} prices={prices ?? null} onDone={onDone} />}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!self && !card.blocked && onMessage && (
              <button onClick={() => onMessage({ id: card.id, name: card.name })} className="flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white">
                <MessageCircle className="size-3.5" /> Message
              </button>
            )}
            {greet({ id: card.id, name: card.name })}
            {!card.friend && onAddFriend && (
              <button onClick={() => onAddFriend({ id: card.id, name: card.name })} className="flex items-center gap-1 rounded-full bg-[#d6336c]/10 px-2.5 py-1.5 text-xs font-semibold text-[#d6336c]">
                <UserPlus className="size-3.5" /> Add friend
              </button>
            )}
            {card.friend && <span className="rounded-full bg-[#d6336c]/10 px-2.5 py-1.5 text-xs font-semibold text-[#d6336c]">Friends</span>}
          </div>
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

/** Your own card, before you've said: man or woman (shown on your card and in the lists). */
function GenderPick() {
  const [done, setDone] = useState<string | null>(null);
  if (done) return <p className="text-[11px] font-semibold text-me">{done}</p>;
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted">
      I am a
      {(
        [
          ["male", "man"],
          ["female", "woman"],
        ] as const
      ).map(([g, label]) => (
        <button key={g} onClick={() => void setGender(g).then((r) => setDone(r.ok ? "Saved" : r.error))} className="rounded-full bg-ink/5 px-2 py-0.5 font-semibold text-ink">
          {label}
        </button>
      ))}
    </p>
  );
}
