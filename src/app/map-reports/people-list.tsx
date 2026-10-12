"use client";

import { useState, useTransition } from "react";
import { PERSON_REPORT_KINDS } from "@/lib/world/reports";
import { markPersonReport } from "./actions";

/** A report about a person, as the owner's page lists it. */
export type PersonReport = {
  id: number;
  aboutUser: string | null;
  aboutNpc: string | null;
  name: string;
  kind: string;
  note: string | null;
  place: string | null;
  status: "open" | "actioned" | "dismissed";
  at: string;
  by: string;
};

const KIND_LABEL = Object.fromEntries(PERSON_REPORT_KINDS.map((k) => [k.kind, k.label]));

/** Reports about players and characters, newest first, each with Actioned and Dismiss. */
export function PeopleList({ reports }: { reports: PersonReport[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const mark = (id: number, status: PersonReport["status"]) =>
    start(async () => {
      const r = await markPersonReport(id, status);
      setError(r.ok ? null : (r.error ?? "That didn't save."));
    });
  return (
    <ul className="space-y-2">
      {error && <li className="text-sm text-hit">{error}</li>}
      {reports.map((r) => (
        <li key={r.id} className="rounded-2xl bg-panel p-4 shadow-sm ring-1 ring-ink/5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold">
              {r.name} <span className="text-xs font-normal text-muted">{r.aboutNpc ? "a character" : "a player"}</span>
            </p>
            <span className="text-xs text-muted">{new Date(r.at).toLocaleString("en-GB")}</span>
          </div>
          <p className="mt-1 text-sm">{KIND_LABEL[r.kind] ?? r.kind}</p>
          {r.note && <p className="mt-1 text-sm text-muted">&ldquo;{r.note}&rdquo;</p>}
          <p className="mt-1 text-xs text-muted">
            By {r.by}
            {r.place ? ` · at ${r.place}` : ""}
            {r.aboutUser ? ` · account ${r.aboutUser}` : r.aboutNpc ? ` · ${r.aboutNpc}` : ""}
          </p>
          <div className="mt-2 flex gap-2">
            {r.status === "open" ? (
              <>
                <button disabled={pending} onClick={() => mark(r.id, "actioned")} className="h-8 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50">
                  Actioned
                </button>
                <button disabled={pending} onClick={() => mark(r.id, "dismissed")} className="h-8 rounded-full bg-ink/5 px-3 text-xs font-semibold disabled:opacity-50">
                  Dismiss
                </button>
              </>
            ) : (
              <button disabled={pending} onClick={() => mark(r.id, "open")} className="h-8 rounded-full bg-ink/5 px-3 text-xs font-semibold disabled:opacity-50">
                {r.status === "actioned" ? "Actioned" : "Dismissed"} · open again
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
