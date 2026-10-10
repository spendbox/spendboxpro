"use client";

import { useEffect, useState } from "react";
import { Swords } from "lucide-react";
import { playSfx } from "../sound";
import { cleanPlayer, useActivityRoom, type ActivityMsg } from "../activities/hub";
import { Face } from "../activities/ui";
import { MINIGAME_BY_ID } from "./registry";
import type { Invite, PlayCtx } from "./shell";
import type { MiniGameDef } from "./types";

// Someone in the same place (or with Games open in town) challenged you to a game: a pop-up to
// say yes (you play on your own phone) or no. It goes away by itself after 30 seconds.

export function MinigameInvites({ ctx, onAccept }: { ctx: PlayCtx; onAccept: (def: MiniGameDef, invite: Invite) => void }) {
  const [invite, setInvite] = useState<(Invite & { def: MiniGameDef }) | null>(null);
  const me = ctx.me;
  const room = useActivityRoom(ctx.roundId, ctx.roomId ?? "arcade", me, {
    onMessage: (m: ActivityMsg) => {
      if (m.t !== "mg_invite" || !me || m.to !== me.id) return;
      const def = MINIGAME_BY_ID.get(m.game);
      const from = cleanPlayer(m.from);
      if (!def || !from || typeof m.seed !== "number" || typeof m.cid !== "string") return;
      playSfx("chime");
      setInvite({ cid: m.cid.slice(0, 40), game: def.id, seed: m.seed >>> 0, from, seats: typeof m.seats === "number" ? Math.max(2, Math.min(def.seats?.[1] ?? 2, m.seats)) : undefined, def });
    },
  });
  useEffect(() => {
    if (!invite) return;
    const id = window.setTimeout(() => setInvite(null), 30_000);
    return () => window.clearTimeout(id);
  }, [invite]);

  if (!invite || !me) return null;
  return (
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-3">
      <div className="act-pop flex w-full max-w-sm items-center gap-3 rounded-3xl bg-ink p-3 text-white shadow-2xl">
        <Face p={invite.from} size={44} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-xs font-semibold text-white/70">
            <Swords className="size-3.5" /> Challenge!
          </p>
          <p className="truncate text-sm font-bold">
            {invite.from.name}: {invite.def.title}
          </p>
        </div>
        <button
          onClick={() => {
            room.send({ t: "mg_reply", cid: invite.cid, from: me, ok: false });
            setInvite(null);
          }}
          className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold"
        >
          No
        </button>
        <button
          onClick={() => {
            const { def, ...inv } = invite;
            setInvite(null);
            onAccept(def, inv);
          }}
          className="rounded-xl bg-me px-3 py-2 text-xs font-bold"
        >
          Play
        </button>
      </div>
    </div>
  );
}
