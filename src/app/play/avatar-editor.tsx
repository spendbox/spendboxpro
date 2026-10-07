"use client";

import { useState } from "react";
import { AvatarFace } from "@/components/avatar";
import { AVATAR_PARTS, BG, HAIR_COLOR, SKIN, TOP_COLOR, type Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { saveAvatar } from "./profile-actions";
import { Sheet } from "./sheet";

type Key = keyof Avatar;
const TABS: { key: Key; label: string; colors?: string[] }[] = [
  { key: "skin", label: "Skin", colors: SKIN },
  { key: "hair", label: "Hair" },
  { key: "hairColor", label: "Hair colour", colors: HAIR_COLOR },
  { key: "eyes", label: "Eyes" },
  { key: "brows", label: "Brows" },
  { key: "mouth", label: "Mouth" },
  { key: "beard", label: "Facial hair" },
  { key: "glasses", label: "Glasses" },
  { key: "earrings", label: "Earrings" },
  { key: "top", label: "Outfit" },
  { key: "topColor", label: "Outfit colour", colors: TOP_COLOR },
  { key: "bg", label: "Background", colors: BG },
];

const NAMES: Partial<Record<Key, string[]>> = {
  hair: AVATAR_PARTS.hair,
  eyes: AVATAR_PARTS.eyes,
  brows: AVATAR_PARTS.brows,
  mouth: AVATAR_PARTS.mouth,
  beard: AVATAR_PARTS.beard,
  glasses: AVATAR_PARTS.glasses,
  earrings: AVATAR_PARTS.earrings,
  top: AVATAR_PARTS.top,
};

/** Design your face: pick a part, then a style or colour. Saves to your profile. */
export function AvatarEditor({ initial, onClose, onSaved }: { initial: Avatar; onClose: () => void; onSaved: () => void }) {
  const [a, setA] = useState<Avatar>(initial);
  const [tab, setTab] = useState<Key>("skin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = TABS.find((t) => t.key === tab)!;
  const options = current.colors ?? NAMES[tab] ?? [];

  function randomise() {
    const r = (n: number) => Math.floor(Math.random() * n);
    setA({
      skin: r(SKIN.length),
      hair: r(AVATAR_PARTS.hair.length),
      hairColor: r(HAIR_COLOR.length),
      eyes: r(AVATAR_PARTS.eyes.length),
      brows: r(AVATAR_PARTS.brows.length),
      mouth: r(AVATAR_PARTS.mouth.length),
      beard: Math.random() < 0.3 ? r(AVATAR_PARTS.beard.length) : 0,
      glasses: Math.random() < 0.3 ? r(AVATAR_PARTS.glasses.length) : 0,
      top: r(AVATAR_PARTS.top.length),
      topColor: r(TOP_COLOR.length),
      bg: r(BG.length),
      earrings: Math.random() < 0.3 ? r(AVATAR_PARTS.earrings.length) : 0,
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveAvatar(a);
    setBusy(false);
    if (res.ok) onSaved();
    else setError(res.error);
  }

  return (
    <Sheet onClose={onClose} wide>
      <div className="flex items-center gap-4">
        <AvatarFace avatar={a} size={112} className="shrink-0 rounded-full shadow-lg" />
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold">Your look</h2>
          <p className="text-sm text-muted">Other players see this in chat, on the scoreboard and when you&apos;re caught.</p>
          <button onClick={randomise} className="mt-2 rounded-lg bg-panel-2 px-3 py-1.5 text-sm font-medium">
            🎲 Surprise me
          </button>
        </div>
      </div>
      <div className="-mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", tab === t.key ? "bg-ink text-white" : "bg-panel-2")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={cn("mt-3 grid gap-2", current.colors ? "grid-cols-8" : "grid-cols-3")}>
        {options.map((opt, i) =>
          current.colors ? (
            <button
              key={opt}
              onClick={() => setA({ ...a, [tab]: i })}
              className={cn("aspect-square rounded-full border-2", a[tab] === i ? "border-ink" : "border-transparent")}
              style={{ background: opt }}
              aria-label={`${current.label} ${i + 1}`}
            />
          ) : (
            <button
              key={opt}
              onClick={() => setA({ ...a, [tab]: i })}
              className={cn("flex flex-col items-center gap-1 rounded-xl border p-1.5 text-[11px]", a[tab] === i ? "border-ink bg-panel-2" : "border-line")}
            >
              <AvatarFace avatar={{ ...a, [tab]: i }} size={48} />
              {opt}
            </button>
          ),
        )}
      </div>
      {error && <p className="mt-2 text-sm text-hit">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
          Cancel
        </button>
        <button onClick={save} disabled={busy} className="flex-1 rounded-xl bg-gold py-2.5 font-semibold disabled:opacity-50">
          {busy ? "Saving…" : "Save my look"}
        </button>
      </div>
    </Sheet>
  );
}
