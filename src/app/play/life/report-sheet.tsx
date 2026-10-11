"use client";

import { useState } from "react";
import { Flag, MapPin } from "@/components/icons";
import type { PropertyResult } from "@/lib/world/property-api";
import { REPORT_KINDS, type ReportKind } from "@/lib/world/reports";
import { Sheet } from "../sheet";

/** Report a problem with the map at a spot: what's wrong, and a note. */
export function ReportSheet({ where, pretend, onSend, onClose }: { where: string; pretend?: boolean; onSend: (kind: ReportKind, note: string) => Promise<PropertyResult>; onClose: () => void }) {
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Flag className="size-5" /> Report a problem
        </span>
      }
    >
      <p className="flex items-center gap-1.5 rounded-2xl bg-ink/[0.04] p-3 text-sm">
        <MapPin className="size-4 shrink-0 text-muted" /> {where}
      </p>
      <p className="mt-3 text-sm font-semibold">What&apos;s wrong?</p>
      <div className="mt-2 space-y-1.5">
        {REPORT_KINDS.map((k) => (
          <button
            key={k.kind}
            onClick={() => setKind(k.kind)}
            className={`w-full rounded-2xl px-4 py-2.5 text-left text-sm ${kind === k.kind ? "bg-ink text-white" : "bg-ink/5 hover:bg-ink/10"}`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        rows={3}
        placeholder="Tell us more (optional): which road, what it should look like…"
        className="mt-3 w-full rounded-2xl bg-ink/5 px-4 py-3 text-sm outline-none ring-ink/20 focus:ring-2"
      />
      {error && <p className="mt-2 text-sm text-hit">{error}</p>}
      <button
        disabled={!kind || sending}
        onClick={async () => {
          if (!kind) return;
          setSending(true);
          setError(null);
          const r = await onSend(kind, note);
          setSending(false);
          if (r.ok) onClose();
          else setError(r.error);
        }}
        className="mt-3 h-11 w-full rounded-full bg-ink font-semibold text-white disabled:opacity-40"
      >
        {sending ? "Sending…" : "Send report"}
      </button>
      <p className="mt-2 text-center text-[11px] text-muted">
        {pretend ? "On this test page, reports aren't sent anywhere." : "We check every report against real maps and fix what's wrong. You'll hear back when yours is fixed."}
      </p>
    </Sheet>
  );
}
