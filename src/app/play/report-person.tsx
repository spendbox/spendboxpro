"use client";

import { useState } from "react";
import { Flag } from "@/components/icons";
import { cn } from "@/lib/cn";
import { PERSON_REPORT_KINDS, type PersonReportKind } from "@/lib/world/reports";
import { reportPerson } from "./report-actions";
import { Sheet } from "./sheet";

// Report a person (a player or a character): a small flag button next to their Hug and Shake
// buttons, or on a character's card, that opens what's wrong and a note. The owner reads the
// reports with the map ones (game-db/049_reports_and_work.sql).

export function ReportPersonButton({
  person,
  place,
  compact,
  onDone,
  className,
}: {
  /** A player's account id, or a character's "npc:<id>". */
  person: { id: string; name: string };
  /** Where you both are, when known. */
  place?: string;
  compact?: boolean;
  onDone?: (text: string, ok: boolean) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PersonReportKind | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = `Report ${person.name}`;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex shrink-0 items-center justify-center gap-1 rounded-full bg-ink/5 font-semibold text-muted hover:bg-ink/10 hover:text-ink",
          compact ? "size-7" : "px-2.5 py-1.5 text-xs",
          className,
        )}
        aria-label={label}
        title={label}
      >
        <Flag className="size-3.5" aria-hidden />
        {!compact && "Report"}
      </button>
      {open && (
        <Sheet
          above
          onClose={() => setOpen(false)}
          title={
            <span className="flex items-center gap-2">
              <Flag className="size-5" /> {label}
            </span>
          }
        >
          <p className="text-sm text-muted">Only the Newtown team sees this. {person.name} isn&apos;t told who reported them.</p>
          <div className="mt-3 space-y-1.5">
            {PERSON_REPORT_KINDS.map((k) => (
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
            placeholder="Tell us more (optional): what happened, and when"
            className="mt-3 w-full rounded-2xl bg-ink/5 px-4 py-3 text-sm outline-none ring-ink/20 focus:ring-2"
          />
          {error && <p className="mt-2 text-sm text-hit">{error}</p>}
          <button
            disabled={!kind || sending}
            onClick={async () => {
              if (!kind) return;
              setSending(true);
              setError(null);
              const r = await reportPerson({ id: person.id, name: person.name, kind, note, place });
              setSending(false);
              if (!r.ok) return setError(r.error);
              setOpen(false);
              setKind(null);
              setNote("");
              onDone?.(`Thanks. We'll look into ${person.name}.`, true);
            }}
            className="mt-3 h-11 w-full rounded-full bg-ink font-semibold text-white disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send report"}
          </button>
        </Sheet>
      )}
    </>
  );
}
