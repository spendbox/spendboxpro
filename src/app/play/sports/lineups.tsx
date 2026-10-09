"use client";

import { fighterProfile, formGuide, teamProfile } from "@/lib/sports/teams";
import type { MatchInfo, Side } from "@/lib/sports/types";

// Before kick-off: the two line-ups (football, basketball) or the tale of the tape (boxing,
// wrestling). All public: it comes from the teams' and fighters' names.

function Form({ form }: { form: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Last five: ${form}`}>
      {form.split("").map((r, i) => (
        <span
          key={i}
          className="grid size-4 place-items-center rounded text-[9px] font-bold text-white"
          style={{ background: r === "W" ? "#12a37a" : r === "D" ? "#8b95a1" : "#e5484d" }}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

function Chip({ side }: { side: Side }) {
  return (
    <span
      className="inline-block size-3 shrink-0 rounded-full ring-2 ring-white"
      style={{ background: side.colour, boxShadow: `0 0 0 3px ${side.colour2}` }}
    />
  );
}

function TeamList({ match, side, home }: { match: MatchInfo; side: Side; home: boolean }) {
  const sport = match.sport === "football" ? "football" : "basketball";
  const p = teamProfile(sport, side.name);
  const starters = sport === "football" ? 11 : 5;
  return (
    <div className="min-w-0 flex-1 rounded-2xl bg-panel-2 p-3">
      <div className="flex items-center gap-2">
        <Chip side={side} />
        <span className="min-w-0 truncate text-sm font-bold">{side.name}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        {sport === "football" && <span className="font-semibold">{p.formation}</span>}
        <Form form={formGuide(match.sport, side.name, match.slot)} />
        {home && <span>Home</span>}
      </div>
      <ol className="mt-2 space-y-0.5 text-xs">
        {side.roster.slice(0, starters).map((name, i) => (
          <li key={name} className="flex items-center gap-1.5">
            <span
              className="grid h-4 min-w-5 place-items-center rounded px-0.5 text-[10px] font-bold"
              style={{ background: side.colour, color: side.colour2 }}
            >
              {p.numbers[i]}
            </span>
            <span className="min-w-0 truncate">{name}</span>
            <span className="ml-auto shrink-0 text-[10px] text-muted">{p.roles[i]}</span>
          </li>
        ))}
      </ol>
      {side.roster.length > starters && (
        <p className="mt-2 text-[11px] leading-snug text-muted">
          <span className="font-semibold">Bench: </span>
          {side.roster
            .slice(starters)
            .map((n) => n.slice(n.indexOf(" ") + 1))
            .join(", ")}
        </p>
      )}
    </div>
  );
}

function Tape({ match }: { match: MatchInfo }) {
  const sport = match.sport === "boxing" ? "boxing" : "wrestling";
  const a = fighterProfile(sport, match.home.name);
  const b = fighterProfile(sport, match.away.name);
  const rows: [string, string, string][] =
    sport === "boxing"
      ? [
          ["Record", a.record, b.record],
          ["From", a.hometown, b.hometown],
          ["Height", `${a.heightCm} cm`, `${b.heightCm} cm`],
          ["Reach", `${a.reachCm} cm`, `${b.reachCm} cm`],
          ["Stance", a.stance, b.stance],
          ["Style", a.style, b.style],
          ["Best shot", a.signature, b.signature],
        ]
      : [
          ["From", a.hometown, b.hometown],
          ["Weight", `${a.weightKg} kg`, `${b.weightKg} kg`],
          ["Style", a.style, b.style],
          ["Signature", a.signature, b.signature],
          ["Finisher", a.finisher, b.finisher],
        ];
  return (
    <div className="rounded-2xl bg-panel-2 p-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <div className="flex min-w-0 flex-col items-center gap-1">
          <Chip side={match.home} />
          <span className="text-sm font-bold leading-tight">{match.home.name}</span>
          <Form form={formGuide(match.sport, match.home.name, match.slot)} />
        </div>
        <span className="text-xs font-bold text-muted">VS</span>
        <div className="flex min-w-0 flex-col items-center gap-1">
          <Chip side={match.away} />
          <span className="text-sm font-bold leading-tight">{match.away.name}</span>
          <Form form={formGuide(match.sport, match.away.name, match.slot)} />
        </div>
      </div>
      <dl className="mt-3 space-y-1 text-xs">
        {rows.map(([label, x, y]) => (
          <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <dd className="text-right font-semibold capitalize">{x}</dd>
            <dt className="w-16 text-center text-[10px] uppercase tracking-wide text-muted">{label}</dt>
            <dd className="font-semibold capitalize">{y}</dd>
          </div>
        ))}
      </dl>
      {sport === "wrestling" && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] italic text-muted">
          <p className="text-right">{a.record}</p>
          <p>{b.record}</p>
        </div>
      )}
    </div>
  );
}

export function Lineups({ match }: { match: MatchInfo }) {
  if (match.sport === "boxing" || match.sport === "wrestling") return <Tape match={match} />;
  return (
    <div className="flex gap-2">
      <TeamList match={match} side={match.home} home />
      <TeamList match={match} side={match.away} home={false} />
    </div>
  );
}
