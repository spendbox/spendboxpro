"use client";

import { useEffect, useRef, useState } from "react";
import { MASQ_MODES, MASQ_SPICE } from "@/lib/masquerade";
import { createClient } from "@/lib/supabase/client";
import type { MasqInvite } from "@/app/api/masquerade/route";
import { whileHere } from "./activity";
import { Mask } from "./masq-icon";
import { loadMasqPrefs, onMasqPrefs, setMasqOpenSwitch } from "./masq-open";
import { OnTopPage } from "./on-top";

// Open to Masquerade (docs/MASQUERADE.md): while it's on, the phone says so once a minute (and
// whenever the choices change), and listens on its own live channel. Someone masks up and you fit:
// "A masked guest wants to talk", 20 seconds to say yes. Works over the world and over Lite.

const NIGHT = "#17112b";
const PANEL = "#2b2050";
const GOLD = "#ffc53d";

type OpenReply = { ok: boolean; error?: string; channel?: string; invite?: MasqInvite | null };
const post = (body: Record<string, unknown>) =>
  fetch("/api/masquerade", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json() as Promise<OpenReply & { id?: number | null }>)
    .catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));

export function MasqInvites({
  region,
  where,
  paused,
  onAccepted,
  onMessage,
}: {
  region: string;
  where: () => { x: number; z: number } | null;
  /** Masquerade's own page is open (no pop-ups over it). */
  paused: boolean;
  /** Said yes: open Masquerade (it goes straight into the new one). */
  onAccepted: () => void;
  onMessage: (text: string) => void;
}) {
  const [invite, setInvite] = useState<(MasqInvite & { until: number }) | null>(null);
  const [channel, setChannel] = useState<string | null>(null);
  const whereRef = useRef(where);
  const said = useRef(onMessage);
  useEffect(() => {
    whereRef.current = where;
    said.current = onMessage;
  });

  const show = (i: MasqInvite | null | undefined) => {
    if (!i || i.seconds <= 2) return;
    setInvite((was) => (was?.id === i.id ? was : { ...i, until: Date.now() + i.seconds * 1000 }));
    if (navigator.vibrate) navigator.vibrate([60, 60, 60]);
  };
  const showRef = useRef(show);
  useEffect(() => {
    showRef.current = show;
  });

  // Once a minute while the game's open (and when the choices change): "still open to it".
  useEffect(() => {
    if (paused) return;
    let alive = true;
    const ping = async () => {
      const at = whereRef.current() ?? { x: 0, z: 0 };
      const p = loadMasqPrefs();
      const r = await post({ action: "open", on: true, ...p, region, x: at.x, z: at.z });
      if (!alive) return;
      if (!r.ok) {
        // Dating switched off since, or Masquerade not on yet: the switch goes off.
        setMasqOpenSwitch(false);
        if (r.error) said.current(r.error);
        return;
      }
      if (r.channel) setChannel(r.channel);
      showRef.current(r.invite);
    };
    void ping();
    const stop = whileHere(() => void ping(), 60_000);
    const unsub = onMasqPrefs(() => void ping());
    return () => {
      alive = false;
      stop();
      unsub();
    };
  }, [paused, region]);

  // Being asked: the server tells this phone at once.
  useEffect(() => {
    if (!channel) return;
    const supabase = createClient();
    const ch = supabase.channel(channel, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "asked" }, ({ payload }) => showRef.current(payload as MasqInvite)).subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [channel]);

  if (!invite || paused) return null;
  return (
    <InvitePopup
      key={invite.id}
      invite={invite}
      onAnswer={async (yes) => {
        setInvite(null);
        const r = await post({ action: "answer", invite: invite.id, yes });
        if (!yes) return;
        if (r.ok && r.id) onAccepted();
        else said.current(r.error ?? "Too late: they found someone else. You'll be asked again.");
      }}
      onOff={() => {
        setInvite(null);
        void post({ action: "answer", invite: invite.id, yes: false });
        setMasqOpenSwitch(false);
        void post({ action: "open", on: false });
        said.current("Open to Masquerade is off. Switch it on again in Masquerade.");
      }}
    />
  );
}

function InvitePopup({ invite, onAnswer, onOff }: { invite: MasqInvite & { until: number }; onAnswer: (yes: boolean) => void; onOff: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Math.ceil((invite.until - now) / 1000));
  const answer = useRef(onAnswer);
  useEffect(() => {
    answer.current = onAnswer;
  });
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  // Nobody answered: it goes to the next person (said as a "not now").
  useEffect(() => {
    if (left === 0) answer.current(false);
  }, [left]);

  const mode = MASQ_MODES.find((m) => m.mode === invite.mode) ?? MASQ_MODES[0];
  const spice = MASQ_SPICE[Math.max(0, Math.min(3, invite.spice))];
  const total = Math.max(1, invite.seconds);
  return (
    <OnTopPage role="alertdialog" aria-label="A masked guest wants to talk" className="pointer-events-none fixed inset-x-0 top-0 flex justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="toast-in pointer-events-auto w-full max-w-sm overflow-hidden rounded-3xl text-white shadow-2xl ring-2 ring-[#ffc53d]/40" style={{ background: NIGHT }}>
        <div className="flex items-center gap-3.5 p-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl" style={{ background: PANEL }}>
            <Mask className="w-11" eyes={PANEL} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-extrabold leading-tight">A masked guest wants to talk</p>
            <p className="mt-1 text-sm leading-snug text-[#cfc6ee]">
              {[invite.area, mode.label, spice.chillies || spice.label].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex gap-2.5 px-4 pb-3">
          <button onClick={() => onAnswer(false)} className="h-12 flex-1 rounded-2xl text-[15px] font-extrabold" style={{ background: PANEL }}>
            Not now
          </button>
          <button onClick={() => onAnswer(true)} className="h-12 flex-[1.4] rounded-2xl text-[15px] font-extrabold" style={{ background: GOLD, color: NIGHT }}>
            Accept ({left}s)
          </button>
        </div>
        <button onClick={onOff} className="block w-full pb-3 text-center text-[13px] font-semibold text-[#b9b0dc]">
          Stop these pop-ups
        </button>
        <div className="h-1 bg-white/10">
          <div className="h-full transition-[width] duration-300 ease-linear" style={{ width: `${(left / total) * 100}%`, background: GOLD }} />
        </div>
      </div>
    </OnTopPage>
  );
}
