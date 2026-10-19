"use client";

import { Mic, MicOff, Phone, PhoneOff, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { useGroupCall, type CallMe, type CallPerson } from "./group-call";

// A little floating pill for the room's voice call. Before you join it shows who's already
// talking and a "Join voice" button; once you're in, everyone's face (glowing while they talk),
// a mute button, a hang-up button and how full the call is.

function Face({ p, size }: { p: CallPerson; size: number }) {
  return (
    <span className="relative shrink-0" title={`${p.me ? "You" : p.name}${p.muted ? " (muted)" : ""}`}>
      <span
        className={cn(
          "block rounded-full transition-[box-shadow,opacity] duration-150",
          p.speaking ? "shadow-[0_0_0_2.5px_#12a37a,0_0_12px_3px_rgb(18_163_122/0.55)]" : "shadow-[0_0_0_2px_#ffffff]",
          !p.connected && "opacity-45",
        )}
      >
        <AvatarFace avatar={cleanAvatar(p.avatar, p.name ?? p.id)} size={size} className="block rounded-full" />
      </span>
      {p.muted && (
        <span className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-hit text-white ring-2 ring-white">
          <MicOff className="size-2" strokeWidth={3} />
        </span>
      )}
      {!p.connected && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <span className="size-3 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
        </span>
      )}
      <span className="sr-only">
        {p.me ? "You" : p.name}
        {p.speaking ? ", talking" : ""}
        {p.muted ? ", muted" : ""}
        {!p.connected ? ", connecting" : ""}
      </span>
    </span>
  );
}

/** What went wrong (mic blocked, call full...), with a ✕ to hide it. */
function CallError({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <p role="alert" className="glass flex max-w-[20rem] items-start gap-1.5 rounded-2xl py-1.5 pl-3 pr-1.5 text-xs font-medium text-hit">
      <span className="min-w-0 flex-1">{text}</span>
      <button type="button" onClick={onClose} aria-label="Close" className="grid size-5 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2">
        <X className="size-3.5" />
      </button>
    </p>
  );
}

export function CallBar({
  room,
  me,
  title = "Voice chat",
  max,
  className,
}: {
  /** The call's room (everyone with the same room string is in the same call), or null for none. */
  room: string | null;
  me: CallMe | null;
  title?: string;
  /** Most people in the call (default 6). */
  max?: number;
  className?: string;
}) {
  const call = useGroupCall(room, me, { max });
  if (!room || !me) return null;
  const count = call.people.length;

  if (!call.joined) {
    const inCall = call.people;
    return (
      <div className={cn("pointer-events-auto flex max-w-full flex-col items-start gap-1", className)}>
        <div className="glass flex h-11 min-w-0 max-w-full items-center gap-2 rounded-full py-1 pl-1.5 pr-1 text-sm">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-me/15 text-me">
            <Phone className="size-4" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <b className="block truncate text-[13px]">{title}</b>
            <span className="block truncate text-[11px] text-muted">
              {call.full ? `Full (${call.max}/${call.max})` : count ? `${count} talking now` : "Nobody's on yet"}
            </span>
          </span>
          {inCall.length > 0 && (
            <span className="flex shrink-0 -space-x-2">
              {inCall.slice(0, 3).map((p) => (
                <AvatarFace key={p.id} avatar={cleanAvatar(p.avatar, p.name ?? p.id)} size={24} className="rounded-full ring-2 ring-white" />
              ))}
            </span>
          )}
          <button
            type="button"
            onClick={() => void call.join()}
            disabled={call.joining || call.full}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-me px-3.5 text-[13px] font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {call.joining ? (
              <>
                <span className="size-3.5 animate-spin rounded-full border-2 border-white/80 border-t-transparent" aria-hidden />
                Joining…
              </>
            ) : (
              <>
                <Mic className="size-4" />
                {call.full ? "Full" : "Join voice"}
              </>
            )}
          </button>
        </div>
        {call.error && (
<CallError text={call.error} onClose={call.clearError} />
        )}
      </div>
    );
  }

  return (
    <div className={cn("pointer-events-auto flex max-w-full flex-col items-start gap-1", className)}>
      <div className="glass flex h-11 min-w-0 max-w-full items-center gap-1.5 rounded-full py-1 pl-2 pr-1 text-sm" aria-label={`${title}: in the call`}>
        <span className="-mx-1 flex min-w-0 items-center gap-1.5 overflow-x-auto px-1 py-1">
          {call.people.map((p) => (
            <Face key={p.id} p={p} size={30} />
          ))}
        </span>
        <span className="shrink-0 px-1 text-[11px] font-semibold tabular-nums text-muted">
          {count}/{call.max}
        </span>
        <button
          type="button"
          onClick={() => call.setMuted(!call.muted)}
          aria-pressed={call.muted}
          aria-label={call.muted ? "Unmute" : "Mute"}
          className={cn("grid size-9 shrink-0 place-items-center rounded-full", call.muted ? "bg-hit text-white" : "bg-panel-2 text-ink")}
        >
          {call.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        </button>
        <button type="button" onClick={() => call.leave()} aria-label="Leave the call" className="grid size-9 shrink-0 place-items-center rounded-full bg-hit text-white">
          <PhoneOff className="size-4" />
        </button>
      </div>
      {call.error && (
<CallError text={call.error} onClose={call.clearError} />
      )}
    </div>
  );
}
