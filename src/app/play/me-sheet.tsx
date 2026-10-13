"use client";

import { AvatarFace } from "@/components/avatar";
import { Star } from "@/components/icons";
import type { Avatar } from "@/lib/avatar";
import { Sheet } from "./sheet";

// You (tap your face, top left, on the real map): everything that used to be an app on the phone
// and isn't chat, in a few short groups. Chat, alerts and news live in the chat bubble instead.

export type MeItem = { label: string; icon: React.ComponentType<{ className?: string }>; colour: string; go: () => void; badge?: number };

export function MeSheet({ name, avatar, reputation, groups, onClose }: { name: string; avatar: Avatar; reputation: number | null; groups: { title: string; items: MeItem[] }[]; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} above>
      <div className="flex items-center gap-3 pr-8">
        <AvatarFace avatar={avatar} size={56} className="shrink-0 rounded-full" />
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl font-extrabold">{name}</h2>
          {reputation !== null && (
            <p className="flex items-center gap-1 text-xs font-semibold text-gold-dark">
              <Star className="size-3.5" /> Reputation {reputation.toLocaleString("en-GB")}
            </p>
          )}
        </div>
      </div>
      {groups.map((g) => (
        <section key={g.title} className="mt-4">
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">{g.title}</h3>
          <div className="grid grid-cols-4 gap-2">
            {g.items.map((it) => (
              <button
                key={it.label}
                onClick={() => {
                  onClose();
                  it.go();
                }}
                className="relative flex flex-col items-center gap-1 rounded-2xl p-1.5 text-center hover:bg-ink/5"
              >
                <span className="grid size-11 place-items-center rounded-2xl text-white shadow-sm" style={{ background: it.colour }}>
                  <it.icon className="size-5" />
                </span>
                <span className="text-[11px] font-semibold leading-tight">{it.label}</span>
                {!!it.badge && (
                  <span className="absolute right-1 top-0.5 grid min-w-5 place-items-center rounded-full bg-hit px-1 text-[10px] font-bold text-white">{it.badge > 9 ? "9+" : it.badge}</span>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </Sheet>
  );
}
