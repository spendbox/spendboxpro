"use client";

import { useEffect, useState } from "react";
import { DoorClosed, Gift, Heart, StickyNote, Zap } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cash } from "@/lib/world/value";
import { awayDigest, dropPush, myDoorstep, openDoorstep, savePush, thankDoorstep, type AwayDigest, type DoorstepEntry } from "../people-actions";
import { Sheet } from "../sheet";
import { cleanPrank } from "../street-actions";
import { prankOf } from "@/lib/world/street";
import { ago } from "./person-card";

// Your doorstep (who knocked, notes, wrapped gifts to open, thank-yous), "while you were away"
// when you come back, and turning notifications on. docs/PEOPLE.md.

const ICON = { knock: DoorClosed, note: StickyNote, gift: Gift, prank: Zap };

/** Everything left at your door: open the gifts, say thanks, see who it was from. */
export function DoorstepSheet({ onClose, onPerson, onDone }: { onClose: () => void; onPerson: (id: string) => void; onDone: (text: string, ok: boolean) => void }) {
  const [list, setList] = useState<DoorstepEntry[] | null>(null);
  const load = () => void myDoorstep().then(setList);
  useEffect(load, []);
  const open = async (d: DoorstepEntry) => {
    await openDoorstep(d.id);
    setList((l) => l?.map((x) => (x.id === d.id ? { ...x, opened: true } : x)) ?? null);
  };
  return (
    <Sheet onClose={onClose} title="Your doorstep">
      {list === null ? (
        <div className="h-32 animate-pulse rounded-2xl bg-ink/5" />
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nobody has come by yet. Knock on a neighbour&apos;s door: tap a face on the map.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((d) => {
            const Icon = ICON[d.kind];
            const wrapped = d.kind === "gift" && !d.opened;
            return (
              <li key={d.id} className={`rounded-2xl p-3 ${d.opened ? "bg-ink/[0.03]" : "bg-gold/10 ring-1 ring-gold/30"}`}>
                <div className="flex items-start gap-2.5">
                  <button onClick={() => d.from && onPerson(d.from)} className="shrink-0" aria-label={`${d.fromName}'s card`}>
                    <AvatarFace avatar={cleanAvatar(d.fromAvatar, d.fromName)} size={36} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <Icon className="size-4 shrink-0" />
                      {d.kind === "prank" ? `${prankOf(d.prank)?.emoji ?? ""} ${d.fromName} ${prankOf(d.prank)?.did ?? "pranked your door"}!` : d.kind === "knock" ? `${d.fromName} knocked` : d.kind === "note" ? `A note from ${d.fromName}` : wrapped ? `A wrapped gift from ${d.fromName}` : `${d.fromName} gave you ${d.item ?? "a gift"}`}
                    </p>
                    {d.body && (!wrapped || d.kind !== "gift") && <p className="mt-0.5 text-sm">&ldquo;{d.body}&rdquo;</p>}
                    <p className="mt-0.5 text-[11px] text-muted">{ago(Date.now() - Date.parse(d.at))}</p>
                    <div className="mt-1.5 flex gap-2">
                      {wrapped && (
                        <button onClick={() => void open(d)} className="h-8 rounded-full bg-gold px-3 text-xs font-semibold text-ink">
                          Open it
                        </button>
                      )}
                      {d.kind === "prank" && !d.cleaned && (
                        <button
                          onClick={() =>
                            void cleanPrank(d.id).then((r) => {
                              if (r.ok) setList((l) => l?.map((x) => (x.id === d.id ? { ...x, cleaned: true, opened: true } : x)) ?? null);
                              onDone(r.ok ? r.text : r.error, r.ok);
                            })
                          }
                          className="h-8 rounded-full bg-ink/10 px-3 text-xs font-semibold"
                        >
                          Clean it up
                        </button>
                      )}
                      {d.kind === "prank" && d.from && (
                        <button onClick={() => onPerson(d.from!)} className="h-8 rounded-full bg-[#e8590c]/10 px-3 text-xs font-semibold text-[#e8590c]">
                          Prank them back
                        </button>
                      )}
                      {d.kind === "prank" && d.cleaned && <span className="self-center text-[11px] text-muted">Cleaned</span>}
                      {d.kind !== "prank" && !wrapped && d.from && !d.thanked && (
                        <button
                          onClick={() =>
                            void thankDoorstep(d.id).then((r) => {
                              if (r.ok) setList((l) => l?.map((x) => (x.id === d.id ? { ...x, thanked: true } : x)) ?? null);
                              onDone(r.ok ? `${d.fromName} hears your thanks.` : r.error, r.ok);
                            })
                          }
                          className="flex h-8 items-center gap-1 rounded-full bg-[#ffe3ec] px-3 text-xs font-semibold text-[#d6336c]"
                        >
                          <Heart className="size-3.5" /> Say thanks
                        </button>
                      )}
                      {d.thanked && <span className="text-[11px] font-semibold text-me">Thanked</span>}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <button onClick={() => void openDoorstep().then(load)} className="mt-3 w-full text-center text-xs font-semibold text-muted">
        Mark everything seen
      </button>
    </Sheet>
  );
}

const EARN: Record<string, string> = { work_pay: "Job", public_pay: "Job", hustle_pay: "Side hustles", rent: "Rent", item_sale: "Things sold", car_sale: "Cars sold", property_sale: "Property sold", bonus: "Bonuses" };

/** While you were away: shown once when you come back, if anything happened. */
export function useAwayDigest(enabled: boolean) {
  const [digest, setDigest] = useState<AwayDigest | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => {
      void awayDigest().then((d) => {
        if (!d) return;
        // Only worth a screen after a while away, with something in it.
        const away = Date.now() - Date.parse(d.since);
        const earned = Object.entries(d.money).filter(([k, v]) => EARN[k] && v > 0).length;
        if (away > 45 * 60_000 && (d.doorstep.length || d.notices.length || earned)) setDigest(d);
      });
    }, 2500);
    return () => clearTimeout(t);
  }, [enabled]);
  return { digest, close: () => setDigest(null) };
}

export function AwaySheet({ digest, onDoorstep, onClose }: { digest: AwayDigest; onDoorstep: () => void; onClose: () => void }) {
  const earned = Object.entries(digest.money).filter(([k, v]) => EARN[k] && v > 0);
  const byLabel = new Map<string, number>();
  for (const [k, v] of earned) byLabel.set(EARN[k], (byLabel.get(EARN[k]) ?? 0) + v);
  const total = [...byLabel.values()].reduce((t, v) => t + v, 0);
  const gifts = digest.doorstep.filter((d) => d.kind === "gift").length;
  return (
    <Sheet onClose={onClose} title="While you were away">
      <p className="text-xs text-muted">Since {ago(Date.now() - Date.parse(digest.since))}</p>
      {digest.doorstep.length > 0 && (
        <button onClick={onDoorstep} className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-gold/10 p-3 text-left ring-1 ring-gold/30">
          <DoorClosed className="size-6 shrink-0 text-gold-dark" />
          <span className="min-w-0 flex-1 text-sm">
            <b>{digest.doorstep.length} at your door</b>
            {gifts ? `, ${gifts} wrapped gift${gifts === 1 ? "" : "s"}` : ""}. From {[...new Set(digest.doorstep.map((d) => d.fromName))].slice(0, 3).join(", ")}.
          </span>
          <span className="text-xs font-semibold text-gold-dark">See →</span>
        </button>
      )}
      {total > 0 && (
        <div className="mt-3 rounded-2xl bg-me/10 p-3">
          <p className="text-sm font-semibold">You earned {cash(total)}</p>
          <p className="text-xs text-muted">{[...byLabel.entries()].map(([k, v]) => `${k} ${cash(v)}`).join(" · ")}</p>
        </div>
      )}
      {digest.notices.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {digest.notices.slice(0, 8).map((n, k) => (
            <li key={k} className="rounded-xl bg-ink/[0.04] px-3 py-2 text-sm">
              {n.body}
              <span className="ml-1 text-[11px] text-muted">{ago(Date.now() - Date.parse(n.at))}</span>
            </li>
          ))}
        </ul>
      )}
      <button onClick={onClose} className="mt-4 h-11 w-full rounded-full bg-ink font-semibold text-white">
        Back to the city
      </button>
    </Sheet>
  );
}

/** Turn notifications on for this phone or browser (someone's at your door, a gift, a sale). */
export async function turnOnNotifications(): Promise<{ ok: boolean; text: string }> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return { ok: false, text: "Notifications aren't set up on the server yet." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return { ok: false, text: "This browser can't take notifications. On iPhone, add the game to your home screen first." };
  const allowed = await Notification.requestPermission();
  if (allowed !== "granted") return { ok: false, text: "Notifications are off. You can allow them in your browser's settings." };
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const raw = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw }));
  const r = await savePush(JSON.parse(JSON.stringify(sub)));
  return r.ok ? { ok: true, text: "Notifications on: we'll tell you when someone's at your door." } : { ok: false, text: r.error };
}

/** Is this phone or browser getting notifications right now (allowed, and subscribed)? */
export async function notificationsOn(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
    if (Notification.permission !== "granted") return false;
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    return !!(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/** Turn notifications off for this phone or browser (the bell, tapped again). */
export async function turnOffNotifications(): Promise<{ ok: boolean; text: string }> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await dropPush(sub.endpoint);
      await sub.unsubscribe();
    }
    return { ok: true, text: "Notifications off. Tap the bell to turn them back on." };
  } catch {
    return { ok: false, text: "Couldn't turn notifications off just now. Try again." };
  }
}
