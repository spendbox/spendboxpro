"use client";

import { useState, useTransition } from "react";
import { markReport } from "./actions";

export type Report = {
  id: number;
  region: string;
  x: number;
  z: number;
  lat: number;
  lon: number;
  kind: string;
  note: string | null;
  whatThere: string | null;
  status: string;
  reply: string | null;
  at: string;
  by: string;
};
export type Group = { key: string; area: string; region: string; x: number; z: number; lat: number; lon: number; reports: Report[] };

const KIND: Record<string, string> = {
  road: "Road missing or short",
  bridge: "Bridge or flyover",
  building: "Building wrong",
  place: "Place missing or misplaced",
  name: "Name wrong",
  water: "Water or land wrong",
  other: "Something else",
};

/** Reports grouped by place, busiest first, with the buttons to mark them. */
export function ReportList({ groups }: { groups: Group[] }) {
  const [copied, setCopied] = useState(false);
  const text = groups
    .flatMap((g) =>
      g.reports
        .filter((r) => r.status === "open")
        .map((r) => `#${r.id} ${g.area} (tile ${r.x},${r.z}; ${r.lat}, ${r.lon}): ${KIND[r.kind] ?? r.kind}. Map shows: ${r.whatThere ?? "?"}.${r.note ? ` Note: "${r.note}"` : ""}`),
    )
    .join("\n");
  return (
    <div className="flex flex-col gap-4">
      {text && (
        <button
          onClick={() => {
            void navigator.clipboard.writeText(`Please fix these map reports:\n${text}`);
            setCopied(true);
          }}
          className="self-start rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-ink"
        >
          {copied ? "Copied: paste it to Claude" : "Copy the open ones for Claude"}
        </button>
      )}
      {groups.map((g) => (
        <section key={g.key} className="rounded-2xl border border-line bg-panel p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-bold">
              {g.area} <span className="text-sm font-normal text-muted">· {g.reports.length} {g.reports.length === 1 ? "report" : "reports"}</span>
            </h2>
            <div className="flex gap-3 text-sm">
              <a href={`/play?world=${g.region}&at=${g.x},${g.z}`} target="_blank" rel="noreferrer" className="underline">
                See in the game
              </a>
              <a href={`https://www.openstreetmap.org/?mlat=${g.lat}&mlon=${g.lon}#map=18/${g.lat}/${g.lon}`} target="_blank" rel="noreferrer" className="underline">
                Real map
              </a>
            </div>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {g.reports.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Row({ r }: { r: Report }) {
  const [reply, setReply] = useState(r.reply ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const mark = (status: "open" | "fixed" | "wontfix" | "duplicate") =>
    start(async () => {
      const res = await markReport(r.id, status, reply);
      if (!res.ok) setError(res.error ?? "That didn't save.");
    });
  return (
    <li className="rounded-xl bg-panel-2 p-3 text-sm">
      <p className="font-semibold">
        {KIND[r.kind] ?? r.kind} <span className="font-normal text-muted">· {r.by} · {new Date(r.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
      </p>
      {r.note && <p className="mt-1">&ldquo;{r.note}&rdquo;</p>}
      <p className="mt-1 text-xs text-muted">
        The map shows: {r.whatThere ?? "?"} · tile {r.x},{r.z}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={300} placeholder="Note to the reporter (optional)" className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 py-1" />
        {r.status === "open" ? (
          <>
            <button disabled={pending} onClick={() => mark("fixed")} className="rounded-lg bg-me px-3 py-1 font-semibold text-white disabled:opacity-50">
              Fixed
            </button>
            <button disabled={pending} onClick={() => mark("wontfix")} className="rounded-lg border border-line px-3 py-1 disabled:opacity-50">
              Won&apos;t fix
            </button>
            <button disabled={pending} onClick={() => mark("duplicate")} className="rounded-lg border border-line px-3 py-1 disabled:opacity-50">
              Duplicate
            </button>
          </>
        ) : (
          <>
            <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs">{r.status === "wontfix" ? "Won't fix" : r.status[0].toUpperCase() + r.status.slice(1)}</span>
            <button disabled={pending} onClick={() => mark("open")} className="text-xs underline disabled:opacity-50">
              Open again
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-hit">{error}</p>}
    </li>
  );
}
